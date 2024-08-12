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
const {LowfruitsCredit, creditCounter} = require("../../api/db/models/LowfruitsCreditModel");


const SERVICE_MAIN_DOMAIN = 'lowfruits.io';
const SERVICE_ROOT_DOMAIN = 'lowfruits.io';
const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};
const CreditLimitChecker = {};

module.exports = async function (request, reply) {
    if (internals.isBulkAnalysis(request)) {
        return reply.send('Not allowed');
    }
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
                        reply.header('location', servicesDetails.lowfruits.homeUrl);
                        return reply.code(302).send("Redirecting...");
                    }

                    if (request.seocromom.currentUser.role !== 'admin') {
                        const userId =  request.seocromom.currentUser.id;
                        const siteId =  request.seocromom.siteId;
                        const errorMsg = '<div style="color: red; font-size: 20px; font-weight: bold">Sorry but your daily limit is reached.</div>';

                        if (await CreditLimitChecker.dailyLimitIsReached(userId, siteId, request.seocromom.globalParams) &&
                            (CreditLimitChecker.isNewAction(request) || CreditLimitChecker.isRelated(targetedUrl))) {
                            reply.header('content-type', 'text/html');
                            return reply.send(errorMsg);
                        } else if (CreditLimitChecker.isNewAction(request)) {
                            await CreditLimitChecker.incrementCounter(userId, siteId);
                        }
                    }
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

        let appCookiesModel = false;
        if (! utils.isStaticRes(request.url)) {
            appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.lowfruits.name}).exec();
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
            if (appCookiesModel) {
                await AppCookiesListModel.updateOne({_id: appCookiesModel._id},
                    {
                        name: servicesDetails.lowfruits.name,
                        cookies: cookiesManager.getAllAsObject(),
                        changeDate: Date.now()
                    });
            } else {
                await AppCookiesListModel.create({
                    name: servicesDetails.lowfruits.name,
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

        if (/\/logout/.test(request.url + "") && request.seocromom['currentUser'].role === "admin") {
            await AppCookiesListModel.deleteMany({name: servicesDetails.lowfruits.name});
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
                    await AppCookiesListModel.deleteMany({name: servicesDetails.lowfruits.name});
                    reply.header('location', servicesDetails.lowfruits.homeUrl);
                    return reply.code(302).send("Redirecting...");
                }

                body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
                body = handlerHelpers.injectPageBase(body, requestFullUrl, realFullUrl, request.seocromom.currentDomain);

                const $ = cheerio.load(body);
                if (serviceDomainRegExp.test(targetedHost)) {
                    body = await internals.injectJsAdaptor($);
                }
                body = internals.removeInlineContentSecurityPolicy($);
                body = internals.removeUselessParts($, request, targetedUrl);
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
    return typeof url !== "string"
        || /\/login/.test(url) || /\/register/.test(url)
        || /\/logout/.test(url) || /\/dashboard\/profile/.test(url)
        || /\/dashboard\/settings/.test(url) || /\/dashboard\/payments/.test(url)
        || /\/pricing/.test(url) || /\/ideas/.test(url);
};


internals.removeUselessParts = function($, req, realUrl) {
    const anchors = $('a');
    const links = $('link');
    const paragraphs = $('p');
    const scripts = $('script');
    const images = $('img');
    const forms = $('form');
    const iframes = $('iframe');
    const localUrl = "https://" + req.seocromom.currentDomain;

    const buttons = $(`button.btn-info`);
    buttons.each(function () {
        if ($(this).attr('wire:click') && $(this).attr('wire:click')=== 'select(\'publisher\')' && /analyze/i.test($(this).text() + '')) {
            $(this).parent().parent().remove();
        }
    });

    scripts.each(function () {
        const src = $(this).attr('src');
        if (typeof src === "undefined") {
            let jsCode = $(this).html();
            if (/crisp/im.test(jsCode)) {
                $(this).remove();
                return;
            }

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
            if (/^\/\//.test(src)) {
                $(this).attr('src', `https:${src}`);
                $(this).attr("__mcopp", '1');
            } else if (/^\//.test(src)) {
                $(this).attr('src', `https://${SERVICE_MAIN_DOMAIN}${src}`);
                $(this).attr("__mcopp", '1');
            }

            /*if (/livewire/.test(src))
                $(this).remove();*/
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

    return $.html();
};

internals.notConnected = function($) {
    return ($('a[href*="login"]').length > 0 && $('a[href*="signup"]').length > 0) || ($('#email').length > 0 && $('#password').length > 0);
};

internals.injectJsAdaptor = async function($) {
    const regExp = new RegExp("sites" + "\\" + path.sep + "lowfruits");
    let fullPath = __dirname.replace(regExp, "api/frontend-compos/lowfruits-adapter.js");

    const jsCode = await handlerHelpers.getLocalJsFile(fullPath);
    //await utils.writeToLog(jsCode);
    $("head").append('<script type="text/javascript" class="seoc-injs">' + jsCode + '</script>');
    return $.html();
};

internals.isBulkAnalysis = function(request) {
    if (/livewire\/message\/keywords/.test(request.url) &&
        request.method.toLocaleLowerCase() === 'post' &&
        /application\/json/.test(request.headers['content-type'])) {
        const bodyObjt = JSON.parse(request.seocromom['requestBody']);
        return bodyObjt.serverMemo && bodyObjt.serverMemo.data && bodyObjt.serverMemo.data.selected &&
            /,/mg.test(JSON.stringify(bodyObjt.serverMemo.data.selected)) &&
            Array.isArray(bodyObjt.updates) && bodyObjt.updates[0] && bodyObjt.updates[0].payload &&
            bodyObjt.updates[0].payload.method === 'multiple_selection_analysis';
    }
    
    return false;
};

internals.genericBulkObject = function() {
    return {
        effects: {
            dirty: ["message", "message_type"],
            emits: [{event: "TableUpdated", params: []}],
            html: "",
        },
        serverMemo: {
            checksum: null,
            data: {
                analyzed: null,
                any_words: null,
                are_counter: null,
                best_counter: null,
                can_counter: null,
                da_below_threshold_counter: null,
                data: null,
                discovered_counter: null,
                do_counter: null,
                does_counter: null,
                find: null,
                for_counter: null,
                hidden: null,
                high_intent_counter: null,
                how_counter: null,
                imported: null,
                initial_counter: null,
                intent_not_answered_counter: null,
                is_counter: null,
                message: "No more credits !",
                message_type: "warning",
                negative_keywords: null,
                not_paa_counter: null,
                paa_counter: null,
                positive_keywords: null,
                processing: true,
                saved: null,
                selectAll: null,
                selectPage: null,
                selected: null,
                sortByForum: null,
                total_counter: null,
                vs_counter: null,
                weak_counter: null,
                weak_websites_counter: null,
                what_counter: null,
                which_counter: null,
                why_counter: null,
                with_counter: null,
                word: null,
                words: null,
            },
            htmlHash: null
        }
    };
};


CreditLimitChecker.isNewAction = function (request) {
    if (/livewire\/message\/keywords/.test(request.url) &&
        request.method.toLocaleLowerCase() === 'post' &&
        /application\/json/.test(request.headers['content-type'])) {
        const bodyObjt = JSON.parse(request.seocromom['requestBody']);
        return Array.isArray(bodyObjt.updates) && bodyObjt.updates[0] && bodyObjt.updates[0].payload &&
            (bodyObjt.updates[0].payload.method === 'multiple_selection_analysis' ||
                bodyObjt.updates[0].payload.method === 'fetch_serp');
    }

    return false
};

CreditLimitChecker.isRelated = function (url) {
    return /\/dashboard\/searches\/.+/.test(url);
};

CreditLimitChecker.dailyLimitIsReached = async function (userId, siteId, globalParams) {
    const dailyLimit = Number.parseInt(globalParams.lowfruitsCreditLimit);
    const dailyCounter = await creditCounter(userId, siteId);

    return dailyCounter >= dailyLimit;
};

CreditLimitChecker.incrementCounter = async function (userId, siteId) {
    await LowfruitsCredit.create({
        userId: userId,
        siteId: siteId,
    });
};