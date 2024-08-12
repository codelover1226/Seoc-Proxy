const process = require('process');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const querystring = require("querystring");
const cheerio = require("cheerio");

const utils = require('../../api/Utils');
const webClient = require("../../api/WebClient").create(true);
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const servicesDetails = require("../../api/ServicesDetails");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const loginAgent = require("./LoginAgent").create();

const SERVICE_MAIN_DOMAIN = 'www.seoptimer.com';
const SERVICE_ROOT_DOMAIN = 'seoptimer.com';
const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};

module.exports = async function (request, reply) {
    try {
        //We serve a cached heavy js file
        if ((request.url + '').includes('aea80afbab168f4ebea6da9237b1cc83.js')) {
            const fullPath =  path.join(__dirname, 'cache', 'aea80afbab168f4ebea6da9237b1cc83.js');
            const compressedData = await utils.brotliCompress(fullPath);
            reply.header('content-type', 'application/javascript');
            reply.header('content-encoding', 'br');
            reply.header('content-length', Buffer.byteLength(compressedData));
            return reply.code(200).send(compressedData);
        }

        if (/^\/do-auto-login$/.test(request.url)) {
            await internals.doAutoLogin(loginAgent, reply, request.seocromom.globalParams.seoptimerUsername,
                request.seocromom.globalParams.seoptimerPassword, servicesDetails.seoptimer.homeUrl);
            return true;
        } else if (loginAgent.isInLockMode()) {
            return reply.send("Please a connection is already underway. Retry in a few minutes.");
        }

        let targetedUrl = request.seocromom.requestUrl + '';
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

        let cookiesHost = targetedHost;

        if (targetedHost.includes(SERVICE_ROOT_DOMAIN)) {
            //cookiesHost = [SERVICE_ROOT_DOMAIN, 'websiteauditserver.com'];
            cookiesHost = SERVICE_ROOT_DOMAIN;
        }

        //we get current user only for non static resources
        if (serviceDomainRegExp.test(targetedHost)) {
            if (typeof request.seocromom !== 'object' ||
                typeof request.seocromom.currentUser !== 'object') {
                return reply.send("Please connect");
            } else {
                if (request.seocromom.currentUser.role !== 'admin' && internals.isForbiddenUrl(request.url)) {
                    reply.header('location', servicesDetails.seoptimer.homeUrl);
                    return reply.status(302).send("Redirecting...");
                }
            }
        }


        const excludedHeaders = [
            "cookie","user-agent","sec-ch-ua","sec-ch-ua-mobile","sec-ch-ua-platform",
            "sec-ch-ua-full-version","ec-ch-ua-full-version-list",
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

        if (! utils.isStaticRes(request.url) && ! utils.isJsFile(request.url)) {
            let appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.seoptimer.name}).exec();
            if (appCookiesModel)
                cookiesManager.setOldCookies(appCookiesModel.cookies);

            //cookiesManager.merge(handlerHelpers.getAllClientSideCookiesAsArray(request.headers['cookie']), cookiesHost);

            const allCookies = cookiesManager.getAsString(cookiesHost);
            if (allCookies.length > 0) {
                allowedRequestHeaders["cookie"] = allCookies;
            }
        }

        let requestData = '';
        if (/post|put|patch/i.test(request.method)) {

            requestData = request.seocromom['requestBody'];
            if (typeof requestData === 'string') {
                allowedRequestHeaders["content-length"] = Buffer.byteLength(requestData);
            }
        }

        let serverRes = undefined;

        const threeMinutes = 180000;
        webClient.setTimeout(threeMinutes);
        webClient.acceptUnverifiedSslCertificates();

        if (typeof portNumber !== 'undefined')
            webClient.setPort(portNumber);

        /*if (realFullUrl.includes('minify/aea80afbab168f4ebea6da9237b1cc83.js')) {
            await utils.writeToLog(realFullUrl)
            await utils.writeToLog(JSON.stringify(allowedRequestHeaders))
        }*/

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
            const check = cookiesManager.merge(serverRes.headers['set-cookie'], cookiesHost);

            await AppCookiesListModel.findOneAndUpdate(
                {name: servicesDetails.seoptimer.name},
                {cookies: cookiesManager.getAllAsObject()},
                {new:true, upsert: true}
            );
        }

        if (typeof serverRes.headers['location'] !== "undefined") {
            if (/\/login/.test(serverRes.headers['location']) && ! utils.isStaticRes(request.url)) {
                return reply.view("auto-login.pug",{
                    redirectUrl: servicesDetails.seoptimer.homeUrl
                });
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

        //Remove useless parts from web pages before they're served
        if (handlerHelpers.mimeIsHtml(serverRes.headers['content-type'] + '')) {
            body = body.toString();
            if (body.length > 0 && handlerHelpers.isHtml(body)) {
                if (statusCode === 400 && /Request\sHeader\sOr\sCookie\sToo\sLarge/m.test(body)) {
                    await AppCookiesListModel.deleteMany({name: servicesDetails.seoptimer.name});
                    reply.header('location', servicesDetails.seoptimer.homeUrl);
                    return reply.code(302).send("Redirecting...");
                }

                body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
                body = handlerHelpers.injectPageBase(body, requestFullUrl, realFullUrl, request.seocromom.currentDomain);

                const $ = cheerio.load(body);
                body = internals.removeInlineContentSecurityPolicy($);
                body = await internals.injectJsAdaptor($, request);
            }

            if (/\/login/.test(request.url) && body.includes('loginform-email')) {
                return reply.view("auto-login.pug",{
                    redirectUrl: servicesDetails.seoptimer.homeUrl
                });
            }
        } else if (handlerHelpers.mimeIsJs(serverRes.headers['content-type'] + "")) {
            if (typeof serverRes.headers['content-type'] === "undefined") {
                reply.header("content-type", 'application/javascript');
            }

            body = body.toString();
            try {
                body = handlerHelpers.replaceLocationInJsCode(body);
                body = handlerHelpers.replaceWebSocketInJsCode(body);
                body = handlerHelpers.replacePostMessage(body);
                //body = body.replace('{console.warn(`', "{console.log(arguments.callee.caller);console.warn(`")
            } catch (error) {
                await utils.writeToLog(request.url);
                await utils.writeToLog(error);
            }
        } else if (/application\/json/.test(serverRes.headers['content-type'])) {
            body = (body + '').replace(SERVICE_MAIN_DOMAIN, request.seocromom.currentDomain);
        }

        reply.header('content-length', Buffer.byteLength(body));
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
    return typeof url !== "string"
        || /\/login/.test(url) || /\/myaccount/.test(url)
        || /\/logout/.test(url) || /\/account/.test(url) ||
        /\/domain-settings/.test(url);
};

internals.injectJsAdaptor = async function($, req) {
    const regExp = new RegExp("sites" + "\\" + path.sep + "seoptimer");
    let fullPath = __dirname.replace(regExp, "api/frontend-compos/seoptimer-adapter.js");
    const headerBlock = $("head");
    if (req.seocromom.currentUser.role !== 'admin') {
        $(`li[language="en-US"]`).parent().remove();
        $(`a[href*='myaccount']`).remove();
        $(`a[href*='logout']`).remove();
    }
    return $.html();
};

internals.doAutoLogin = async function(loginAgent, res, username, password, homeUrl) {
    let respData = '';
    await loginAgent.connect(username, password)
        .then(function (msg) {
            respData = JSON.stringify({
                status:"connected",
                message: `A session has been created you will be redirected in few seconds. You can click <a href="${homeUrl}">here</a> to do it on your own.`
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