const process = require('process');
const zlib = require('zlib');
const fs = require('fs');
const querystring = require("querystring");
const cheerio = require("cheerio");
const path = require('path');

const utils = require('../../api/Utils');
const webClient = require("../../api/WebClient").create(true);
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const servicesDetails = require("../../api/ServicesDetails");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const SESSION_FILE_FULL_PATH = `${__dirname}/shared-session-file.json`;
const SERVICE_MAIN_DOMAIN = 'www.ranktracker.com';
const SERVICE_ROOT_DOMAIN = 'ranktracker.com';
const SERVICE_APP_DOMAIN = 'app.ranktracker.com';

const SERVICE_ROOT_URL = 'https://' + SERVICE_MAIN_DOMAIN;
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};

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

        const serviceDomainRegExp = new RegExp(SERVICE_ROOT_DOMAIN.replace(/\./, "\."));

        //we get current user only for non static resources
        if (! utils.isStaticRes(request.url)) {
            if (serviceDomainRegExp.test(targetedHost)) {
                if (typeof request.seocromom !== 'object' ||
                    typeof request.seocromom.currentUser !== 'object') {
                    return reply.send("Please connect");
                } else {
                    if (request.seocromom.currentUser.role !== 'admin') {
                        if (internals.isForbiddenUrl(request.url) ||
                            (targetedHost.includes(SERVICE_APP_DOMAIN) && handlerHelpers.isRootUrl(targetedUrl))) {
                            reply.header('location', servicesDetails.ranktracker.homeUrl);
                            return reply.code(302).send("Redirecting...");
                        }
                    }
                }
            }
        }

        if ((request.url + '').includes('/mcop-ranktracker/save_session')) {
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
        } else if ((request.url + '').includes('/mcop-ranktracker/get_session')) {
            if (internals.sessionFileExists()) {
                reply.header('content-type', 'application/json');
                reply.status(200).send(internals.getSessionDetails());
                return true;
            } else {
                reply.status(404).send('Session not found');
                return true;
            }
        } else if ((request.url + '').includes('/mcop-ranktracker/delete_session')) {
            if (request.seocromom.currentUser.role === 'admin') {
                internals.deleteSessionFile();
                return reply.view('ranktracker-delete-session.pug', {
                    redirectUrl: servicesDetails.ranktracker.homeUrl
                });
            } else {
                return reply.send('Not allowed.');
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

        const domainRegExp = new RegExp(request.seocromom.currentDomain, "mg");

        let appCookiesModel = false;
        if (! utils.isStaticRes(request.url)) {
            appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.ranktracker.name}).exec();
            if (appCookiesModel)
                cookiesManager.setOldCookies(appCookiesModel.cookies);

            //cookiesManager.merge(handlerHelpers.getAllClientSideCookiesAsArray(request.headers['cookie']), cookiesHost);

            const allCookies = cookiesManager.getAsString(targetedHost);
            if (allCookies.length > 0) {
                allowedRequestHeaders["cookie"] = allCookies;
            }
        }

        let requestData = '';
        if (/post|put|patch/i.test(request.method)) {
            requestData = request.seocromom['requestBody'];

            if (typeof requestData === 'string') {
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
            'set-cookie','timing-allow-origin','content-encoding',
            'transfer-encoding','access-control-allow-origin',
            'content-security-policy','referrer-policy','content-security-policy-report-only',
            'link'
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


        if (Array.isArray(serverRes.headers['set-cookie']) && ! utils.isStaticRes(request.url)) {
            const check = cookiesManager.merge(serverRes.headers['set-cookie'], SERVICE_MAIN_DOMAIN);
            if (appCookiesModel) {
                await AppCookiesListModel.updateOne({_id: appCookiesModel._id},
                    {
                        name: servicesDetails.ranktracker.name,
                        cookies: cookiesManager.getAllAsObject(),
                        changeDate: Date.now()
                    });
            } else {
                await AppCookiesListModel.create({
                    name: servicesDetails.ranktracker.name,
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

        if (handlerHelpers.mimeIsJs(serverRes.headers['content-type'] + "") ||
            ((request.url + '').includes('.js') && handlerHelpers.isJsCode(body))) {
            if (typeof serverRes.headers['content-type'] === "undefined") {
                reply.header("content-type", 'application/javascript');
            }


            body =  body.toString();

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
        } else if (handlerHelpers.mimeIsHtml(serverRes.headers['content-type'] + '') ||
            /application\/octet-stream/.test(serverRes.headers['content-type'] + '')) {
            const originalBody = body;
            body = body.toString();
            if (body.length > 0 && handlerHelpers.isHtml(body)) {
                if (statusCode === 400 && /Request\sHeader\sOr\sCookie\sToo\sLarge/m.test(body)) {
                    await AppCookiesListModel.deleteMany({name: servicesDetails.ranktracker.name});
                    reply.header('location', servicesDetails.ranktracker.homeUrl);
                    return reply.code(302).send("Redirecting...");
                }

                body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
                body = handlerHelpers.injectPageBase(body, requestFullUrl, realFullUrl);

                let $ = cheerio.load(body);
                body = internals.removeInlineContentSecurityPolicy($);
                body = internals.removeUselessParts($, request, targetedHost);
                body = await internals.injectJsAdaptor($);
            } else {
                body = originalBody;
            }
        } else if (handlerHelpers.mimeIsJson(serverRes.headers['content-type'] + '')) {
            let fakeJsCode = 'const injectedVar=' + body;
            fakeJsCode = handlerHelpers.replaceLocationInJsCode(fakeJsCode);
            body = fakeJsCode.replace('const injectedVar=', '');
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
    return typeof url !== "string" ||
        /\/account\//.test(url) ||
        /\/login/.test(url) ||
        /\/logout/.test(url) ||
        /\/pricing/.test(url) ||
        /\/forgotten-password/.test(url) ||
        /\/affiliate-program/.test(url);
};


internals.removeUselessParts = function($, req, currentRealDomain) {
    const scripts = $('script');
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
        }
        $(this).removeAttr("integrity");
    });

    return $.html();
};

internals.injectJsAdaptor = async function($) {
    const regExp = new RegExp("sites" + "\\" + path.sep + "ranktracker");
    let fullPath = __dirname.replace(regExp, "api/frontend-compos/ranktracker-adapter.js");

    const jsCode = await handlerHelpers.getLocalJsFile(fullPath);
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
    if (! fs.existsSync(SESSION_FILE_FULL_PATH)) return false;

    return fs.unlinkSync(SESSION_FILE_FULL_PATH);
};

internals.getSessionDetails = function() {
    return fs.readFileSync(SESSION_FILE_FULL_PATH).toString();
};