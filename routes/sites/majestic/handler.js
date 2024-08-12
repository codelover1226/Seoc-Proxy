const process = require('process');
const zlib = require('zlib');
const querystring = require("querystring");
const cheerio = require("cheerio");

const utils = require('../../api/Utils');
const webClient = require("../../api/WebClient").create(true);
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const {MajestickBacklinkModel, addToCurrentTotal, countBacklinks} = require("../../api/db/models/MajesticBacklinkModel");
const servicesDetails = require("../../api/ServicesDetails");
const loginAgent = require("./LoginAgent").create();


const SERVICE_MAIN_DOMAIN = 'majestic.com';
const SERVICE_ROOT_DOMAIN = 'majestic.com';
const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({}, utils.randomUserAgent(0));
const internals = {};
const BulkBacklinkChecker = {};

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
                        reply.header('location', servicesDetails.majestic.homeUrl);
                        return reply.status(302).send("Redirecting...");
                    }

                    if (request.seocromom.currentUser.role !== 'admin') {
                        const userId =  request.seocromom.currentUser.id;
                        const siteId =  request.seocromom.siteId;
                        const errorMsg = '<div style="color: red; font-size: 20px; font-weight: bold">Sorry but your daily limit is reached.</div>';

                        if (await BulkBacklinkChecker.dailyLimitIsReached(userId, siteId, request.seocromom.globalParams) &&
                            BulkBacklinkChecker.isRelated(request)) {
                            reply.header('content-type', 'text/html');
                            return reply.view("error.pug",
                                { title: "Daily limit reached", msg: "Oops! we're sorry but your daily bulk backlink check limit is reached." });
                        } else if (BulkBacklinkChecker.isNewCheck(request)) {
                            const parts = (request.body.q + '').split(/\s+/);
                            await utils.writeToLog(JSON.stringify(parts))
                            if (! Array.isArray(parts)) {
                                reply.header('content-type', 'text/html');
                                return reply.view("error.pug",
                                    { title: "Check error", msg: "Oops! we're sorry but an error occurred while trying to process your request." });
                            }

                            let nbOfDomains = 0;
                            for (let i = 0; i < parts.length; i++) {
                                if ((parts[i] + '').length > 0 && ! /\s/mg.test((parts[i] + '')))
                                    nbOfDomains++;
                            }

                            if (await BulkBacklinkChecker.newCheckIsOffLimit(userId, siteId, request.seocromom.globalParams, nbOfDomains)) {
                                const creditLeft = await BulkBacklinkChecker.remainingCredit(userId, siteId, request.seocromom.globalParams);
                                reply.header('content-type', 'text/html');
                                return reply.view("error.pug",
                                    { title: "Off limit", msg: `Sorry! You can not check more than ${creditLeft} domain(s).` });
                            }

                            await BulkBacklinkChecker.addToTotal(userId, siteId, nbOfDomains);
                        }
                    }
                }
            }
        }


        const excludedHeaders = [
            "cookie","user-agent","sec-ch-ua","sec-ch-ua-mobile","sec-ch-ua-platform",
            "sec-fetch-user","upgrade-insecure-requests","host",
            "connection","pragma","accept-language",
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
            appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.majestic.name}).exec();
            if (appCookiesModel)
                cookiesManager.setOldCookies(appCookiesModel.cookies);

            const allCookies = cookiesManager.getAsString();
            if (allCookies.length > 0) {
                //utils.writeToLog("cookies of " + targetHost);

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
                        name: servicesDetails.majestic.name,
                        cookies: cookiesManager.getAllAsObject(),
                        changeDate: Date.now()
                    });
            } else {
                await AppCookiesListModel.create({
                    name: servicesDetails.majestic.name,
                    cookies: cookiesManager.getAllAsObject(),
                });
            }
        }

        if (typeof serverRes.headers['location'] !== "undefined") {
            if (/\/login/.test(serverRes.headers['location'])) {
                await AppCookiesListModel.deleteOne({name: servicesDetails.majestic.name});
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

        if (/^\/account\/logout/.test(request.url + "") && request.seocromom['currentUser'].role === "admin") {
            await AppCookiesListModel.deleteMany({name: servicesDetails.majestic.name});
        }

        //Remove useless parts from web pages before they're served
        if (handlerHelpers.mimeIsHtml(serverRes.headers['content-type'] + '')) {
            body = body.toString();
            if (body.length > 0) {
                if (/header\sfield\sexceeds\sserver\slimit/m.test(body)) {
                    await AppCookiesListModel.deleteMany({name: servicesDetails.majestic.name});
                    reply.header('location', servicesDetails.majestic.homeUrl);
                    return reply.code(302).send("Redirecting...");
                }

                body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
                body = handlerHelpers.injectPageBase(body, requestFullUrl, realFullUrl);

                const $ = cheerio.load(body);
                body = internals.removeInlineContentSecurityPolicy($);
                body = internals.removeUselessParts($, request);
                if (request.seocromom['currentUser'].role !== "admin") body = internals.removeUploadFile($);
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
        return reply.status(statusCode).send(body);
    }  catch (e) {
        await utils.writeToLog('error on ' + request.url);
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
    return typeof url !== "string" || /\/account\/[a-z]/i.test(url);
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

    links.each(function () {
        const href = $(this).attr('href');
        if (/^\//.test(href)) {
            $(this).attr('href', `https://${SERVICE_MAIN_DOMAIN}${href}`);
            $(this).attr("__mcopp", '1');
        }
        $(this).removeAttr("integrity");
    });

    scripts.each(function () {
        const src = $(this).attr('src');
        if (/^\//.test(src)) {
            $(this).attr('src', `https://${SERVICE_MAIN_DOMAIN}${src}`);
            $(this).attr("__mcopp", '1');
        }
    });

    images.each(function () {
        const src = $(this).attr('src');
        if (/^\//.test(src)) {
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

    return $.html();
};

internals.notConnected = function($) {
    return $('.srf-login-btn').length > 0 || $(":contains('Checking your browser')").length > 0;
};

internals.removeUploadFile = function($) {
    const fileUploadWrapper = $('.file-upload-link-wrapper');
    if (fileUploadWrapper.length > 0)
        fileUploadWrapper.find('.link.pointer').remove();

    return $.html();
};


BulkBacklinkChecker.isRelated = function (req) {
    return /\/reports\/bulk-backlink-checker/.test(req.url + "");
};

BulkBacklinkChecker.isNewCheck = function (req) {
    return req.method === 'POST' &&
        /application\/x-www-form-urlencoded/.test(req.headers['content-type']) &&
        typeof req.body.q === 'string' &&
        /\/reports\/bulk-backlink-checker/.test(req.url);
};

BulkBacklinkChecker.dailyLimitIsReached = async function (userId, siteId, globalParams) {
    const dailyLimit = Number.parseInt(globalParams.majestickBulkBacklinkCheckLimit);
    const dailyCounter = await countBacklinks(userId, siteId);

    return dailyCounter >= dailyLimit;
};

BulkBacklinkChecker.newCheckIsOffLimit = async function (userId, siteId, globalParams, nbOfDomains) {
    const dailyLimit = Number.parseInt(globalParams.majestickBulkBacklinkCheckLimit);
    const dailyCounter = await countBacklinks(userId, siteId);

    return (dailyCounter + nbOfDomains) > dailyLimit;
};

BulkBacklinkChecker.remainingCredit = async function (userId, siteId, globalParams) {
    const dailyLimit = Number.parseInt(globalParams.majestickBulkBacklinkCheckLimit);
    const dailyCounter = await countBacklinks(userId, siteId);

    return dailyLimit - dailyCounter;
};

BulkBacklinkChecker.addToTotal = async function (userId, siteId, nbOfDomains) {
    await addToCurrentTotal(userId, siteId, nbOfDomains);
};