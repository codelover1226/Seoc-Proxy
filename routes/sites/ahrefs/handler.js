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
const {ahrefsModules, siteExplorer, keywordsExplorer, batchAnalysis} = require("../../api/db/models/AhrefsModuleLimitModel");


const SERVICE_MAIN_DOMAIN = 'app.ahrefs.com';
const SERVICE_ROOT_DOMAIN = 'ahrefs.com';
const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};
const CreditLimitChecker = {};

module.exports = async function (request, reply) {
    try {
        let targetedUrl = request.seocromom.requestUrl + '';
        let targetedHost = SERVICE_MAIN_DOMAIN;
        let portNumber = 443;
        let refererUrl = "";

        if (targetedUrl.includes('mcop-ahrefs/signin-link')) {
            return reply.view('ahrefs-link-signin.pug', {
                ahrefsDomain: request.seocromom.globalParams.ahrefsDomain
            });
        }

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

        //if (targetedHost.includes(SERVICE_ROOT_DOMAIN))

        //we get current user only for non static resources
        if (serviceDomainRegExp.test(targetedHost)) {
            if (typeof request.seocromom !== 'object' ||
                typeof request.seocromom.currentUser !== 'object') {
                return reply.send("Please connect");
            }

            if (request.seocromom.currentUser.role !== 'admin') {
                const userId = request.seocromom.currentUser.id;
                let errorMsg = '<div style="color: red; font-size: 20px; font-weight: bold">';
                errorMsg += 'Sorry but your daily limit is reached for the current module. ';
                errorMsg += '</div>';
                errorMsg += '<p>Go back the home page <a href="/dashboard">here</a></p>';

                if (siteExplorer.urlIsRelated(realFullUrl) &&
                    await siteExplorer.isLimitReached(userId, request.seocromom.globalParams)) {
                    reply.header('content-type', 'text/html');
                    return reply.send(errorMsg);
                } else if (siteExplorer.isNewUsage(realFullUrl)) {
                    await siteExplorer.incrementDailyCounter(userId, realFullUrl);
                }

                if (keywordsExplorer.usage.urlIsRelated(realFullUrl) &&
                    await keywordsExplorer.usage.isLimitReached(userId, request.seocromom.globalParams)) {
                    reply.header('content-type', 'text/html');
                    return reply.send(errorMsg);
                } else if (keywordsExplorer.usage.isNew(realFullUrl)) {
                    await keywordsExplorer.usage.incrementDailyCounter(userId, realFullUrl);
                }

                if (keywordsExplorer.export.isNew(realFullUrl) &&
                    await keywordsExplorer.export.isLimitReached(userId, request.seocromom.globalParams)) {
                    reply.header('content-type', 'text/html');
                    return reply.send(errorMsg);
                } else if (keywordsExplorer.export.isNew(realFullUrl)) {
                    await keywordsExplorer.export.incrementDailyCounter(userId, realFullUrl);
                }

                if (batchAnalysis.usage.urlIsRelated(realFullUrl) &&
                    await batchAnalysis.usage.isLimitReached(userId, request.seocromom.globalParams)) {
                    reply.header('content-type', 'text/html');
                    return reply.send(errorMsg);
                } else if (batchAnalysis.usage.isNew(realFullUrl)) {
                    await batchAnalysis.usage.incrementDailyCounter(userId, realFullUrl);
                }

                if (batchAnalysis.export.isNew(realFullUrl) &&
                    await batchAnalysis.export.isLimitReached(userId, request.seocromom.globalParams)) {
                    reply.header('content-type', 'text/html');
                    return reply.send(errorMsg);
                } else if (batchAnalysis.export.isNew(realFullUrl)) {
                    await batchAnalysis.export.incrementDailyCounter(userId, realFullUrl);
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

        let appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.ahrefs.name}).exec();
        if (appCookiesModel)
            cookiesManager.setOldCookies(appCookiesModel.cookies);

        //cookiesManager.merge(handlerHelpers.getAllClientSideCookiesAsArray(request.headers['cookie']), cookiesHost);

        const allCookies = cookiesManager.getAsString(cookiesHost);
        if (allCookies.length > 0) {
            allowedRequestHeaders["cookie"] = allCookies;
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
        await webClient.sendRequest(request.method, targetedHost, targetedUrl, allowedRequestHeaders,
            requestData, proxyHost, proxyPort, proxyUsername, proxyPassword).then(function (serverResponse) {
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

        if (typeof serverRes.headers['set-cookie'] !== "undefined" && ! utils.isStaticRes(request.url) && ! utils.isJsFile(request.url)) {
            const check = cookiesManager.merge(serverRes.headers['set-cookie'], cookiesHost);

            await AppCookiesListModel.findOneAndUpdate(
                {name: servicesDetails.ahrefs.name},
                {cookies: cookiesManager.getAllAsObject()},
                {new:true, upsert: true}
            );
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

        if (/\/logout/.test(request.url + "") && request.seocromom['currentUser'].role === "admin") {
            //await AppCookiesListModel.deleteMany({name: servicesDetails.ahrefs.name});
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
                    await AppCookiesListModel.deleteMany({name: servicesDetails.ahrefs.name});
                    reply.header('location', servicesDetails.ahrefs.homeUrl);
                    return reply.code(302).send("Redirecting...");
                }

                body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
                body = handlerHelpers.injectPageBase(body, requestFullUrl, realFullUrl, request.seocromom.currentDomain);

                const $ = cheerio.load(body);
                body = internals.removeInlineContentSecurityPolicy($);
                body = await internals.injectJsAdaptor($, request);
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
        || /\/user\/login/.test(url) || /\/pricing/.test(url)
        || /\/logout/.test(url) || /\/account/.test(url) ||
        /\/mfa/.test(url);
};

internals.injectJsAdaptor = async function($, req) {
    const regExp = new RegExp("sites" + "\\" + path.sep + "ahrefs");
    let fullPath = __dirname.replace(regExp, "api/frontend-compos/ahrefs-adapter.js");
    const headerBlock = $("head");
    if (req.seocromom.currentUser.role !== 'admin') {
        const jsCode = await handlerHelpers.getLocalJsFile(fullPath);
        headerBlock.append('<script type="text/javascript" class="seoc-injs">' + jsCode + '</script>');
        headerBlock.append('<style type="text/css" class="seoc-incss">.css-35px53-workspaceName.updateable__workspace-name{display: none !important;}</style>');
    }

    fullPath = __dirname.replace(regExp, "api/frontend-compos/ahrefs-all-users-adapter.js");
    headerBlock.append('<script type="text/javascript" class="seoc-injs">' +
        await handlerHelpers.getLocalJsFile(fullPath) + '</script>');
    return $.html();
};