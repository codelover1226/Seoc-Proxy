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
const loginAgent = require("./LoginAgent").create();
const {PbnpremiumViews, viewsCounter} = require("../../api/db/models/PbnpremiumViewsModel");



const SERVICE_MAIN_DOMAIN = 'pbnpremium.com';
const SERVICE_ROOT_DOMAIN = 'pbnpremium.com';
const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};
const ViewsLimitChecker = {};

module.exports = async function (request, reply) {
    try {
        if (request.url === '/' || /^\/\?.+/.test(request.url)) {
            reply.header('location', servicesDetails.pbnpremium.homeUrl);
            reply.code(302);
            return reply.send("Redirecting...");
        }

        if (/^\/do-auto-login$/.test(request.url)) {
            await internals.doAutoLogin(loginAgent, reply, request.seocromom.globalParams.pbnpremiumUsername, request.seocromom.globalParams.pbnpremiumPassword);
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

        if (request.seocromom.adminDomain.includes(targetedHost))
            targetedHost = SERVICE_MAIN_DOMAIN;

        const realFullUrl = "https://" + targetedHost + targetedUrl;
        const requestFullUrl = "https://" + request.seocromom.currentDomain + request.url;

        const serviceDomainRegExp = new RegExp(SERVICE_ROOT_DOMAIN.replace(/\./, "\."));

        //we get current user only for non static resources requested on www.spyfu.com
        if (! utils.isStaticRes(request.url)) {

            if (SERVICE_ROOT_DOMAIN.includes(targetedHost)) {
                if (typeof request.seocromom !== 'object' ||
                    typeof request.seocromom.currentUser !== 'object') {
                    return reply.send("Please connect");
                } else {
                    if (request.seocromom.currentUser.role !== 'admin' && internals.isForbiddenUrl(request.url)) {
                        reply.header('location', servicesDetails.pbnpremium.homeUrl);
                        reply.code(302);
                        return reply.send("Redirecting...");
                    }

                    if (request.seocromom.currentUser.role !== 'admin') {
                        const userId =  request.seocromom.currentUser.id;
                        const siteId =  request.seocromom.siteId;
                        const errorMsg = '<div style="color: red; font-size: 20px; font-weight: bold">Sorry but your daily limit is reached.</div>';

                        if (await ViewsLimitChecker.dailyLimitIsReached(userId, siteId, request.seocromom.globalParams) &&
                            ViewsLimitChecker.isRelated(request)) {
                            reply.header('content-type', 'text/html');
                            return reply.send(errorMsg);
                        } else if (ViewsLimitChecker.isNewView(request)) {
                            await ViewsLimitChecker.incrementCounter(userId, siteId);
                        }
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

        /*const excludedHeaders = [
            "cookie",
            "host",
            "connection","pragma","accept-language","accept-encoding",
            "x-real-ip", "x-forwarded-for"
        ];*/

        const someHeadersValue = {
            'origin': "https://" + SERVICE_MAIN_DOMAIN,
            'referer': refererUrl
        };

        const allowedRequestHeaders = handlerHelpers.filterRequestHeaders(request.headers, excludedHeaders, someHeadersValue);

        allowedRequestHeaders["user-agent"] = utils.randomUserAgent(0);

        let appCookiesModel = false;
        if (! utils.isStaticRes(request.url)) {
            appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.pbnpremium.name}).exec();
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

        //Access-Control-Allow-Origin
        const skippedHeaderRegExp = new RegExp(regExpStr);
        for (let name in serverRes.headers) {
            if (! skippedHeaderRegExp.test(name + "")) {
                if (name.toLowerCase() === 'link') {
                    reply.header(name, (serverRes.headers[name] + '').replace(SERVICE_MAIN_DOMAIN, request.seocromom.currentDomain));
                } else {
                    reply.header(name, serverRes.headers[name]);
                }

            }
        }

        if (typeof serverRes.headers['set-cookie'] !== "undefined" && ! utils.isStaticRes(request.url)) {
            const check = cookiesManager.merge(serverRes.headers['set-cookie'], SERVICE_MAIN_DOMAIN);
            if (appCookiesModel) {
                await AppCookiesListModel.updateOne({_id: appCookiesModel._id},
                    {
                        name: servicesDetails.pbnpremium.name,
                        cookies: cookiesManager.getAllAsObject(),
                        changeDate: Date.now()
                    });
            } else {
                await AppCookiesListModel.create({
                    name: servicesDetails.pbnpremium.name,
                    cookies: cookiesManager.getAllAsObject(),
                });
            }
        }

        if (typeof serverRes.headers['location'] !== "undefined") {
            if (/\/account\/logout/.test(request.url + "") && request.seocromom['currentUser'].role === "admin") {
                await AppCookiesListModel.deleteOne({name: servicesDetails.pbnpremium.name});
                reply.header('location', servicesDetails.pbnpremium.homeUrl);
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
            if (handlerHelpers.isHtml(body) && ! handlerHelpers.mimeIsJson(body)) {
                if (statusCode === 400 && (body.includes('a request header field exceeds server limit') || body.includes('Request Header Or Cookie Too Large'))) {
                    await AppCookiesListModel.deleteOne({name: servicesDetails.pbnpremium.name});
                    reply.header('location', servicesDetails.pbnpremium.homeUrl);
                    return reply.code(302).send("Redirecting...");
                }

                body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
                body = handlerHelpers.injectPageBase(body, realFullUrl, requestFullUrl);

                const $ = cheerio.load(body);
                body = internals.removeInlineContentSecurityPolicy($);
                body = internals.removeUselessParts($, request, targetedHost);
                body = await internals.injectJsAdaptor($);

                if (internals.notConnected($) && serviceDomainRegExp.test(targetedHost)  && ! utils.isStaticRes(request.url)) {
                    return reply.view("auto-login.pug");
                }
            }
        } else if (handlerHelpers.mimeIsJs(serverRes.headers['content-type'] + "") || /\.js/.test(request.url)) {
            if (typeof serverRes.headers['content-type'] === "undefined") {
                reply.header("content-type", 'application/javascript');
            }

            body = body.toString();
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
        }


        return reply.code(statusCode).send(body);
    }  catch (e) {
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

internals.isForbiddenUrl = function(url) {
    return typeof url !== "string" || url === '/' ||
        /\/login/.test(url) || /\/logout/.test(url) || /\/member\/account/.test(url) || /\/member\/subscription/.test(url);
};

internals.removeUselessParts = function($, req, currentRealDomain) {
    const anchors = $('a');
    const links = $('link');
    const paragraphs = $('p');
    const scripts = $('script');
    const images = $('img');
    const forms = $('form');
    const iframes = $('iframe');
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
        } else {
            if (handlerHelpers.isAbsoluteUrl(src)) {
                $(this).attr('src', handlerHelpers.modifyUrl(src, req.seocromom.currentDomain));
            } else if (/^\/\//.test(src)) {
                $(this).attr('src', `https:${src}`);
            } else {
                let newSrc = /^\//.test(src) ? src : `/${src}`;
                newSrc = `https://${currentRealDomain}${newSrc}`;
                newSrc = handlerHelpers.modifyUrl(newSrc, req.seocromom.currentDomain);
                $(this).attr('src', newSrc);
            }
            $(this).attr("__mcopp", '1');
        }

        $(this).removeAttr("integrity");
    });

    /*images.each(function () {
        const src = $(this).attr('src');
        if (/^\/\//.test(src)) {
            $(this).attr('src', `https://${src}`);
            $(this).attr("__mcopp", '1');
        } else if (/^\//.test(src)) {
            $(this).attr('src', `https://${SERVICE_MAIN_DOMAIN}${src}`);
            $(this).attr("__mcopp", '1');
        }
    });*/

    /*iframes.each(function () {
        const src = $(this).attr("src");
        //console.log(src);
        if (typeof src !== "undefined") {
            //utils.writeToLog("iframe url: " + src);
            $(this).attr("src", handlerHelpers.modifyUrl(src, req.seocromom.currentDomain));
            $(this).attr("__mcopp", '1');
        }

        $(this).removeAttr("integrity");
    });*/

    return $.html();
};

internals.notConnected = function($) {
    return false;
};


ViewsLimitChecker.isRelated = function (req) {
    return /\/member\/domain-detail\/.+\//.test(req.url + '');
};

ViewsLimitChecker.isNewView = function (req) {
    return req.method === 'GET' && /\/member\/domain-detail\/.+\//.test(req.url + '');
};

ViewsLimitChecker.dailyLimitIsReached = async function (userId, siteId, globalParams) {
    const dailyLimit = Number.parseInt(globalParams.pbnpremiumViewLimit);
    const dailyCounter = await viewsCounter(userId, siteId);

    return dailyCounter >= dailyLimit;
};

ViewsLimitChecker.incrementCounter = async function (userId, siteId) {
    await PbnpremiumViews.create({
        userId: userId,
        siteId: siteId
    });
};

internals.injectJsAdaptor = async function($) {
    const regExp = new RegExp("sites" + "\\" + path.sep + "pbnpremium");
    let fullPath = __dirname.replace(regExp, "api/frontend-compos/pbnpremium-adapter.js");

    const jsCode = await handlerHelpers.getLocalJsFile(fullPath);
    //await utils.writeToLog(jsCode);
    $("head").append('<script type="text/javascript" class="seoc-injs">' + jsCode + '</script>');
    return $.html();
};