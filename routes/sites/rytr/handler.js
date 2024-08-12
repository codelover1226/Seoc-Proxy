const cheerio = require('cheerio');
const process = require('process');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const querystring = require("querystring");
const utils = require('../../api/Utils');
const webClient = require("../../api/WebClient").create(true);
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const servicesDetails = require("../../api/ServicesDetails");


const SERVICE_MAIN_DOMAIN = 'app.rytr.me';
const SERVICE_ROOT_DOMAIN = 'rytr.me';
const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};
const SESSION_FILE_FULL_PATH = `${__dirname}/shared-session-file.json`;

module.exports = async function (request, reply) {
    try {
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

        if (typeof request.seocromom !== 'object' ||
            typeof request.seocromom.currentUser !== 'object') {
            reply.send("Please connect");
            return false;
        } else {
            if (request.seocromom.currentUser.role !== 'admin') {
                if (internals.isForbiddenUrl(request.url)) {
                    reply.header('location', servicesDetails.rytr.homeUrl);
                    reply.status(302).send("Redirecting...");
                    return true;
                }
            }
        }

        if (targetedUrl.includes('backend/delete/session')) {
            if (request.seocromom.currentUser.role === 'admin') {
                internals.deleteSessionFile();
                return reply.view('rytr-delete-session.pug', {
                    redirectUrl: servicesDetails.rytr.homeUrl
                });
            } else {
                return reply.send('Not allowed.');
            }
        }

        if ((request.url + '').includes('/mcop-rytr/save_session')) {
            if (request.seocromom.currentUser.role === 'admin' && /post/i.test(request.method)) {
                if (! internals.sessionFileExists()) {
                    await internals.saveSession(request.seocromom['requestBody']);
                    reply.status(200).send("Session saved properly.");
                    return true;
                } else {
                    reply.status(200).send("No need to save.");
                    return true;
                }
            } else {
                if (internals.sessionFileExists()) {
                    reply.status(200).send("Not allowed.");
                    return true;
                } else {
                    reply.header('content-type', 'application/json');
                    reply.status(200).send(JSON.stringify({
                        do_logout: true,
                        msg: 'Session not found'
                    }));
                    return true;
                }
            }
        } else if ((request.url + '').includes('/mcop-rytr/get_session')) {
            if (internals.sessionFileExists()) {
                reply.header('content-type', 'application/json');
                reply.status(200).send(internals.getSessionDetails());
                return true;
            } else {
                reply.status(200).send('Session not found');
                return true;
            }
        } else if ((request.url + '').includes('/mcop-rytr/delete_session')) {
            if (request.seocromom.currentUser.role === 'admin' && internals.sessionFileExists()) {
                internals.deleteSessionFile();
                reply.status(200).send('Session deleted.');
                return true;
            } else {
                reply.status(200).send('Not allowed');
                return true;
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
            appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.rytr.name}).exec();
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
                        name: servicesDetails.rytr.name,
                        cookies: cookiesManager.getAllAsObject(),
                        changeDate: Date.now()
                    });
            } else {
                await AppCookiesListModel.create({
                    name: servicesDetails.rytr.name,
                    cookies: cookiesManager.getAllAsObject(),
                });
            }
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

        //Remove useless parts from web pages before they're served
        if (handlerHelpers.mimeIsHtml(serverRes.headers['content-type'] + '')) {
            body = body.toString();
            if (body.length > 0) {
                if (statusCode === 400 && /Request\sHeader\sOr\sCookie\sToo\sLarge/m.test(body)) {
                    await AppCookiesListModel.deleteOne({name: servicesDetails.rytr.name});
                    reply.header('location', servicesDetails.rytr.homeUrl);
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

            //body = body.replace(/"use strict"/mg, `/*"use strict"*/`);
            //body = body.replace('var c=Ce("rpcToken");if', `var c=Ce("rpcToken");console.log(c);console.log(Ce);if`)
            //body = body.replace('ki(e,t,n,r,o,i){if', `ki(e,t,n,r,o,i){console.log(e);console.log(t);console.log(n);console.log(r);console.log(o);console.log(i);console.log(arguments.callee.caller);console.log('');if`);
            //body = body.replace('(e,t,n){if(null!==e)if(e.memoizedProps!==t.pendingProps||jo.current)', `(e,t,n){console.log(e);console.log(t);console.log(n);console.log('');if(null!==e)if(e.memoizedProps!==t.pendingProps||jo.current)`);
        } else if (handlerHelpers.mimeIsJson(serverRes.headers['content-type'] + "")) {
            body = body.toString();
            try {
                body = handlerHelpers.modifyUrlInJson(body, request.seocromom.currentDomain);
            } catch (error) {
                await utils.writeToLog(request.url);
                await utils.writeToLog(error);
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
    return typeof url !== "string" || /\/auth\/login/i.test(url) ||
        /\/account/i.test(url);
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

            //jsCode = handlerHelpers.replaceDomainInString(jsCode, SERVICE_MAIN_DOMAIN, request.seocromom.currentDomain);
            $(this).html(jsCode);
            $(this).attr("__mcopp", '1');
        } else {
            //$(this).attr("src", handlerHelpers.modifyUrl(src, request.seocromom.currentDomain));
        }

        $(this).removeAttr("integrity");
    });


    return $.html();
};

internals.injectJsAdaptor = async function($) {
    const regExp = new RegExp("sites" + "\\" + path.sep + "rytr");
    let fullPath = __dirname.replace(regExp, "api/frontend-compos/rytr-adapter.js");

    const jsCode = await handlerHelpers.getLocalJsFile(fullPath);
    //await utils.writeToLog(jsCode);
    $("head").append('<script type="text/javascript" class="seoc-injs">' + jsCode + '</script>');
    return $.html();
};

internals.saveSession = async function(details) {
    return await utils.writeFile(SESSION_FILE_FULL_PATH, details);
};

internals.sessionFileExists = function() {
    return fs.existsSync(SESSION_FILE_FULL_PATH);
};

internals.deleteSessionFile = function() {
    return fs.unlinkSync(SESSION_FILE_FULL_PATH);
};

internals.getSessionDetails = function() {
    return fs.readFileSync(SESSION_FILE_FULL_PATH).toString();
};