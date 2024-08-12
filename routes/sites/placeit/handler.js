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


const SERVICE_MAIN_DOMAIN = 'placeit.net';
const SERVICE_ROOT_DOMAIN = 'placeit.net';

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

        const domainRegexp = (request.seocromom.currentDomain + '').replace(/\./, '\\.');
        targetedUrl = (targetedUrl + '').replace(new RegExp(domainRegexp, 'gm'), SERVICE_MAIN_DOMAIN);

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
                        reply.header('location', servicesDetails.placeit.homeUrl);
                        return reply.code(302).send("Redirecting...");
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
            appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.placeit.name}).exec();
            if (appCookiesModel) {
                cookiesManager.setOldCookies(appCookiesModel.cookies);
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
                {name: servicesDetails.placeit.name},
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
            return reply.code(statusCode).header('location', newLocation);
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
                    await AppCookiesListModel.deleteMany({name: servicesDetails.placeit.name});
                    reply.header('location', servicesDetails.placeit.homeUrl);
                    reply.code(302).send("Redirecting...");
                }
                body = handlerHelpers.injectJsScriptInHead(body, "https://" + request.seocromom.currentDomain + "/mcop-compos123456789.js");
                body = handlerHelpers.injectPageBase(body, requestFullUrl, realFullUrl, request.seocromom.currentDomain);

                const $ = cheerio.load(body);
                body = internals.removeInlineContentSecurityPolicy($);
                //body = internals.removeUselessParts($, request);
                body = await internals.injectJsAdaptor($, request);
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
    return typeof url !== "string" ||
        /\/login/i.test(url) || /\/account/i.test(url) ||
        /\/purchases/i.test(url) ||
        /\/my_folders/i.test(url) || /\/logout/i.test(url);
};

internals.injectJsAdaptor = async function($, req) {
    const regExp = new RegExp("sites" + "\\" + path.sep + "placeit");
    let fullPath = __dirname.replace(regExp, "api/frontend-compos/placeit-adapter.js");
    const headerBlock = $("head");
    if (req.seocromom.currentUser.role !== 'admin') {
        const jsCode = await handlerHelpers.getLocalJsFile(fullPath);
        headerBlock.append('<script type="text/javascript" class="seoc-injs">' + jsCode + '</script>');
        headerBlock.append('<style type="text/css" class="seoc-incss">.item.my-account{display: none !important;}</style>');
    }
    
    return $.html();
};