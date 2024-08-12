"use strict";
const https = require("https");
const fs = require("fs");
const cheerio = require("cheerio");
const crypto = require("crypto");
const FormData = require('form-data');
const puppeteer = require('puppeteer-extra');
const RecaptchaPlugin = require('@nsourov/puppeteer-extra-plugin-recaptcha');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const utils = require("../../api/Utils");
const cookiesManagerCreator = require('../../api/CookiesManager');
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const mongoDb = require("../../api/db/Db").create();
const servicesDetails = require("../../api/ServicesDetails");
const twoCaptcaClient = require('../../api/TwoCaptchaClient').create();
const webClient = require("../../api/WebClient").create(true);
const LOCK_MODE_FILE_PATH = __dirname + '/locked.lock';
const helpers = {};
const DEFAULT_TIMEOUT = 300000;


function LoginAgent() {
    this.cookiesManager = cookiesManagerCreator.create({});
    this.host = "www.colinkri.com";
}

LoginAgent.prototype.getLoginKey = function () {
    const thisAgent = this;
    return new Promise(async function (resolve, reject) {
        try {
            const path = '/amember/login';
            const userAgent = utils.randomUserAgent(0); // Force user agent to always be chrome 85 on windows 7 64bit
            const headers = {
                'user-agent': userAgent,
                'referer': 'https://www.colinkri.com',
            };

            await webClient.sendRequest('get', thisAgent.host, path, headers).then(function (result) {
                try {
                    if (result.statusCode === 200) {
                        const htmlDoc = Buffer.concat(result.body).toString();
                        const $ = cheerio.load(htmlDoc);
                        const loginAttemptElt = $('input[name="login_attempt_id"]').eq(0);
                        if (! loginAttemptElt)
                            reject(new Error('Failed to extract login attempt ID'));

                        const finalResult = {
                            userAgent : userAgent,
                            loginKey : loginAttemptElt.val(),
                            cookies : thisAgent.cookiesManager.extract(result.headers['set-cookie']),
                        };

                        resolve(finalResult);
                    } else {
                        reject(new Error('Failed to get login key with status code ' + result.statusCode));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

LoginAgent.prototype.connect = function (email, password) {
    const thisAgent = this;
    return new Promise(async function (resolve, reject) {
        try {
            let sessionInfos = undefined;

            if (thisAgent.isInLockMode()) {
                reject('A connection to colinkri is already underway. Please retry later');
                return;
            }

            thisAgent.enterLockMode();

            let errorFound = false;
            let errorMsg = '';

            let preloginDetails = {};

            //we get colinkri login key
            await thisAgent.getLoginKey().then(function (serverResponse) {
                preloginDetails = serverResponse;
            }).catch(async function (error) {
                await utils.writeToLog(error);
                errorFound = false;
                errorMsg = 'An error occurred while getting login key. Retry if it persists contact admin';
            });

            if (errorFound) {
                thisAgent.leaveLockMode();
                reject(errorMsg);
                return;
            }

            twoCaptcaClient.setApiKey(thisAgent.twoCaptchaApiKey);

            let recaptchaToken = null;
            await twoCaptcaClient.solveCaptchaV2('6LcewbwUAAAAAPoM6VrEtPisdEctvKF1FVRHd9Iv',
                'https://www.colinkri.com/amember/login')
                .then(function (serverResponse) {
                    recaptchaToken = serverResponse;})
                .catch(function (error) {
                    utils.writeToLog(error);
                    errorFound = false;
                    errorMsg = 'An error occurred while solving challenge. Retry if it persists contact admin';
                });

            if (errorFound) {
                thisAgent.leaveLockMode();
                reject(errorMsg);
                return;
            }

            const formData = new FormData();
            const formBoundary = '------WebKitFormBoundary' + utils.randCode(16, 17);
            formData.setBoundary(formBoundary);
            formData.append('g-recaptcha-response', recaptchaToken);
            formData.append('amember_login', email);
            formData.append('amember_pass', password);
            formData.append('login_attempt_id', preloginDetails.loginKey);
            formData.append('_referer', 'https://www.colinkri.com/');

            const postData = formData.getBuffer().toString('utf8');

            const headers = {
                'User-Agent' : preloginDetails.userAgent,
                'Cookie' : preloginDetails.cookies,
                'Origin' : 'https://www.colinkri.com',
                'Referer' : 'https://www.colinkri.com/amember/login',
                'Content-Type' : 'multipart/form-data; boundary=' + formBoundary,
                'Content-Length' : Buffer.byteLength(postData)
            };

            errorFound = false;
            errorMsg = '';

            const loginPath = '/amember/login';

            await webClient.sendRequest('post', thisAgent.host, loginPath, headers, postData)
                .then(async function (serverResponse) {
                    try {
                        const logErrorDetails =  async function () {
                            await utils.writeToLog("colinkri failed login details below:");
                            let msg = 'status code: ' + serverResponse.statusCode + '\n';
                            msg += 'headers : ' + JSON.stringify(serverResponse.headers) + '\n';
                            msg += 'body: ' + serverResponse.body + '\n';
                            await utils.writeToLog(msg);
                        };

                        if (serverResponse.statusCode === 302) {
                            const check = thisAgent.saveSessionCookie_FromHeader(serverResponse.headers['set-cookie']);
                            if (check) {
                                sessionInfos = true;
                            } else {
                                errorFound = true;
                                errorMsg = 'Login failed while saving cookies.';
                            }
                        } else {
                            await logErrorDetails();
                            errorFound = true;
                            errorMsg = 'Login failed with status code ' + serverResponse.statusCode;
                        }
                    } catch (error) {
                        await utils.writeToLog(error);
                        errorFound = true;
                        errorMsg = 'An error occurred whilst reading response. Retry if it persists contact admin.';
                    }
                }).catch(function (error) {
                    errorFound = true;
                    errorMsg = 'An error occurred whilst authenticating. Retry if it persists contact admin.';
                });

            if (errorFound) {
                thisAgent.leaveLockMode();
                reject(errorMsg);
            } else if (typeof sessionInfos !== 'undefined') {
                thisAgent.leaveLockMode();
                resolve(sessionInfos);
            }
        } catch (error) {
            utils.writeToLog(error);
            thisAgent.leaveLockMode();
            reject("An error occurred while connecting to colinkri");
        }
    });
}

LoginAgent.prototype.set2CaptchaApiKey = function (apiKey) {
    this.twoCaptchaApiKey = apiKey;
};

LoginAgent.prototype.saveSessionCookie_FromHeader = async function(cookies) {
    try {
        const result = await mongoDb.connect();
        await AppCookiesListModel.deleteOne({name: servicesDetails.colinkri.name});
        this.cookiesManager.merge(cookies, this.host);
        await AppCookiesListModel.create({
            name: servicesDetails.colinkri.name,
            cookies: this.cookiesManager.getAllAsObject(),
        });

        await mongoDb.close();
        return true;
    } catch (error) {
        utils.writeToLog(error);
        return false;
    }
};

/**
 * Returns true in case it entered __lock mode__ successfully; otherwise it returns false.
 * @returns {boolean}
 */
LoginAgent.prototype.enterLockMode = function () {
    try {
        fs.appendFileSync(LOCK_MODE_FILE_PATH, Date.now() + '');
        return true;
    } catch (error) {
        utils.writeToLog(error);
        return false;
    }
};

/**
 * Returns true in case it quited __lock mode__ successfully; otherwise it returns false.
 * @returns {boolean}
 */
LoginAgent.prototype.leaveLockMode = function () {
    if (fs.existsSync(LOCK_MODE_FILE_PATH)) {
        try {
            fs.unlinkSync(LOCK_MODE_FILE_PATH);
            return true;
        } catch (error) {
            utils.writeToLog(error);
            return false;
        }
    }

    return false;
};

/**
 * Returns true in case the agent in lock mode; false otherwise
 * @returns {boolean}
 */
LoginAgent.prototype.isInLockMode = function () {
    let timestamp = 0;

    if (fs.existsSync(LOCK_MODE_FILE_PATH)) {
        try {
            //Get timestamp in lock file
            timestamp = Number.parseInt(fs.readFileSync(LOCK_MODE_FILE_PATH).toString());

            //
            if (timestamp > 0) {
                const MAX_TIME = 120000; // Two minutes
                const creationDate = new Date(timestamp);
                const elapasedTime = Date.now() - creationDate.getMilliseconds();

                //Check if it's has been in lock mode for at least 2 minutes
                if (elapasedTime >= MAX_TIME) {
                    //We quit lock mode
                    this.leaveLockMode();
                    return false;
                }
            }
        } catch (e) {
            utils.writeToLog(e);
        }

        return true;
    }

    return false;
};


module.exports.create = function () {
    return new LoginAgent();
};