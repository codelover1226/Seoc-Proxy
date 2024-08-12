const cheerio = require('cheerio');
const process = require('process');
const zlib = require('zlib');
const querystring = require("querystring");
const utils = require('../../api/Utils');
const webClient = require("../../api/WebClient").create(true);
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const servicesDetails = require("../../api/ServicesDetails");
const loginAgent = require("./LoginAgent").create();


const SERVICE_MAIN_DOMAIN = 'onehourindexing.co';
const SERVICE_ROOT_DOMAIN = 'onehourindexing.co';
const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};

module.exports = async function (request, reply) {
    if (/^\/do-auto-login$/.test(request.url)) {
        await internals.doAutoLogin(loginAgent, reply, request.seocromom.globalParams.onehourindexingUsername, request.seocromom.globalParams.onehourindexingPassword);
        return true;
    } else if (loginAgent.isInLockMode()) {
        return reply.send("Please a connection is already underway. Retry in a few minutes.");
    }

    let targetedUrl = request.url;
    let targetedHost = SERVICE_MAIN_DOMAIN;
    let portNumber = 443;
    let refererUrl = "";

    if (typeof request.headers['referer'] !== 'undefined') {
        refererUrl = handlerHelpers.getRealReferer(targetedHost, request.seocromom.currentDomain, request.headers['referer']);
    }

    if (handlerHelpers.urlContainsOriginalHost(request.url)) {
        targetedUrl = handlerHelpers.removeOriginalHost(request.url);
        targetedUrl = handlerHelpers.removeVarFromUrl(targetedUrl, "_mcop-scope");
        targetedHost = handlerHelpers.extractOriginalHost(request.url);
        if (handlerHelpers.containsPortNumber(targetedHost)) {
            portNumber = handlerHelpers.extractPortNumber(targetedHost);
            targetedHost = handlerHelpers.stripPortNumber(targetedHost);
        }
    } else {
        if (handlerHelpers.urlContainsOriginalHost(request.headers['referer'] + "")) {
            targetedHost = handlerHelpers.extractOriginalHost(request.headers['referer'] + "");
        }
    }

    const realFullUrl = "https://" + targetedHost + targetedUrl;
    const requestFullUrl = "https://" + request.seocromom.currentDomain + request.url;

    const serviceDomainRegExp = new RegExp(SERVICE_ROOT_DOMAIN.replace(/\./, "\."));

    //we get current user only for non static resources requested on www.spyfu.com
    if (! utils.isStaticRes(request.url)) {

        if (serviceDomainRegExp.test(targetedHost)) {

            if (typeof request.seocromom !== 'object' ||
                typeof request.seocromom.currentUser !== 'object') {
                return reply.send("Please connect");
            } else {
                if (request.seocromom.currentUser.role !== 'admin' && internals.isForbiddenUrl(request.url)) {
                    reply.header('location', servicesDetails.onehourindexing.homeUrl);
                    reply.code(302);
                    return reply.send("Redirecting...");
                }
            }
        }
    }


    const excludedHeaders = [
        "cookie","user-agent","sec-ch-ua","sec-ch-ua-mobile","sec-ch-ua-platform",
        "sec-fetch-user","upgrade-insecure-requests","host",
        "connection","pragma","accept-language","accept-encoding"
    ];

    const someHeadersValue = {
        'origin': "https://" + SERVICE_MAIN_DOMAIN,
        'referer': refererUrl
    };

    const allowedRequestHeaders = handlerHelpers.filterRequestHeaders(request.headers, excludedHeaders, someHeadersValue);
    if (typeof request.headers['origin'] !== "undefined") {
        allowedRequestHeaders['origin'] = "https://" + SERVICE_MAIN_DOMAIN;
    }

    allowedRequestHeaders["user-agent"] = utils.randomUserAgent(0);

    let appCookiesModel = false;
    if (! utils.isStaticRes(request.url)) {
        appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.onehourindexing.name}).exec();
        if (appCookiesModel)
            cookiesManager.setOldCookies(appCookiesModel.cookies);

        const allCookies = cookiesManager.getAsString(targetedHost);
        if (allCookies.length > 0) {
            allowedRequestHeaders["cookie"] = allCookies;
        }
    }

    let requestData = '';
    if (/post|put|patch/i.test(request.method)) {
        requestData = request.seocromom['requestBody'];
        if (typeof requestData === 'string') {
            const domainRegExp = new RegExp(request.seocromom.currentDomain, "mg");
            const encodedDomainRegExp = new RegExp(querystring.escape(request.seocromom.currentDomain), "mg");
            const mcoppRegExp = new RegExp(querystring.escape('__mcopp="1"'), "mg");

            requestData = requestData.replace(domainRegExp, targetedHost).replace(new RegExp(handlerHelpers.MCOP_LOCATION_STR, 'mg'), "location");
            requestData = requestData.replace(domainRegExp, targetedHost);
            requestData = requestData.replace(encodedDomainRegExp, targetedHost);
            requestData = requestData.replace(mcoppRegExp, '');
            allowedRequestHeaders["content-length"] = Buffer.byteLength(requestData);
        }
    }

    let serverRes = undefined;

    const threeMinutes = 180000;
    webClient.setTimeout(threeMinutes);
    webClient.acceptUnverifiedSslCertificates();

    if (typeof portNumber !== 'undefined')
        webClient.setPort(portNumber);

    //Send request to remote server as a client
    await webClient.sendRequest(request.method, targetedHost, targetedUrl, allowedRequestHeaders, requestData).then(function (serverResponse) {
        serverRes = serverResponse;
    });

    let body = "";
    let respData;
    let receivedData = serverRes.body;
    const statusCode = serverRes.statusCode;

    const headersToBlock = [
        'set-cookie', 'content-encoding', 'access-control-allow-origin', 'content-security-policy',
        'transfer-encoding', 'content-security-policy-report-only', 'x-frame-options'
    ];

    let regExpStr = "";
    const lastIndex = headersToBlock.length - 1;
    for (let i = 0; i < headersToBlock.length; i++) {
        if (i < lastIndex) {
            regExpStr += headersToBlock[i] + "|";
        } else {
            regExpStr += headersToBlock[i];
        }
    }

    const skippedHeaderRegExp = new RegExp(regExpStr);
    for (let name in serverRes.headers) {
        if (! skippedHeaderRegExp.test(name + "")) {
            reply.header(name, serverRes.headers[name]);
        }
    }

    if (typeof serverRes.headers['set-cookie'] !== "undefined" && ! utils.isStaticRes(request.url)) {
        const check = cookiesManager.merge(serverRes.headers['set-cookie'], SERVICE_MAIN_DOMAIN);
        if (appCookiesModel) {
            await AppCookiesListModel.updateOne({_id: appCookiesModel._id},
                {
                    name: servicesDetails.onehourindexing.name,
                    cookies: cookiesManager.getAllAsObject(),
                    changeDate: Date.now()
                });
        } else {
            await AppCookiesListModel.create({
                name: servicesDetails.onehourindexing.name,
                cookies: cookiesManager.getAllAsObject(),
            });
        }
    }

    if (typeof serverRes.headers['location'] !== "undefined") {
        if (/\/account\/logout/.test(request.url + "") && request.seocromom['currentUser'].role === "admin") {
            await AppCookiesListModel.deleteMany({name: servicesDetails.onehourindexing.name});
            reply.header('location', servicesDetails.onehourindexing.homeUrl);
            reply.code(302);
            return reply.send("Redirecting...");
        }

        if (/\/login/.test(serverRes.headers['location']) && ! utils.isStaticRes(request.url)) {
            return reply.view("auto-login.pug");
        }


        let redirectUrl = serverRes.headers['location'];
        if (/^\//.test(redirectUrl)) {
            redirectUrl = `https://${targetedHost}${redirectUrl}`;
        }
        const newLocation = handlerHelpers.modifyUrl(redirectUrl, request.seocromom.currentDomain);
        reply.header('location', newLocation);
        reply.code(statusCode);
        return reply.send("Redirecting...");
    }

    let isEncoded = false;
    body = Buffer.concat(receivedData);

    if (receivedData.length > 0) {
        if (/gzip/i.test(serverRes.headers['content-encoding'] + "")) {
            body = utils.unzip(body);
            isEncoded = true;
        } else if (/deflate/i.test(serverRes.headers['content-encoding'] + "")) {
            body = utils.inflate(body);
            isEncoded = true;
        } else if (/br/i.test(serverRes.headers['content-encoding'] + "")) {
            body = utils.brotliDecompress(body);
            isEncoded = true;
        }
    }

    //Remove useless parts from web pages before they're served
    if (handlerHelpers.mimeIsHtml(serverRes.headers['content-type'] + '')) {

        body = body.toString();
        body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
        body = handlerHelpers.injectPageBase(body, requestFullUrl, realFullUrl);

        const $ = cheerio.load(body);
        body = internals.removeInlineContentSecurityPolicy($);
        body = internals.removeUselessParts($, request);

        if (internals.notConnected($) && serviceDomainRegExp.test(targetedHost)  && ! utils.isStaticRes(request.url)) {
            return reply.view("auto-login.pug");
        }
    } else if (handlerHelpers.mimeIsJs(serverRes.headers['content-type'] + "")) {
        if (typeof serverRes.headers['content-type'] === "undefined") {
            reply.header("content-type", 'application/javascript');
        }

        body = body.toString();
        try {
            let temp = body;
            temp = handlerHelpers.replacePostMessageAndLocation(temp);
            body = temp;
        } catch (error) {
            await utils.writeToLog(request.url);
            await utils.writeToLog(error);
        }
    }

    return reply.code(statusCode).send(body);
};

internals.removeInlineContentSecurityPolicy = function($) {
    const metaElts = $("meta");
    metaElts.each(function () {
        const current = $(this);
        if (/Content-Security-Policy/i.test(current.attr("http-equiv"))) {
            current.remove();
        }
    });

    return $.html();
};

internals.doAutoLogin = async function(loginAgent, res, username, password) {
    let respData = '';
    await loginAgent.connect(username, password)
        .then(function (msg) {
            respData = JSON.stringify({
                status:"connected",
                message: `A session has been created you will be redirected in few seconds. You can click <a href="/">here</a> to do it on your own.`
            });
        }).catch(function (errorMsg) {
            respData = JSON.stringify({
                status:"failed",
                message:errorMsg
            });
        });
    res.header('content-type', 'application/json');
    return res.send(respData);
};

internals.isForbiddenUrl = function(url) {
    return typeof url !== "string" || url === '/' ||
        /\/logout/.test(url) || /\/faqs/.test(url) || /\/tryit/.test(url) || /\/plans/.test(url) || /\/billing/.test(url);
};

internals.removeUselessParts = function($, req) {
    const anchors = $('a');
    const links = $('link');
    const paragraphs = $('p');
    const scripts = $('script');
    const images = $('img');
    const forms = $('form');
    const iframes = $('iframe');
    const localUrl = "https://" + req.seocromom.currentDomain;

    const mainParentBlock = $('#crawl-vs-uploads').parent().parent().parent();
    mainParentBlock.find('div.row').eq(1).remove();

    forms.each(function () {
        const action = $(this).attr("action");
        if (typeof action !== "undefined") {
            $(this).attr("action", handlerHelpers.modifyUrl(action, req.seocromom.currentDomain));
            $(this).attr("__mcopp", '1');
        }
    });

    iframes.each(function () {
        const src = $(this).attr("src");
        //console.log(src);
        if (typeof src !== "undefined") {
            //utils.writeToLog("iframe url: " + src);
            $(this).attr("src", handlerHelpers.modifyUrl(src, req.seocromom.currentDomain));
            $(this).attr("__mcopp", '1');
        }

        $(this).removeAttr("integrity");
    });

    return $.html();
};

internals.notConnected = function($) {
    return $("a[href*='login']").length > 0;
};