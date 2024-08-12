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
const {SemrushKeyword, keywordsCounter} = require("../../api/db/models/SemrushKeywordModel");
const {SemrushDomain, domainsCounter} = require("../../api/db/models/SemrushDomainModel");
const loginAgent = require("./LoginAgent").create();


const SERVICE_MAIN_DOMAIN = 'www.semrush.com';
const SERVICE_ROOT_DOMAIN = 'semrush.com';
const SERVICE_STATIC_SUB_DOMAIN = "static.semrush.com";
const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};
const KeywordLimitChecker = {};
const DomainExplLimitChecker = {};

module.exports = async function (request, reply) {
    try {
        //await utils.writeToLog(request.url)

        if (/^\/do-auto-login$/.test(request.url)) {
            await internals.doAutoLogin(loginAgent, reply, request.seocromom.globalParams.semrushUsername,
                request.seocromom.globalParams.semrushPassword, request.seocromom.globalParams.twoCaptchaApiKey,
                servicesDetails.semrush.homeUrl);
            return true;
        } else if (loginAgent.isInLockMode()) {
            return reply.send("Please a connection is already underway. Retry in a few minutes.");
        }

        let targetedUrl = request.url + '';
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

        if (/competitive-list-widget/.test(request.url))
            targetedHost = SERVICE_STATIC_SUB_DOMAIN;

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
                        reply.header('location', servicesDetails.semrush.homeUrl);
                        return reply.code(302).send("Redirecting...");
                    }

                    if (request.seocromom.currentUser.role !== 'admin') {
                        const userId =  request.seocromom.currentUser.id;
                        const siteId =  request.seocromom.siteId;
                        const errorMsg = '<div style="color: red; font-size: 20px; font-weight: bold">Sorry but your daily limit is reached.</div>';

                        if (await KeywordLimitChecker.dailyLimitIsReached(userId, siteId, request.seocromom.globalParams) &&
                            KeywordLimitChecker.isRelated(request)) {
                            reply.header('content-type', 'text/html');
                            return reply.send(errorMsg);
                        } else if (KeywordLimitChecker.isNewSearch(request)) {
                            await KeywordLimitChecker.incrementCounter(userId, siteId, request.body.params.phrase);
                        } else if (await DomainExplLimitChecker.dailyLimitIsReached(userId, siteId, request.seocromom.globalParams) &&
                            DomainExplLimitChecker.isRelated(request)) {
                            return reply.send(errorMsg);
                        } else if (DomainExplLimitChecker.isNewSearch(request)) {
                            await DomainExplLimitChecker.incrementCounter(userId, siteId, request.body.params.args.searchItem)
                        }
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
            appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.semrush.name}).exec();
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

        if (typeof serverRes.headers['set-cookie'] !== "undefined" && ! utils.isStaticRes(request.url)) {
            const check = cookiesManager.merge(serverRes.headers['set-cookie'], SERVICE_MAIN_DOMAIN);
            await AppCookiesListModel.findOneAndUpdate(
                {name: servicesDetails.semrush.name},
                {cookies: cookiesManager.getAllAsObject()},
                {new:true, upsert: true}
            );
        }

        if (typeof serverRes.headers['location'] !== "undefined") {
            if (/\/login/.test(serverRes.headers['location']) && ! utils.isStaticRes(request.url) && ! /disable_soft/.test(request.url)) {
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

        if (serverRes.headers['content-encoding']) {
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
        }


        if (/\/sso\/logout/.test(request.url + "")) {
            if (request.seocromom['currentUser'].role === "admin" || (targetedUrl.includes('multilogin') && statusCode === 200))
                await AppCookiesListModel.deleteMany({name: servicesDetails.semrush.name});
        }

        //Remove useless parts from web pages before they're served
        if (handlerHelpers.mimeIsHtml(serverRes.headers['content-type'] + '')) {

            body = body.toString();
            if (body.length > 0 && handlerHelpers.isHtml(body)) {
                if (statusCode === 400 && /Request\sHeader\sOr\sCookie\sToo\sLarge/m.test(body)) {
                    await AppCookiesListModel.deleteMany({name: servicesDetails.semrush.name});
                    reply.header('location', servicesDetails.semrush.homeUrl);
                    return reply.code(302).send("Redirecting...");
                }

                body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
                body = handlerHelpers.injectPageBase(body,requestFullUrl, realFullUrl,
                    request.seocromom.currentDomain);

                const $ = cheerio.load(body);
                body = internals.removeInlineContentSecurityPolicy($);
                body = internals.removeUselessParts($, request);
                body = await internals.injectJsAdaptor($);

                if (internals.notConnected(body) && serviceDomainRegExp.test(targetedHost) && ! utils.isStaticRes(request.url)) {
                    //await utils.writeToLog(`Login url : ${request.url} \n`);
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

        reply.header('content-length', Buffer.byteLength(body));
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

internals.doAutoLogin = async function(loginAgent, res, username, password, twoCaptchaApiKey, homeUrl) {
    let respData = '';
    loginAgent.set2CaptchaApiKey(twoCaptchaApiKey);
    await loginAgent.connect_bypassRecaptcha(username, password)
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

internals.isForbiddenUrl = function(url) {
    //|| /\/multilogin/.test(url) || /\/signup/.test(url)
    return typeof url !== "string" ||
        /\/i18n\/switch_language_api/.test(url)
        || /\/i18n\/set_language/.test(url) || /\/login/.test(url)
        || /\/signup/.test(url)
        || /\/logout/.test(url) || /\/accounts/.test(url)
        || /\/billing-admin\/profile\/subscription/.test(url) || /\/corporate\/account/.test(url)
        || /\/product\/payments/.test(url) || /\/accounts.+/.test(url)
        || /\/api-documentation/.test(url) || /\/prices/.test(url)
        || /\/features/.test(url) || /\/kb/.test(url)
        || /\/company.+/.test(url) || /\/stats.+/.test(url)
        || /\/signup/.test(url) || /\/webinars/.test(url)
        || /\/user\//.test(url) || /\/news/.test(url)
        || /\/blog.+/.test(url) || /\/sensor/.test(url);
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
    const loginBtn = $('.srf-login-btn');

    if (loginBtn !== null && loginBtn.length === 0 && typeof req.seocromom.currentUser === 'object' &&  req.seocromom.currentUser.role !== "admin") {
        $("#srf-header .srf-navbar__primary").remove();
        $("#srf-header .srf-navbar__right").remove();
        $("#srf-footer .s-container.-outer.srf-footer__content").remove();
    }


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

internals.notConnected = function(html) {
    return /srf-login-btn|Checking\syour\sbrowser|srf-login-btn__text/.test(html);
};


KeywordLimitChecker.isRelated = function (req) {
    return /\/analytics\/keywordoverview/.test(req.url + "") ||
        /\/analytics\/keywordmagic/.test(req.url + "");
};

KeywordLimitChecker.isNewSearch = function (req) {
    return req.method === 'POST' &&
        typeof req.body === 'object' &&
        ((/\/kmt\/rpc/.test(req.url) && req.body.method === "keywords.GetInfoOverviewN") ||
        (/\/kmtgw\/rpc/.test(req.url) && req.body.method === "fts.GetKeywords"));
};

KeywordLimitChecker.dailyLimitIsReached = async function (userId, siteId, globalParams) {
    const dailyLimit = Number.parseInt(globalParams.semrushKeywordLimit);
    const dailyCounter = await keywordsCounter(userId, siteId);

    return dailyCounter >= dailyLimit;
};

KeywordLimitChecker.incrementCounter = async function (userId, siteId, phrase) {
    await SemrushKeyword.create({
        userId: userId,
        siteId: siteId,
        phrase: phrase
    });
};

DomainExplLimitChecker.isRelated = function (req) {
    return /\/analytics\/overview\//.test(req.url + "");
};

DomainExplLimitChecker.isNewSearch = function (req) {
    return /\/dpa\/rpc/.test(req.url) &&
        typeof req.body === 'object' &&
        typeof req.body.params === 'object' &&
        req.body.method === "dpa.IsRootDomain" &&
        req.body.params.report === "domain.overview";
};

DomainExplLimitChecker.dailyLimitIsReached = async function (userId, siteId, globalParams) {
    const dailyLimit = Number.parseInt(globalParams.semrushDomainExplorerLimit);
    const dailyCounter = await domainsCounter(userId, siteId);

    return dailyCounter >= dailyLimit;
};

DomainExplLimitChecker.incrementCounter = async function (userId, siteId, domain) {
    await SemrushDomain.create({
        userId: userId,
        siteId: siteId,
        domain: domain
    });
};

internals.injectJsAdaptor = async function($) {
    const regExp = new RegExp("sites" + "\\" + path.sep + "semrush");
    let fullPath = __dirname.replace(regExp, "api/frontend-compos/semrush-adapter.js");

    const jsCode = await handlerHelpers.getLocalJsFile(fullPath);
    //await utils.writeToLog(jsCode);
    $("head").append('<script type="text/javascript" class="seoc-injs">' + jsCode + '</script>');
    return $.html();
};