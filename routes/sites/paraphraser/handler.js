const process = require('process');
const zlib = require('zlib');
const fs = require('fs');
const querystring = require("querystring");
const cheerio = require("cheerio");
const path = require('path');

const utils = require('../../api/Utils');
const webClient = require("../../api/WebClient").create(true);
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const servicesDetails = require("../../api/ServicesDetails");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const loginAgent = require("./LoginAgent").create();

const SERVICE_MAIN_DOMAIN = 'www.paraphraser.io';
const SERVICE_ROOT_DOMAIN = 'paraphraser.io';

const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};

module.exports = async function (request, reply) {
    try {

        if (/^\/do-auto-login$/.test(request.url)) {
            await internals.doAutoLogin(loginAgent, reply, request.seocromom.globalParams.paraphraserUsername, request.seocromom.globalParams.paraphraserPassword);
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
                        reply.header('location', servicesDetails.paraphraser.homeUrl);
                        return reply.code(302).send("Redirecting...");
                    }
                }
            }
        }


        const excludedHeaders = [
            "cookie","user-agent","sec-ch-ua","sec-ch-ua-mobile","sec-ch-ua-platform",
            "sec-fetch-user","upgrade-insecure-requests","host",
            "connection","pragma","accept-language",
            "x-real-ip", "x-forwarded-for"
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
        let cookiesHost = targetedHost;
        if (targetedHost.includes(SERVICE_ROOT_DOMAIN)) cookiesHost = SERVICE_ROOT_DOMAIN;

        const domainRegExp = new RegExp(request.seocromom.currentDomain, "mg");

        let appCookiesModel = false;
        if (! utils.isStaticRes(request.url)) {
            appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.paraphraser.name}).exec();
            if (appCookiesModel)
                cookiesManager.setOldCookies(appCookiesModel.cookies);

            //cookiesManager.merge(handlerHelpers.getAllClientSideCookiesAsArray(request.headers['cookie']), cookiesHost);

            const allCookies = cookiesManager.getAsString(targetedHost);
            if (allCookies.length > 0) {
                allowedRequestHeaders["cookie"] = allCookies;
            }
        }

        let requestData = '';
        if (/post|put|patch/i.test(request.method)) {
            requestData = request.seocromom['requestBody'];

            if (typeof requestData === 'string') {
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
            'set-cookie','timing-allow-origin','content-encoding',
            'transfer-encoding','access-control-allow-origin',
            'content-security-policy','referrer-policy','content-security-policy-report-only',
            'link'
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

        /*if (typeof serverRes.headers['set-cookie'] !== "undefined" && ! utils.isStaticRes(request.url)) {
            cookiesManager.merge(serverRes.headers['set-cookie'], targetedHost);
            reply.header('set-cookie', cookiesManager.getForClientSide());
        }*/

        if (Array.isArray(serverRes.headers['set-cookie']) && ! utils.isStaticRes(request.url)) {
            const check = cookiesManager.merge(serverRes.headers['set-cookie'], SERVICE_MAIN_DOMAIN);
            if (appCookiesModel) {
                await AppCookiesListModel.updateOne({_id: appCookiesModel._id},
                    {
                        name: servicesDetails.paraphraser.name,
                        cookies: cookiesManager.getAllAsObject(),
                        changeDate: Date.now()
                    });
            } else {
                await AppCookiesListModel.create({
                    name: servicesDetails.paraphraser.name,
                    cookies: cookiesManager.getAllAsObject(),
                });
            }
        }

        if (typeof serverRes.headers['location'] !== "undefined") {
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
                body = await utils.unzip(body);
                isEncoded = true;
            } else if (/deflate/i.test(serverRes.headers['content-encoding'] + "")) {
                body = await utils.inflate(body);
                isEncoded = true;
            } else if (/br/i.test(serverRes.headers['content-encoding'] + "")) {
                body = await utils.brotliDecompress(body);
                isEncoded = true;
            }
        }

        if (handlerHelpers.mimeIsJs(serverRes.headers['content-type'] + "") ||
            ((request.url + '').includes('.js') && handlerHelpers.isJsCode(body))) {
            if (typeof serverRes.headers['content-type'] === "undefined") {
                reply.header("content-type", 'application/javascript');
            }


            body =  body.toString();

            try {
                body = handlerHelpers.replaceLocationInJsCode(body);
                body = handlerHelpers.replaceWebSocketInJsCode(body);
                body = handlerHelpers.replacePostMessage(body);

                if (handlerHelpers.containsImportScrips(body) || request.headers['sec-fetch-dest'] === 'worker') {
                    //let addedScripts = handlerHelpers.injectMcopSwInImportScrips(localHost);
                    let addedScripts = handlerHelpers.injectMcopSwInImportScrips(request.seocromom.currentDomain);
                    body = 'try{ \n\r ' + addedScripts + body + " \n\r}catch(error){ \n\r console.warn('Mcop Worker Error: ');console.warn(error);} \n\r";
                }
            } catch (error) {
                await utils.writeToLog(request.url);
                await utils.writeToLog(error);
            }
        } else if (handlerHelpers.mimeIsHtml(serverRes.headers['content-type'] + '')) {
            body = body.toString();
            if (body.length > 0 && handlerHelpers.isHtml(body)) {
                if (statusCode === 400 && /Request\sHeader\sOr\sCookie\sToo\sLarge/m.test(body)) {
                    await AppCookiesListModel.deleteMany({name: servicesDetails.paraphraser.name});
                    reply.header('location', servicesDetails.paraphraser.homeUrl);
                    return reply.code(302).send("Redirecting...");
                }

                body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
                body = handlerHelpers.injectPageBase(body, requestFullUrl, realFullUrl);

                const $ = cheerio.load(body);
                body = internals.removeInlineContentSecurityPolicy($);
                body = internals.removeUselessParts($, request, targetedHost);

                if (internals.notConnected($)) {
                    return reply.view("auto-login.pug");
                }
            }
        }

            reply.header('content-length', Buffer.byteLength(body));

        if (statusCode === 204)
            return reply.code(statusCode).send('');

        return reply.code(statusCode).send(body);
    } catch (e) {
        await utils.writeToLog(e);
        reply.code(500);
        return reply.view("error.pug",
            { title: "Internal error", msg: "Oops! we're sorry but an error occurred on the server. Please contact the administrator." });
    }
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

internals.isForbiddenUrl = function(url) {
    return typeof url !== "string" ||
        /\/login/.test(url)
        || /\/paraphrasing-api-plans/.test(url) || /\/pricing-plans/.test(url)
        || /\/account/.test(url) || /\/logout/.test(url);
};


internals.removeUselessParts = function($, req, currentRealDomain) {
    const scripts = $('script');
    const localUrl = "https://" + req.seocromom.currentDomain;

    scripts.each(function () {
        const src = $(this).attr('src');
        if (typeof src === "undefined") {
            let jsCode = $(this).html();

            jsCode = handlerHelpers.replaceLocationInJsCode(jsCode);
            jsCode = handlerHelpers.replaceWebSocketInJsCode(jsCode);
            try {
                jsCode = handlerHelpers.replacePostMessage(jsCode);
            } catch (error) {
                utils.writeToLog("Failed to parse code \n" + jsCode);
            }

            $(this).attr("__mcopp", '1');
            $(this).html(jsCode);
        }
        $(this).removeAttr("integrity");
    });

    return $.html();
};

internals.notConnected = function($) {
    return $('#loginnow').length > 0;
};


internals.doAutoLogin = async function(loginAgent, res, username, password) {
    let respData = '';
    await loginAgent.connect_http(username, password)
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