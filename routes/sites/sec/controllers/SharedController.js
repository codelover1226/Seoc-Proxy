"use strict";

const fs = require("fs");
const https = require("https");
const path = require("path");
const process = require("process");
const querystring = require("querystring");
const crypto = require("crypto");
const base64 = require("nodejs-base64-encode");
const cheerio = require("cheerio");
const utils = require("../../../api/Utils");
const WordpressSiteModel = require("../../../api/db/models/WordpressSiteModel");
const SessionModel = require("../../../api/db/models/SessionModel");
const ParamModel = require("../../../api/db/models/ParamModel");
const paramNames = require("../../../api/ParamNames");
const mongoDb = require("../../../api/db/Db").create();
const allServicesDetails = require("../../../api/ServicesDetails");
const adminUrls = require('../../../api/AdminUrls');




module.exports.create = function (request, reply) {
    return new SharedController(request, reply);
};



function SharedController(request, reply) {
    this.request = request;
    this.reply = reply;
}


/**
 * This method creates a session with a user (either the admin or a member). It expects a payload of this format
 * token=value. The submitted token is of this format signature#time#data.
 * * **signature** is hashed (generated with the SHA1 algorithm) value encoded in base 64. The original string value contains
 * the remote user agent, the new line character (\n), the remote IP address, the time (since the epoch) and user details (in json).
 * That sting is hashed with the app secret code.
 * * **time** is a base 64 encoded string representing the time (expressed in seconds since the epoch).
 * * **data** is a base 64 encoded string representing the users' details (in json) namely a user id, a session cookie in WordPress,
 * a nonce token, an integer (0 for regular member, 1 for administrators.
 * @method connect
 * @return {Promise<void>}
 */
SharedController.prototype.connect = async function() {
    let wordpressSessionDetails, errorFound = false, wordpressSite, headers, userDetails, isConnected =false;
    const thisCont = this, ADMIN = 1, MEMBER = 0;


    await this.processConnectionForm()
        .then(async function (data) {
            wordpressSessionDetails = data;
        }).catch(async function (error) {
            await utils.writeToLog(error);
            errorFound = true;
        });


    if (errorFound) {
        thisCont.reply.code(500);
        return thisCont.reply.view("error.pug",
            { title: "Connection failure", msg: "Couldn't connect due to authentication error. Contact admin" });
    }

    try {
        const result = await mongoDb.connect();
        wordpressSite = await WordpressSiteModel.findById(wordpressSessionDetails.wordPressSite).exec();
    } catch (error) {
        await utils.writeToLog(error);
        thisCont.reply.code(500);
        return thisCont.reply.view("error.pug",
            { title: "Connection failure", msg: "Couldn't read global parameters. Contact admin" });
    }

    let wordpessUrl = wordpressSite.rootUrl;
    let wordpressDomain = wordpressSite.rootUrl.replace(/https:\/\//, "");
    let wpMePath = wordpressSite.restMeApiPath;
    let membershipProPath = wordpressSite.membershipProApiPath;
    let membershipProKey = wordpressSite.membershipProApiKey;

    headers = {
        "User-Agent": utils.randomUserAgent(),
        "Cookie": wordpressSessionDetails.cookie,
        "X-WP-Nonce": wordpressSessionDetails.nonce,
        "Accept": 'application/json',
    };

    const wordpressMeApiUrl = wordpessUrl + wpMePath;

    errorFound = false;
    let wordpressSiteRespStr = null;
    await thisCont.makeRequestToWordpress(wordpressDomain, wpMePath, headers)
        .then(async function (response) {
            if (response.statusCode === 200) {
                userDetails = JSON.parse(response.body);
                isConnected = true;
            } else {
                wordpressSiteRespStr = (typeof response === 'object' && response !== null) ? JSON.stringify(response) : response;
                await utils.writeToLog(`Connection to ${wordpressMeApiUrl} failed with response ${wordpressSiteRespStr}`);
            }
        }).catch(async function (error) {
            await utils.writeToLog(error);
            errorFound = true;
        });


    if (errorFound) {
        thisCont.reply.code(500);
        return thisCont.reply.view("error.pug",
            { title: "Connection error", msg: "An error occurred. We couldn't check your details. Please retry if it persists contact the admin." });
    }

    if (! isConnected) {
        if (typeof wordpressSiteRespStr !== 'string') {
            const loggedMsg = "An error occured. We couldn't check your details. " +
                "Please retry if it persists contact the admin. Maybe <b>" + wordpressMeApiUrl + "</b> is not reachable";
            await utils.writeToLog(loggedMsg);
        }

        let errorMsg = "An error occurred. We couldn't check your details. Please retry if it persists contact the admin.";
        if (typeof wordpressSiteRespStr === 'string' && /rest_cookie_invalid_nonce/.test(wordpressSiteRespStr)) {
            errorMsg = "An error occurred. We couldn't check your details. In order to fix it reload the connection page and retry.";
        }

        thisCont.reply.code(500);
        return thisCont.reply.view("error.pug",
            { title: "Connection error", msg: errorMsg});
    }


    const sessionToken = utils.randCode(80, 120);
    const sessionModel = new SessionModel();
    sessionModel.token = sessionToken;
    sessionModel.ipAddress = thisCont.request.socket.remoteAddress;
    sessionModel.userAgent = thisCont.request.headers["user-agent"];

    sessionModel.user = {
        id: userDetails.id,
        username: userDetails.name,
    };
    sessionModel.siteId = wordpressSessionDetails.wordPressSite;
    sessionModel.userId = userDetails.id;
    sessionModel.service = wordpressSessionDetails.service;
    sessionModel.creationDate = new Date();
    sessionModel.lastRequestDate = new Date();

    if (wordpressSessionDetails.userType === ADMIN) {
        try {
            sessionModel.user['role'] = 'admin';
            const result = await mongoDb.connect();
            await SessionModel.findOneAndDelete({
                siteId: sessionModel.siteId,
                userId: sessionModel.userId,
                service: wordpressSessionDetails.service,
            });
            await sessionModel.save();
            await mongoDb.close();

            let fullCookie = allServicesDetails[wordpressSessionDetails.service].cookieName + "=" + sessionToken + "; Path=/;";
            const adminDomain = (thisCont.request.seocromom.adminDomain + '');
            if (wordpressSessionDetails.service === allServicesDetails.seocromom.name) {
                const adminDomainParts = adminDomain.split(/\./g);
                const matches = adminDomain.match(/\./g);
                if (Array.isArray(matches) && matches.length >= 2) {
                    const rootDomain = (thisCont.request.seocromom.adminDomain + '').replace(adminDomainParts[0] + '.', '');
                    fullCookie += ` Domain=${rootDomain};`;
                }
            }
            fullCookie += ` Secure;`;
            thisCont.reply.header("set-cookie", fullCookie);
            const fullUrl = 'https://' + thisCont.request.seocromom.currentDomain + allServicesDetails[wordpressSessionDetails.service].homeUrl;
            return thisCont.reply.view("redirecting", {redirectUrl: fullUrl});
        } catch (error) {
            await utils.writeToLog(error);
            thisCont.reply.code(500);
            return thisCont.reply.view("error.pug",
                { title: "Connection error", msg: "Couldn't save session details. Contact admin." });
        }
    }


    const proApiPath = membershipProPath + "?ihch=" +
        membershipProKey;
    const membershipUrl = proApiPath + "&action=get_user_levels&uid=" + wordpressSessionDetails.userId;

    const fullUrl = wordpressSite.rootUrl + membershipUrl;
    errorFound = false;
    let subscriptionDetails;
    await thisCont.makeRequestToWordpress(wordpressDomain, membershipUrl, headers)
        .then(async function (response) {
            if (response.statusCode === 200) {
                await utils.writeToLog(response.body);
                subscriptionDetails = JSON.parse(response.body);
            } else {
                errorFound = true;
                const respStr = (typeof response === 'object' && response !== null) ? JSON.stringify(response) : response;
                await utils.writeToLog(`Connection to ${fullUrl} failed with response ${respStr}`);
            }

        }).catch(async function (error) {
            await utils.writeToLog(error);
            errorFound = true;
        });

    if (errorFound) {
        await utils.writeToLog(fullUrl + " is not reachable");
        thisCont.reply.code(500);
        return thisCont.reply.view("error.pug",
            { title: "Connection error", msg: "Unable to check your subscription." });
    }


    if (typeof subscriptionDetails.response === "undefined") {
        thisCont.reply.code(500);
        return thisCont.reply.view("error.pug",
            { title: "Connection error", msg: "No active subscription plan found." });
    }

    let activePlanFound = false;
    for (let prop in subscriptionDetails.response) {
        if (typeof subscriptionDetails.response[prop] === "object" && subscriptionDetails.response[prop].is_expired === false) {
            activePlanFound = true;
            break;
        }
    }

    if (! activePlanFound) {
        thisCont.reply.code(500);
        return thisCont.reply.view("error.pug",
            { title: "Connection error", msg: "No active subscription plan found." });
    }

    try {
        sessionModel.user['role'] = 'member';
        const result = await mongoDb.connect();
        await SessionModel.findOneAndDelete({
            siteId: sessionModel.siteId,
            userId: sessionModel.userId,
            service: wordpressSessionDetails.service,
        });
        await sessionModel.save();
        await mongoDb.close();

        if (allServicesDetails[wordpressSessionDetails.service]) {
            const fullCookie = allServicesDetails[wordpressSessionDetails.service].cookieName + "=" + sessionToken + "; Path=/; Secure";
            thisCont.reply.header("set-cookie", fullCookie);
            const appRelUrl = allServicesDetails[wordpressSessionDetails.service].homeUrl;
            return thisCont.reply.view("redirecting", {redirectUrl: appRelUrl});
        } else {
            await utils.writeToLog("Unknown service :" + wordpressSessionDetails.service + ' from ip : ' + thisCont.request.socket.remoteAddress);
            thisCont.reply.code(500);
            return thisCont.reply.view("error.pug",
                { title: "Connection error", msg: "Unknown service. Contact admin." });
        }
    } catch (error) {
        thisCont.reply.code(500);
        return thisCont.reply.view("error.pug",
            { title: "Connection error", msg: "Couldn't save session details. Contact admin." });
    }
};

/**
 * This method logs a user out his currently opened session.
 * @method logout
 * @return {Promise<boolean>}
 */
SharedController.prototype.logout = async function() {
    /*const cookies = new Cookies(this.request, this.reply);
    const sessionManager = sessionManCreator.create();
    let errorFound = false;

    let sentSessionCookie = undefined;
    const appCookies = [
        sessionManager.ADMIN_COOKIE_NAME,
    ];

    for (let serviceName in allServicesDetails) {
        appCookies.push(allServicesDetails[serviceName].cookieName);
    }

    for (let i = 0; i < appCookies.length; i++) {
        if (typeof cookies.get(appCookies[i]) !== "undefined") {
            const currentCookie = cookies.get(appCookies[i]);
            if (typeof currentCookie === "string") {
                sessionManager.delete(currentCookie).catch(function (error) {
                    utils.writeToLog(error);
                    errorFound = true;
                });

                if (errorFound) {
                    const data = {
                        statusCode : 500,
                        mimeType : mimeTypes.html,
                        body: "An error occurred while logout. Please retry."
                    };

                    this.respWrapper.send(data);
                    return false;
                }
            }
        }
    }

    this.reply.header("location", "/ui/shared/home");
    const data = {
        statusCode : 302,
        mimeType : mimeTypes.html,
        body: "Redirecting"
    };

    this.respWrapper.send(data);
    return true;*/
};

/**
 * This methods process the connection form submitted by clicking a button from the WordPress site. It returns a Promise which
 * resolves to an object containing details necessary to authenticate the user on the WordPress side:
 * * **userId** the user id on WordPress
 * * **cookie** The WordPress cookie that will be used to authenticate the user
 * * **nonce** the WordPress nonce that will be used to authenticate the user
 * * **userType** 0 for member and 1 for admin
 * * **service** indicates the service to which a member intends to connect to (ahrefs, quetext are supported).
 * It throws an error in the following cases:
 * * the request is not a POST one, the exception's message is **Invalid request method**
 * * the request content type header is not application/x-www-form-urlencoded, the exception's message is **Invalid content type**
 * * the request content received is not valid, the exception's message is **Invalid data sent**
 * * the data received don't match the expected pattern (a base 64 string containing two # as separators), the exception's message is **corrupted data sent**
 * * the signature check failed, the exception's message is **Signature check failed**
 * @method processConnectionForm
 * @return {Promise<any>}
 */
SharedController.prototype.processConnectionForm = function() {
    const thisCont = this;
    return new Promise(async function (resolve, reject) {
        const receivedData = [];

        try {
            const parsedData = thisCont.request.body;

            if (typeof parsedData["token"] !== "string" || ! /.+#.+#.+/.test(parsedData["token"] + "")) {
                const msg = "corrupted token [" + parsedData["token"] + "] sent from IP " + thisCont.request.socket.remoteAddress;
                await utils.writeToLog(msg);
                reject(new Error("corrupted data sent"));
                return false;
            }

            const token = parsedData["token"] + "";
            const tokenParts = token.split("#");

            if (tokenParts.length !== 3) {
                const msg = "corrupted token [" + parsedData["token"] + "] sent from IP " + thisCont.request.socket.remoteAddress;
                await utils.writeToLog(msg);
                reject(new Error("corrupted data sent"));
                return false;
            }

            const sentSignature = base64.decode(tokenParts[0], "base64");
            const time = base64.decode(tokenParts[1], "base64");
            const data = base64.decode(tokenParts[2], "base64");
            const parsedUserData = JSON.parse(data);
            const rawString = thisCont.request.headers["user-agent"] + "\n" + time + data;

            const userId = parsedUserData[0];
            const userCookie = parsedUserData[1];
            const nonce = parsedUserData[2];
            const userType = parsedUserData[3];
            const wordpressSite = parsedUserData[4];
            const servicesConnectionInfos = [];

            let errorFound = false;
            const result = await mongoDb.connect();
            const siteModel = await WordpressSiteModel.findById(wordpressSite).exec().catch(async function (error) {
                errorFound = true;
                await utils.writeToLog(error);
            });

            await mongoDb.close();
            if (errorFound) {
                reject(new Error("We could not connect to the Wordpress site provided."));
                return false;
            }

            let crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const serverSignature = crypHmac.update(Buffer.from(rawString, 'utf-8')).digest("hex");

            let msg = "";

            if (sentSignature !== serverSignature) {
                msg = "received signature: " + sentSignature + " is different from " + serverSignature;
            }else if (! Array.isArray(parsedUserData)) {
                msg = "invalid user data: " + JSON.stringify(parsedUserData);
            }else if (parsedUserData.length !== 5) {
                msg = "invalid user data (array size should be 5): " + JSON.stringify(parsedUserData);
            }

            if (msg.length > 0) {
                await utils.writeToLog(msg + " sent from IP " + thisCont.request.socket.remoteAddress);
                reject(new Error(msg));
                return false;
            }

            let selectedService;

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedSeocromom = crypHmac.update(Buffer.from(allServicesDetails.seocromom.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedSeocromom,
                name: allServicesDetails.seocromom.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedCrunchbase = crypHmac.update(Buffer.from(allServicesDetails.crunchbase.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedCrunchbase,
                name: allServicesDetails.crunchbase.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedSpyfu = crypHmac.update(Buffer.from(allServicesDetails.spyfu.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedSpyfu,
                name: allServicesDetails.spyfu.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedOneHourIndexing = crypHmac.update(Buffer.from(allServicesDetails.onehourindexing.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedOneHourIndexing,
                name: allServicesDetails.onehourindexing.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedYourtext = crypHmac.update(Buffer.from(allServicesDetails.yourtext.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedYourtext,
                name: allServicesDetails.yourtext.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedSemrush = crypHmac.update(Buffer.from(allServicesDetails.semrush.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedSemrush,
                name: allServicesDetails.semrush.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedSistrix = crypHmac.update(Buffer.from(allServicesDetails.sistrix.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedSistrix,
                name: allServicesDetails.sistrix.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedMajestic = crypHmac.update(Buffer.from(allServicesDetails.majestic.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedMajestic,
                name: allServicesDetails.majestic.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedBabbar = crypHmac.update(Buffer.from(allServicesDetails.babbar.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedBabbar,
                name: allServicesDetails.babbar.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedSpinrewriter = crypHmac.update(Buffer.from(allServicesDetails.spinrewriter.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedSpinrewriter,
                name: allServicesDetails.spinrewriter.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedSmodin = crypHmac.update(Buffer.from(allServicesDetails.smodin.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedSmodin,
                name: allServicesDetails.smodin.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedIconscout = crypHmac.update(Buffer.from(allServicesDetails.iconscout.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedIconscout,
                name: allServicesDetails.iconscout.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedEspinner = crypHmac.update(Buffer.from(allServicesDetails.espinner.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedEspinner,
                name: allServicesDetails.espinner.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedSeolyze = crypHmac.update(Buffer.from(allServicesDetails.seolyze.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedSeolyze,
                name: allServicesDetails.seolyze.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedDinorank = crypHmac.update(Buffer.from(allServicesDetails.dinorank.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedDinorank,
                name: allServicesDetails.dinorank.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedWordhero = crypHmac.update(Buffer.from(allServicesDetails.wordhero.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedWordhero,
                name: allServicesDetails.wordhero.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedLowfruits = crypHmac.update(Buffer.from(allServicesDetails.lowfruits.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedLowfruits,
                name: allServicesDetails.lowfruits.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedAnswerthepublic = crypHmac.update(Buffer.from(allServicesDetails.answerthepublic.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedAnswerthepublic,
                name: allServicesDetails.answerthepublic.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedPbnpremium = crypHmac.update(Buffer.from(allServicesDetails.pbnpremium.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedPbnpremium,
                name: allServicesDetails.pbnpremium.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedCloserscopy = crypHmac.update(Buffer.from(allServicesDetails.closerscopy.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedCloserscopy,
                name: allServicesDetails.closerscopy.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedDomcop = crypHmac.update(Buffer.from(allServicesDetails.domcop.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedDomcop,
                name: allServicesDetails.domcop.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedNeilpatel = crypHmac.update(Buffer.from(allServicesDetails.neilpatel.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedNeilpatel,
                name: allServicesDetails.neilpatel.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedEnvato = crypHmac.update(Buffer.from(allServicesDetails.envato.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedEnvato,
                name: allServicesDetails.envato.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedFreepik = crypHmac.update(Buffer.from(allServicesDetails.freepik.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedFreepik,
                name: allServicesDetails.freepik.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedRytr = crypHmac.update(Buffer.from(allServicesDetails.rytr.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedRytr,
                name: allServicesDetails.rytr.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedKeysearch = crypHmac.update(Buffer.from(allServicesDetails.keysearch.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedKeysearch,
                name: allServicesDetails.keysearch.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedParaphraser = crypHmac.update(Buffer.from(allServicesDetails.paraphraser.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedParaphraser,
                name: allServicesDetails.paraphraser.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedBigspy = crypHmac.update(Buffer.from(allServicesDetails.bigspy.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedBigspy,
                name: allServicesDetails.bigspy.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedQuetext = crypHmac.update(Buffer.from(allServicesDetails.quetext.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedQuetext,
                name: allServicesDetails.quetext.name
            });


            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedRanktracker = crypHmac.update(Buffer.from(allServicesDetails.ranktracker.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedRanktracker,
                name: allServicesDetails.ranktracker.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedAhrefs = crypHmac.update(Buffer.from(allServicesDetails.ahrefs.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedAhrefs,
                name: allServicesDetails.ahrefs.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedSpamzilla = crypHmac.update(Buffer.from(allServicesDetails.spamzilla.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedSpamzilla,
                name: allServicesDetails.spamzilla.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedSeomonitor = crypHmac.update(Buffer.from(allServicesDetails.seomonitor.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedSeomonitor,
                name: allServicesDetails.seomonitor.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedColinkri = crypHmac.update(Buffer.from(allServicesDetails.colinkri.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedColinkri,
                name: allServicesDetails.colinkri.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedKeywordspeopleuse = crypHmac.update(Buffer.from(allServicesDetails.keywordspeopleuse.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedKeywordspeopleuse,
                name: allServicesDetails.keywordspeopleuse.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedSerpstat = crypHmac.update(Buffer.from(allServicesDetails.serpstat.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedSerpstat,
                name: allServicesDetails.serpstat.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedHaloscan = crypHmac.update(Buffer.from(allServicesDetails.haloscan.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedHaloscan,
                name: allServicesDetails.haloscan.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedCopyfy = crypHmac.update(Buffer.from(allServicesDetails.copyfy.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedCopyfy,
                name: allServicesDetails.copyfy.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedLanguagetool = crypHmac.update(Buffer.from(allServicesDetails.languagetool.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedLanguagetool,
                name: allServicesDetails.languagetool.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedXovi = crypHmac.update(Buffer.from(allServicesDetails.xovi.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedXovi,
                name: allServicesDetails.xovi.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedSeoptimer = crypHmac.update(Buffer.from(allServicesDetails.seoptimer.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedSeoptimer,
                name: allServicesDetails.seoptimer.name
            });

            crypHmac = crypto.createHmac('sha1', siteModel.appSecretKey);
            const hashedPlaceit = crypHmac.update(Buffer.from(allServicesDetails.placeit.name, 'utf-8')).digest("hex");
            servicesConnectionInfos.push({
                hash: hashedPlaceit,
                name: allServicesDetails.placeit.name
            });


            const sentServiceHash = base64.decode(parsedData["service"], "base64");

            if (!(hashedSeocromom === sentServiceHash ||
                hashedCrunchbase === sentServiceHash ||
                hashedSpyfu === sentServiceHash || hashedOneHourIndexing === sentServiceHash ||
                hashedYourtext === sentServiceHash || hashedSemrush === sentServiceHash ||
                hashedSistrix === sentServiceHash || hashedMajestic === sentServiceHash ||
                hashedBabbar === sentServiceHash || hashedSpinrewriter === sentServiceHash ||
                hashedSmodin === sentServiceHash || hashedIconscout === sentServiceHash ||
                hashedEspinner === sentServiceHash || hashedSeolyze === sentServiceHash ||
                hashedDinorank === sentServiceHash || hashedWordhero === sentServiceHash ||
                hashedLowfruits === sentServiceHash || hashedAnswerthepublic === sentServiceHash ||
                hashedPbnpremium === sentServiceHash || hashedCloserscopy  === sentServiceHash ||
                hashedDomcop  === sentServiceHash || hashedNeilpatel  === sentServiceHash ||
                hashedEnvato  === sentServiceHash || hashedFreepik  === sentServiceHash ||
                hashedRytr  === sentServiceHash || hashedKeysearch  === sentServiceHash ||
                hashedParaphraser  === sentServiceHash || hashedBigspy  === sentServiceHash ||
                hashedQuetext  === sentServiceHash || hashedRanktracker  === sentServiceHash ||
                hashedAhrefs  === sentServiceHash || hashedSpamzilla  === sentServiceHash ||
                hashedSeomonitor  === sentServiceHash || hashedColinkri  === sentServiceHash ||
                hashedKeywordspeopleuse  === sentServiceHash || hashedSerpstat  === sentServiceHash ||
                hashedHaloscan  === sentServiceHash || hashedCopyfy  === sentServiceHash ||
                hashedLanguagetool  === sentServiceHash || hashedXovi  === sentServiceHash ||
                hashedSeoptimer  === sentServiceHash || hashedPlaceit  === sentServiceHash)) {
                await utils.writeToLog("Invalid service " + sentServiceHash + " sent from IP " + thisCont.request.socket.remoteAddress);
                reject(new Error("Unknown service"));
                return;
            }

            for (let i = 0; i < servicesConnectionInfos.length; i++) {
                if (servicesConnectionInfos[i].hash === sentServiceHash) {
                    selectedService = servicesConnectionInfos[i].name;
                    break;
                }
            }

            if (typeof selectedService !== "string") {
                await utils.writeToLog("Invalid service " + sentServiceHash + " sent from IP " + thisCont.request.socket.remoteAddress);
                reject(new Error("Unknown service"));
                return;
            }

            resolve({
                userId: Number.parseInt(userId),
                cookie: userCookie + ";",
                nonce: nonce,
                userType: userType,
                service: selectedService,
                wordPressSite: wordpressSite,
                ipAddress: thisCont.request.socket.remoteAddress
            });
        }catch (error) {
            reject(error);
        }
    });
};

/**
 * This method executes a GET request on the WordPress site. Ite returns a Promise which resolves to an object containing
 * details (statusCode, body) of the reply. It throws an exception in the following cases:
 * * Invalid data were received, the exception's message is **Invalid data received from hostname**
 * * An unpredictable error occurred, the exception's message corresponds to the one of the underlying error.
 * * The request took too much time to complete, the exception's message is **Request failed with timeout**.
 * @method makeRequestToWordpress
 * @param hostname
 * @param path
 * @param header
 * @return {Promise<any>}
 */
SharedController.prototype.makeRequestToWordpress = function(hostname, path, header) {
    const thisCont = this;
    return new Promise(function (resolve, reject) {
        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

        let reqOptions = {
            hostname: hostname,
            port: 443,
            path: path,
            method: 'GET',
            headers : header
        };

        let errorFound = false;
        let req = https.request(reqOptions, (res) => {
            const thisReq = req;

            const receivedData = [];
            res.on('data', (chunk) => {
                receivedData.push(chunk);
            }).on("end", async () => {
                try {
                    let body = "";
                    if (Array.isArray(receivedData) && receivedData.length > 0){
                        body = Buffer.concat(receivedData).toString();
                    } else {
                        reject("Invalid data received from " + hostname + path);
                    }

                    resolve({
                        statusCode: res.statusCode,
                        body: body
                    });
                } catch (error) {
                    reject(error.message);
                }
            });
        }).on('error', (error) => {
            reject(error.message);
        }).on('timeout', () => {
            req.end();
            reject("Request failed with timeout");
        });

        req.end();

    });
};