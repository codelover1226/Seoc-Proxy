const process = require('process');
const zlib = require('zlib');
const querystring = require("querystring");
const cheerio = require("cheerio");
const path = require("path");
const fs = require("fs");
const atob = require("atob");
const btoa = require("btoa");
const mime = require('mime-types');

const utils = require('../../api/Utils');
const webClient = require("../../api/WebClient").create(true);
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const servicesDetails = require("../../api/ServicesDetails");
const loginAgent = require("./LoginAgent").create();


const SERVICE_MAIN_DOMAIN = 'smodin.io';
const SERVICE_ROOT_DOMAIN = 'smodin.io';
const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({}, utils.randomUserAgent(0));
const internals = {};
const SMODIN_SESSION_FILE = `${__dirname}${path.sep}smodin_user_details.json`;

module.exports = async function (request, reply) {
    //await utils.writeToLog(request.url)
    if (internals.isBlockedDomain(request.url)) {
        reply.code(200);
        return internals.sendResponse(request, reply, "");
    }

    try {
        let targetedUrl = request.url;
        let targetedHost = SERVICE_MAIN_DOMAIN;
        let portNumber = 443;
        let refererUrl = "";
        let allCookies = "";

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

        let appCookiesModel = false;
        //we get current user only for non static resources
        if (! utils.isStaticRes(request.url)) {
            if (serviceDomainRegExp.test(targetedHost)) {
                if (typeof request.seocromom !== 'object' ||
                    typeof request.seocromom.currentUser !== 'object') {
                    return internals.sendResponse(request, reply, "Please connect");
                } else {
                    if (request.seocromom.currentUser.role !== 'admin' && internals.isForbiddenUrl(request.url)) {
                        reply.header('location', servicesDetails.smodin.homeUrl);
                        return internals.sendResponse(request, reply, "Redirecting...");
                    }
                }
            }

            appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.smodin.name}).exec();
            if (appCookiesModel)
                cookiesManager.setOldCookies(appCookiesModel.cookies);

            /*if (request.seocromom.currentUser.role !== 'admin') {
                cookiesManager.merge(handlerHelpers.getAllClientSideCookiesAsArray(request.headers["cookie"]));
            }*/

            allCookies = cookiesManager.getAsString();
        }

        if (/seoc\/admin\/do-logout.po/.test(request.url) &&
            request.seocromom.currentUser && request.seocromom.currentUser.role === "admin") {
            if (fs.existsSync(SMODIN_SESSION_FILE))
                fs.unlinkSync(SMODIN_SESSION_FILE);
            return reply.view('smodin-logout.pug');
        }

        //Handles the saving of smodin session details from the main browser to other connected users
        if ((request.url + '').includes('/firebase/save/u-details.po') && /^post$/i.test(request.method)) {
            let response = {
                "outcome": "success"
            };

            //For the admin
            if (request.seocromom.currentUser && request.seocromom.currentUser.role === "admin") {
                if (! fs.existsSync(SMODIN_SESSION_FILE)) {
                    const sessionDetails = JSON.parse(atob(request.body.toString()));
                    if (typeof sessionDetails.fbase_key === "string" && typeof sessionDetails.value === "object") {
                        //We save the sent session details
                        await utils.writeFile(SMODIN_SESSION_FILE, JSON.stringify(sessionDetails));
                    }
                }
            } else {
                response = {
                    "outcome": "success",
                };

                if (fs.existsSync(SMODIN_SESSION_FILE)) {
                    response["data"] = btoa(JSON.stringify(await utils.readFile(SMODIN_SESSION_FILE)));
                }
            }

            reply.header('content-type', 'application/json');
            reply.code(200);
            return internals.sendResponse(request, reply, JSON.stringify(response));
        } else if ((request.url + '').includes('/firebase/get/u-details.po') && /^get$/i.test(request.method)) {
            let response = {
                status: "offline"
            };

            if (fs.existsSync(SMODIN_SESSION_FILE)) {
                const rawData = await utils.readFile(SMODIN_SESSION_FILE);
                const currentSession = JSON.parse(rawData);
                if (currentSession.fbase_key) {
                    response.status = 'online';
                    response["data"] = btoa(rawData);
                }
            }

            reply.header('content-type', 'application/json');
            reply.code(200);
            return internals.sendResponse(request, reply, JSON.stringify(response));
        }


        const excludedHeaders = [
            "cookie","user-agent","sec-ch-ua","sec-ch-ua-mobile","sec-ch-ua-platform",
            "sec-fetch-user","upgrade-insecure-requests","host",
            "connection","pragma","accept-language", "x-real-ip",
            "x-forwarded-for", "x-hubspot-messages-uri", "accept-encoding"
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
        if (allCookies.length > 0) {
            allowedRequestHeaders["cookie"] = allCookies;
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
                        name: servicesDetails.smodin.name,
                        cookies: cookiesManager.getAllAsObject(),
                        changeDate: Date.now()
                    });
            } else {
                await AppCookiesListModel.create({
                    name: servicesDetails.smodin.name,
                    cookies: cookiesManager.getAllAsObject(),
                });
            }
        }

        if (typeof serverRes.headers['location'] !== "undefined") {
            /*if (/\/login/.test(serverRes.headers['location']) && ! utils.isStaticRes(request.url)) {
                reply.render("auto-login");
                return true;
            }*/

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
            if (body.length > 0) {
                if (statusCode === 400 && /Request\sHeader\sOr\sCookie\sToo\sLarge/m.test(body)) {
                    await AppCookiesListModel.deleteOne({name: servicesDetails.smodin.name});
                    reply.header('location', '/');
                    return internals.sendResponse(request, reply, "Redirecting...");
                }

                body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
                body = handlerHelpers.injectPageBase(body, requestFullUrl, realFullUrl);

                const $ = cheerio.load(body);
                body = internals.removeInlineContentSecurityPolicy($);
                body = internals.removeUselessParts($, request);

                if (serviceDomainRegExp.test(targetedHost)) {
                    body = await internals.injectSmodinJsAdaptor($);
                }
            }
        } else if (handlerHelpers.mimeIsJs(serverRes.headers['content-type'] + "") || /\.js/.test(request.url)) {
            /*if (typeof serverRes.headers['content-type'] === "undefined") {
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
            }*/
        }

        reply.code(statusCode);
        return internals.sendResponse(request, reply, body);
    } catch (e) {
        await utils.writeToLog(e);
        return reply.code(500).view('error.pug', {title : 'Internal error', msg : 'Smodin error'});
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
    return typeof url !== "string" || /\/login/i.test(url) || /\/signup/i.test(url) ||
        /\/account/i.test(url) || /\/relyingparty\/getOobConfirmationCode/i.test(url) ||
        /\/account\/downloads/i.test(url);
};

internals.isBlockedDomain = function(domain) {
    return typeof domain !== "string" ||
        /connect\.facebook\.net/i.test(domain) || /analytics\.tiktok\.com/i.test(domain) ||
        /static\.hotjar\.com/i.test(domain) || /script\.hotjar\.com/i.test(domain) ||
        /vars\.hotjar\.com/i.test(domain) || /googlesyndication\.com/i.test(domain) ||
        /googleadservices\.com/i.test(domain) || /adservice\.google\.com/i.test(domain) ||
        /doubleclick\.net/i.test(domain);
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
        if (/^\/\//.test(href)) {
            $(this).attr('href', `https://${href}`);
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
            $(this).attr('src', `https:${src}`);
            $(this).attr("__mcopp", '1');
        } else if (/^\//.test(src)) {
            $(this).attr('src', `https://${SERVICE_MAIN_DOMAIN}${src}`);
            $(this).attr("__mcopp", '1');
        }
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
    return $("a[href*='login']").length > 0;
};

internals.sendResponse = function(request, reply, data) {
    request = null;
    return reply.send(data);
};

internals.injectSmodinJsAdaptor = async function($) {
    const regExp = new RegExp("sites" + "\\" + path.sep + "smodin");
    let fullPath = __dirname.replace(regExp, "api/frontend-compos/google-firebase-login-checker-ab$012345.js");

    const jsCode = await handlerHelpers.getLocalJsFile(fullPath);
    //await utils.writeToLog(jsCode);
    $("head").append('<script type="text/javascript" class="seoc-injs">' + jsCode + '</script>');
    return $.html();
};