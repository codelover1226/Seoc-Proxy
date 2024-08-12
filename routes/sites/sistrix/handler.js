const process = require('process');
const zlib = require('zlib');
const querystring = require("querystring");
const btoa = require('btoa');
const atob = require('atob');
const cheerio = require('cheerio');

const utils = require('../../api/Utils');
const webClient = require("../../api/WebClient").create(true);
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const servicesDetails = require("../../api/ServicesDetails");
const loginAgent = require("./LoginAgent").create();


const SERVICE_MAIN_DOMAIN = 'app.sistrix.com';
const SERVICE_ROOT_DOMAIN = 'sistrix.com';
const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const COOKIES_FILE_PATH = __dirname + "/session/cookies.json";
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};

module.exports = async function (request, reply) {

    if (/^\/do-auto-login$/.test(request.url)) {
        await internals.doAutoLogin(loginAgent, reply, request.seocromom.globalParams.sistrixUsername, request.seocromom.globalParams.sistrixPassword);
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

    //we get current user only for non static resources
    if (! utils.isStaticRes(request.url)) {

        if (serviceDomainRegExp.test(targetedHost)) {

            if (typeof request.seocromom !== 'object' ||
                typeof request.seocromom.currentUser !== 'object') {
                return reply.send("Please connect");
            } else {
                if (request.seocromom.currentUser.role !== 'admin' && internals.isForbiddenUrl(request.url)) {
                    reply.header('location', servicesDetails.sistrix.homeUrl);
                    return reply.status(302).send("Redirecting...");
                }
            }
        }
    }


    const excludedHeaders = [
        "cookie","user-agent","sec-ch-ua","sec-ch-ua-mobile","sec-ch-ua-platform",
        "sec-fetch-user","upgrade-insecure-requests","host",
        "connection","pragma","accept-language", "accept-encoding"
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
        appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.sistrix.name}).exec();
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

        await AppCookiesListModel.findOneAndUpdate(
            {name: servicesDetails.sistrix.name},
            {cookies: cookiesManager.getAllAsObject()},
            {new:true, upsert: true}
        );
    }

    if (typeof serverRes.headers['location'] !== "undefined") {
        if (/\/login/.test(serverRes.headers['location']) && ! utils.isStaticRes(request.url)) {
            //return reply.view("auto-login.pug");
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

    if (handlerHelpers.shouldBeDecompressed(serverRes.headers['content-type'])) {
        if (receivedData.length > 0) {
            if (/gzip/i.test(serverRes.headers['content-encoding'] + "")) {
                body = await utils.gunzip(body);
                isEncoded = true;
            } else if (/deflate/i.test(serverRes.headers['content-encoding'] + "")) {
                body = await utils.inflate(body);
                isEncoded = true;
            } else if (/br/i.test(serverRes.headers['content-encoding'] + "")) {
                body = await utils.brotliDecompress(body);
                isEncoded = true;
            }
        }
    } else {
        if (typeof serverRes.headers['content-encoding'] !== 'undefined')
            reply.header('content-encoding', serverRes.headers['content-encoding']);
    }

    if (/\/sso\/logout/.test(request.url + "") && request.seocromom['currentUser'].role === "admin") {
        await cookiesManager.empty();
    }

    //Remove useless parts from web pages before they're served
    if (handlerHelpers.mimeIsHtml(serverRes.headers['content-type'] + '')) {

        body = body.toString();
        if (body.length > 0) {
            body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/javascripts/cust-sistrix.js");
            body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
            body = handlerHelpers.injectPageBase(body, requestFullUrl, realFullUrl);


            const $ = cheerio.load(body);
            body = internals.removeInlineContentSecurityPolicy($);
            body = internals.removeUselessParts($, request);

            if (internals.notConnected(body) && serviceDomainRegExp.test(targetedHost) && ! utils.isStaticRes(request.url)) {
                //return reply.view("auto-login.pug");
            }
        }
    } else if (handlerHelpers.isXml(body)) {
        body = await internals.injectScriptInXml(body, request);
    } else if (handlerHelpers.mimeIsJs(serverRes.headers['content-type'] + "") || /\.js/.test(request.url)) {
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

    reply.header('content-length', Buffer.byteLength(body));
    return reply.status(statusCode).send(body);
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
    return typeof url !== "string" || url === "/" ||
        /\/account\/(settings|users|modules|invoices|google|labs|learning-hub|shortlinks|pins|watchlist|downloads|alerts|api)/.test(url)
        || /\/sistrix\/logout/.test(url) || /\/sistrix\/upgrade/.test(url)
        || /\/amazon\/index\/country\/de/.test(url);
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

    scripts.each(function () {
        const src = $(this).attr("src");
        const xlinkHref = $(this).attr("xlink:href");
        $(this).removeAttr("nonce");

        if (typeof src === "undefined") {
            //$(this).attr("src", handlerHelpers.modifyUrl(src, localHost));
            let jsCode = $(this).html();

            try {
                jsCode = handlerHelpers.replaceLocationInJsCode(jsCode);
                jsCode = handlerHelpers.replacePostMessage(jsCode);
            } catch (error) {
                utils.writeToLog("Failed to parse code \n" + jsCode);
            }
            //jsCode = 'console.log(_mcopLocation);' + jsCode;
            $(this).html(jsCode);
        } else {
            if (/^\/\//.test(src)) {
                $(this).attr('src', `https:${src}`);
                $(this).attr("__mcopp", '1');
            } else if (/^\//.test(src)) {
                $(this).attr('src', `https://${SERVICE_MAIN_DOMAIN}${src}`);
                $(this).attr("__mcopp", '1');
            }
        }

        if (typeof xlinkHref === "undefined") {
            $(this).attr("xlink:href", handlerHelpers.modifyUrl(xlinkHref, req.seocromom.currentDomain));
        }

        $(this).removeAttr("integrity");
    });

    links.each(function () {
        const href = $(this).attr('href');
        if (/^\/\//.test(href)) {
            $(this).attr('href', `https://${href}`);
            $(this).attr("__mcopp", '1');
        } else if (/^\//.test(href)) {
            $(this).attr('href', `https://${SERVICE_MAIN_DOMAIN}${href}`);
            $(this).attr("__mcopp", '1');
        }
        $(this).removeAttr("integrity");
    });

    images.each(function () {
        const src = $(this).attr('src');
        if (/^\/\//.test(src)) {
            $(this).attr('src', `https://${src}`);
            $(this).attr("__mcopp", '1');
        } else if (/^\//.test(src)) {
            $(this).attr('src', `https://${SERVICE_MAIN_DOMAIN}${src}`);
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

    const upgradeBar = $('.test-account-upgrade-bar');
    if (upgradeBar) {
        upgradeBar.remove();
    }
    return $.html();
};

internals.notConnected = function(html) {
    return /login_frame_detection/m.test(html) || /username-input/m.test(html);
};

internals.injectScriptInXml = async function(xmlDoc, req) {
    const localHost = req.seocromom.currentDomain;
    const matchesItems = (xmlDoc + '').match(/href=".+"/g);

    if (Array.isArray(matchesItems)) {
        for (let i = 0; i < matchesItems.length; i++) {
            let newUrl = handlerHelpers.modifyUrl((matchesItems[i] + '').replace('href="', '').replace('"', ''), localHost);

            if (/&/.test(newUrl)) {
                const urlObjt = new URL(newUrl);
                newUrl = urlObjt.protocol + '//' + urlObjt.host + urlObjt.pathname + '?' +
                    handlerHelpers.MCOP_COMPOSITE_GET_VAR_NAME + '=' + btoa(urlObjt.search);
            }

            const newHref = 'href="' + newUrl + '"';
            xmlDoc = (xmlDoc + '').replace(matchesItems[i], newHref);
        }
    }

    const compoScript = '<script href="https://' + localHost + '/mcop-compos123456789.js" />'
    xmlDoc = (xmlDoc + '').replace(/<script/m, compoScript + '\n<script');

    return xmlDoc;
};