const cheerio = require('cheerio');
const process = require('process');
const zlib = require('zlib');
const path = require('path');
const querystring = require("querystring");
const utils = require('../../api/Utils');
const webClient = require("../../api/WebClient").create(true);
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const servicesDetails = require("../../api/ServicesDetails");
const {FreepikDownload, downloadsCounter} = require("../../api/db/models/FreepikDownloadModel");
const loginAgent = require("./LoginAgent").create();


const SERVICE_MAIN_DOMAIN = 'www.freepik.com';
const SERVICE_ROOT_DOMAIN = 'freepik.com';
const SERVICE_STATIC_SUB_DOMAIN = "static.freepik.com";
const SERVICE_IMAGES_SUB_DOMAIN = "img.freepik.com";
const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};

module.exports = async function (request, reply) {
    try {
        if (/^\/serve-login-page$/.test(request.url)) {
            return reply.view('auto-login.pug');
        } else if (/^\/do-auto-login$/.test(request.url)) {
            await internals.doAutoLogin(loginAgent, reply, request.seocromom.globalParams.freepikUsername, request.seocromom.globalParams.freepikPassword);
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

        const domainRegexp = (request.seocromom.currentDomain + '').replace(/\./, '\\.');
        targetedUrl = (targetedUrl + '').replace(new RegExp(domainRegexp, 'gm'), SERVICE_MAIN_DOMAIN);
        if (targetedHost.includes(SERVICE_IMAGES_SUB_DOMAIN)) {
            targetedUrl = targetedUrl.replace(/\?.+/, ''); // Remove any get variable from any url from the sub domain img.freepik.com
        }

        const realFullUrl = "https://" + targetedHost + targetedUrl;
        const requestFullUrl = "https://" + request.seocromom.currentDomain + request.url;

        if (typeof request.seocromom !== 'object' ||
            typeof request.seocromom.currentUser !== 'object') {
            reply.send("Please connect");
            return false;
        } else {
            if (request.seocromom.currentUser.role !== 'admin') {
                if (internals.isForbiddenUrl(request.url)) {
                    reply.header('location', servicesDetails.freepik.homeUrl);
                    reply.status(302).send("Redirecting...");
                    return true;
                }

                const userId =  request.seocromom.currentUser.id;
                const siteId =  request.seocromom.siteId;

                if (internals.isNewDownload(request)) {
                    if (! await internals.dailyLimitIsReached(userId, siteId, request.seocromom.globalParams)) {
                        await internals.incrementCounter(userId, siteId, realFullUrl);
                    }
                }

                if (await internals.dailyLimitIsReached(userId, siteId, request.seocromom.globalParams)) {
                    return reply.view('error.pug', {title: 'Daily limit..', msg: 'Sorry but your daily limit is reached.'});
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

        let appCookiesModel = false;
        if (! utils.isStaticRes(request.url)) {
            if (request.url.includes('/oauth-logout') && request.seocromom['currentUser'].role === "admin") {
                await AppCookiesListModel.deleteMany({name: servicesDetails.freepik.name});
            }

            appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.freepik.name}).exec();
            if (appCookiesModel) {
                cookiesManager.setOldCookies(appCookiesModel.cookies);
            }

            if (request.seocromom['currentUser'].role === "admin") {
                cookiesManager.merge(handlerHelpers.getAllClientSideCookiesAsArray(request.headers['cookie']), cookiesHost);

                await AppCookiesListModel.findOneAndUpdate(
                    {name: servicesDetails.freepik.name},
                    {cookies: cookiesManager.getAllAsObject()},
                    {new:true, upsert: true}
                );
            }

            const allCookies = cookiesManager.getAsString(cookiesHost);
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

        let proxyHost = null;
        let proxyPort = null;
        let proxyUsername = null;
        let proxyPassword = null;
        if (request.seocromom.globalParams.proxyIp &&
            request.seocromom.globalParams.proxyPort &&
            request.seocromom.globalParams.proxyUsername &&
            request.seocromom.globalParams.proxyPassword) {
            proxyHost = request.seocromom.globalParams.proxyIp;
            proxyPort = request.seocromom.globalParams.proxyPort;
            proxyUsername = request.seocromom.globalParams.proxyUsername;
            proxyPassword = request.seocromom.globalParams.proxyPassword;
        }


        //Send request to remote server as a client
        await webClient.sendRequest(request.method, targetedHost, targetedUrl,
            allowedRequestHeaders, requestData, proxyHost, proxyPort, proxyUsername, proxyPassword).then(function (serverResponse) {
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
                {name: servicesDetails.freepik.name},
                {cookies: cookiesManager.getAllAsObject()},
                {new:true, upsert: true}
            );
        }

        if (typeof serverRes.headers['location'] !== "undefined" && ! utils.isStaticRes(request.url)) {
            let redirectUrl = serverRes.headers['location'];
            if (/^\//.test(redirectUrl)) {
                redirectUrl = `https://${targetedHost}${redirectUrl}`;
            }
            const newLocation = handlerHelpers.modifyUrl(redirectUrl, request.seocromom.currentDomain);
            reply.header('location', newLocation);
        }

        let isEncoded = false;
        body = Buffer.concat(receivedData);

        if (receivedData.length > 0) {
            if (/gzip/i.test(serverRes.headers['content-encoding'] + "")) {
                body = await utils.unzip(body);
                isEncoded = true;
            } else if (/deflate/i.test(serverRes.headers['content-encoding'] + "")) {
                body = await utils.inflateRaw(body);
                isEncoded = true;
            } else if (/br/i.test(serverRes.headers['content-encoding'] + "")) {
                body = await utils.brotliDecompress(body);
                isEncoded = true;
            }
        }

        if (/oauth-logout/.test(request.url) && request.seocromom['currentUser'].role === "admin") {
            await AppCookiesListModel.deleteMany({name: servicesDetails.freepik.name});
        }

        //Remove useless parts from web pages before they're served
        if (handlerHelpers.mimeIsHtml(serverRes.headers['content-type'] + '')) {
            body = body.toString();
            if (body.length > 0) {
                if (statusCode === 400 && /Request\sHeader\sOr\sCookie\sToo\sLarge/m.test(body)) {
                    await AppCookiesListModel.deleteMany({name: servicesDetails.freepik.name});
                    reply.header('location', servicesDetails.freepik.homeUrl);
                    return reply.code(302).send("Redirecting...");
                }
                body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
                body = handlerHelpers.injectPageBase(body, requestFullUrl, realFullUrl);

                const $ = cheerio.load(body);
                body = internals.removeInlineContentSecurityPolicy($);
                body = internals.removeUselessParts($, request);
                body = await internals.injectJsAdaptor($);
            }
        } else if (handlerHelpers.mimeIsJs(serverRes.headers['content-type'] + "")) {
            body = body.toString();
            try {
                body = handlerHelpers.replaceLocationInJsCode(body);
                body = handlerHelpers.replacePostMessage(body);
            } catch (error) {
                await utils.writeToLog(request.url);
                await utils.writeToLog(error);
            }

            if (handlerHelpers.containsImportScrips(body)) {
                let addedScripts = handlerHelpers.injectMcopSwComponentsInImportScrips(request.seocromom.serverOrigin);
                body = 'try{ \n\r ' + addedScripts + body + " \n\r}catch(error){ \n\r console.warn('Mcop Worker Error: ' + error);} \n\r";
            } else {
                //body = 'try{ \n\r ' + body + " \n\r }catch(error){ \n\r console.warn('Mcop Worker Error: ' + error);} \n\r";
            }

            body = body.replace(/www\.freepik\.com/mg, request.seocromom.currentDomain);
        } else if (handlerHelpers.mimeIsJson(serverRes.headers['content-type'] + "")) {
            body = body.toString();
            try {
                body = handlerHelpers.modifyUrlInJson(body, request.seocromom.currentDomain);
            } catch (error) {
                await utils.writeToLog(request.url);
                await utils.writeToLog(error);
            }
        }

        if (internals.isNewDownload(request)) {
            const referer = request.headers['referer'];

            if (typeof referer === 'string') {
                const realUrlObjt = new URL(realFullUrl);
                let parts = realUrlObjt.pathname.split('.');
                const extension = parts[1];
                const refererUrlObjt = new URL(referer);
                parts = refererUrlObjt.pathname.split('/');
                const filename = parts[parts.length - 1].replace(/\..+/, '');
                const fullFilename = filename + '.' + extension;
                reply.header('Content-Disposition', `attachment; filename="${fullFilename}`);
            } else {
                const realUrlObjt = new URL(realFullUrl);
                let parts = realUrlObjt.pathname.split('/');
                const fullFilename = parts[parts.length - 1];
                reply.header('Content-Disposition', `attachment; filename="${fullFilename}`);
            }
        }

        reply.status(statusCode).send(body);
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
        /\/auth\/register/i.test(url) || ((url + 'id.freepikcompany.com').includes('') && /\/log-in/i.test(url)) ||
        /\/sign-up/i.test(url) || /\/recover-password/i.test(url) ||
        /\/user/i.test(url) || /\/profile/i.test(url) ||
        /\/oauth-logout/i.test(url);
};


internals.removeUselessParts = function($, request) {
    const anchors = $('a');
    const links = $('link');
    const paragraphs = $('p');
    const scripts = $('script');
    const images = $('img');
    const forms = $('form');
    const iframes = $('iframe');
    const localUrl = "https://" + request.seocromom.currentDomain;


    scripts.each(function () {
        const src = $(this).attr('src');
        if (typeof src === "undefined") {
            let jsCode = $(this).html() + '';

            try {
                jsCode = handlerHelpers.replaceLocationInJsCode(jsCode);
                jsCode = handlerHelpers.replaceWebSocketInJsCode(jsCode);
                jsCode = handlerHelpers.replacePostMessage(jsCode);
            } catch (error) {
                utils.writeToLog("Failed to parse code \n" + jsCode);
            }

            jsCode = handlerHelpers.replaceDomainInString(jsCode, SERVICE_MAIN_DOMAIN, request.seocromom.currentDomain);
            $(this).html(jsCode);
            $(this).attr("__mcopp", '1');
        } else {

        }

        $(this).removeAttr("integrity");
    });


    iframes.each(function () {
        const src = $(this).attr("src");
        //console.log(src);
        if (typeof src !== "undefined") {
            //utils.writeToLog("iframe url: " + src);
            $(this).attr("src", handlerHelpers.modifyUrl(src, request.seocromom.currentDomain));
            $(this).attr("__mcopp", '1');
        }

        $(this).removeAttr("integrity");
    });

    forms.each(function () {
        const action = $(this).attr("action");
        //console.log(src);
        if (typeof action !== "undefined") {
            //utils.writeToLog("iframe url: " + src);
            $(this).attr("action", handlerHelpers.modifyUrl(action, request.seocromom.currentDomain));
            $(this).attr("__mcopp", '1');
        }
    });

    return $.html();
};

internals.isNewDownload = function(request) {
    return /downloads/.test(request.url) && (request.url + '').includes(SERVICE_ROOT_DOMAIN);
};

internals.dailyLimitIsReached = async function (userId, siteId, globalParams) {
    const dailyLimit = Number.parseInt(globalParams.freepikDownloadLimit);
    const dailyCounter = await downloadsCounter(userId, siteId);

    return dailyCounter >= dailyLimit;
};

internals.incrementCounter = async function (userId, siteId, url) {
    await FreepikDownload.create({
        userId: userId,
        siteId: siteId,
        url: url,
    });
};

internals.injectJsAdaptor = async function($) {
    const regExp = new RegExp("sites" + "\\" + path.sep + "freepik");
    let fullPath = __dirname.replace(regExp, "api/frontend-compos/freepik-adapter.js");
    const headerBlock = $("head");

    const jsCode = await handlerHelpers.getLocalJsFile(fullPath);
    headerBlock.append('<script type="text/javascript" class="seoc-injs">' + jsCode + '</script>');
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