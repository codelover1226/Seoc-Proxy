const process = require('process');
const zlib = require('zlib');
const querystring = require("querystring");
const cheerio = require("cheerio");
const path = require("path");

const utils = require('../../api/Utils');
const webClient = require("../../api/WebClient").create(true);
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const servicesDetails = require("../../api/ServicesDetails");
const loginAgent = require("./LoginAgent").create();
const {DinorankKeyword, keywordsCounter} = require("../../api/db/models/DinorankKeywordModel");


const SERVICE_MAIN_DOMAIN = 'dinorank.com';
const SERVICE_ROOT_DOMAIN = 'dinorank.com';
const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({}, utils.randomUserAgent(0));
const internals = {};
const KeywordLimitChecker = {};

module.exports = async function (request, reply) {

    try {

        if (/^\/do-auto-login$/.test(request.url)) {
            return await internals.doAutoLogin(loginAgent, reply, request.seocromom.globalParams.dinorankUsername, request.seocromom.globalParams.dinorankPassword);
        } else if (loginAgent.isInLockMode()) {
            return reply.send("Please retry in a few minutes.");
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
                        reply.header('location', servicesDetails.dinorank.homeUrl);
                        return reply.status(302).send("Redirecting...");
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
                            await KeywordLimitChecker.incrementCounter(userId, siteId, request.body.keyword);
                        }
                    }
                }
            }
        }


        const excludedHeaders = [
            "cookie","user-agent","sec-ch-ua","sec-ch-ua-mobile","sec-ch-ua-platform",
            "sec-fetch-user","upgrade-insecure-requests","host",
            "connection","pragma","accept-language"
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
            appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.dinorank.name}).exec();
            if (appCookiesModel)
                cookiesManager.setOldCookies(appCookiesModel.cookies);

            /*if (request.seocromom.currentUser.role !== 'admin') {
                cookiesManager.merge(handlerHelpers.getAllClientSideCookiesAsArray(request.headers["cookie"]));
            }*/

            const allCookies = cookiesManager.getAsString();
            if (allCookies.length > 0) {
                /*utils.writeToLog("cookies of " + targetedHost);
                utils.writeToLog(allCookies);*/

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
                        name: servicesDetails.dinorank.name,
                        cookies: cookiesManager.getAllAsObject(),
                        changeDate: Date.now()
                    });
            } else {
                await AppCookiesListModel.create({
                    name: servicesDetails.dinorank.name,
                    cookies: cookiesManager.getAllAsObject(),
                });
            }
        }

        if (typeof serverRes.headers['location'] !== "undefined") {
            if (/\/log-in/.test(serverRes.headers['location']) && ! utils.isStaticRes(request.url)) {
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

        if (handlerHelpers.shouldBeDecompressed(serverRes.headers['content-type'])) {
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
        } else {
            if (typeof serverRes.headers['content-encoding'] !== 'undefined')
                reply.header('content-encoding', serverRes.headers['content-encoding']);
        }

        //Remove useless parts from web pages before they're served
        if (handlerHelpers.mimeIsHtml(serverRes.headers['content-type'] + '')) {
            body = body.toString();
            if (body.length > 0 && internals.contentIsHTML(body)) {
                if(/a\srequest\sheader\sfield\sexceeds\sserver\slimit/m.test(body)) {
                    await AppCookiesListModel.deleteOne({name: servicesDetails.dinorank.name});
                    reply.header('location', '/');
                    return reply.status(302).send("Redirecting...");
                }

                body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
                body = handlerHelpers.injectPageBase(body, requestFullUrl, realFullUrl);

                const $ = cheerio.load(body);
                body = internals.removeInlineContentSecurityPolicy($);
                body = internals.removeUselessParts($, request);

                if (internals.notConnected($) && serviceDomainRegExp.test(targetedHost) && ! utils.isStaticRes(request.url)) {
                    return reply.view("auto-login.pug");
                }
                body = body.replace(/location.href="https:\/\/dinorank.com\//mg, `location.href="https://${request.seocromom.currentDomain}`);
            } else if (/^(https:\/\/.+|http:\/\/.+)/.test(body)) {
                body = handlerHelpers.modifyUrl(body, request.seocromom.currentDomain);
            } else if (/{"status"/.test(body)) {
                 const data = JSON.parse(body);
                 if (data.message && /^(https:\/\/.+|http:\/\/.+)/.test(data.message + "")) {
                     data.message = handlerHelpers.modifyUrl(data.message, request.seocromom.currentDomain);
                     body = JSON.stringify(data);
                 }
            }
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

        reply.header("content-length", Buffer.byteLength(body));
        return reply.status(statusCode).send(body);
    } catch (e) {
        await utils.writeToLog(e);
        return reply.status(500).view('error.pug', {title: "Internal error", msg: 'Spinrewriter error'});
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
        /\/login/.test(url) || /\/registro/.test(url) || /\/usuario/.test(url) ||
        /\/soporte/.test(url) || /\/ajax\/cierra.php/.test(url);
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
    const basePathInput = $('#base_path');
    const urlRegExp = /https:\/\/dinorank\.com/;

    let inputValue = basePathInput.val() + "";
    basePathInput.val(inputValue.replace(urlRegExp, localUrl));

    links.each(function () {
        const href = $(this).attr('href');
        if (/^\/\//.test(href)) {
            $(this).attr("__mcopp", '1');
        } else if (/^\//.test(href)) {
            $(this).attr('href', `https://${SERVICE_MAIN_DOMAIN}${href}`);
            $(this).attr("__mcopp", '1');
        }
        $(this).removeAttr("integrity");
    });

    scripts.each(function () {
        const src = $(this).attr('src');
        if (/^\/\//.test(src)) {
            $(this).attr("__mcopp", '1');
        } else if (/^\//.test(src)) {
            $(this).attr('src', `https://${SERVICE_MAIN_DOMAIN}${src}`);
            $(this).attr("__mcopp", '1');
        }
    });

    images.each(function () {
        const src = $(this).attr('src');
        if (/^\/\//.test(src)) {
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
            $(this).attr("src", handlerHelpers.modifyUrl(src, request.seocromom.currentDomain));
            $(this).attr("__mcopp", '1');
        }

        $(this).removeAttr("integrity");
    });

    return $.html();
};

internals.notConnected = function($) {
    return $('a[href*="login"]').length > 0 && $('a[href*="homed"]').length === 0;
};

internals.contentIsHTML = function(content) {
    return typeof content === 'string' && /<html/.test(content);
};

KeywordLimitChecker.isRelated = function (request) {
    return /\/keyword-research/.test(request.url + "");
};

KeywordLimitChecker.isNewSearch = function (request) {
    return request.method === 'POST' && /\/ajax\/kresearch\.php/.test(request.url);
};

KeywordLimitChecker.dailyLimitIsReached = async function (userId, siteId, globalParams) {
    const dailyLimit = Number.parseInt(globalParams.dinorankKeywordLimit);
    const dailyCounter = await keywordsCounter(userId, siteId);

    return dailyCounter >= dailyLimit;
};

KeywordLimitChecker.incrementCounter = async function (userId, siteId, phrase) {
    await DinorankKeyword.create({
        userId: userId,
        siteId: siteId,
        phrase: phrase
    });
};