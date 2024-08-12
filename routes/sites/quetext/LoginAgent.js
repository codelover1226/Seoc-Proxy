"use strict";
const https = require("https");
const fs = require("fs");
const cheerio = require("cheerio");
const crypto = require("crypto");
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


module.exports.create = function () {
    return new LoginAgent();
};


function LoginAgent() {
    puppeteer.use(StealthPlugin());
    puppeteer.use(
        RecaptchaPlugin({
            provider: {
                id: '2captcha',
                token: twoCaptcaClient.getApiKey() // REPLACE THIS WITH YOUR OWN 2CAPTCHA API KEY ⚡
            },
            visualFeedback: true // colorize reCAPTCHAs (violet = detected, green = solved)
        })
    );
    this.cookiesManager = cookiesManagerCreator.create({});
    this.host = "www.quetext.com";
}

/**
 * This method extracts the login key from JavaScript code within the https://www.quetext.com/login page. In case of
 * successful extraction, it returns a _Promise_ which is resolved to an object with the following properties:
 * * **userAgent** a string representing a user agent string.
 * * **loginKey** a string representing an extracted login key.
 * * **cookies** a string representing the cookies sent by the server.
 * In case of failure it returns a _Promise_ which is rejected to the error message.
 * @method getLoginKey
 * @returns {Promise<any>}
 */
LoginAgent.prototype.getLoginKey = function () {
    const thisAgent = this;
    return new Promise(async function (resolve, reject) {
        try {
            const path = '/login';
            const userAgent = utils.randomUserAgent(0); // Force user agent to always be chrome 85 on windows 7 64bit
            const headers = {
                'user-agent' : userAgent,
                'referer' : 'https://www.quetext.com',
            };

            await webClient.sendRequest('get', thisAgent.host, path, headers).then(function (result) {
                try {
                    if (result.statusCode === 200) {
                        const htmlDoc = Buffer.concat(result.body).toString();
                        const $ = cheerio.load(htmlDoc);
                        const scripts = $('script');
                        const keyRegExp = /key:\s'[a-z0-9]+'/mi;
                        let key = '';

                        scripts.each(function () {
                            let jsCode = $(this).html() + '';

                            if (keyRegExp.test(jsCode)) {
                                let matches = jsCode.match(keyRegExp);
                                if (matches.length > 0) {
                                    //Prepare strings to be parsed as an object
                                    const jsonString = ('{' + matches[0] + '}').replace(/key:/, '"key" :').replace(/'/g, '"');
                                    const obj = JSON.parse(jsonString);
                                    key = obj.key;
                                }
                            }
                        });

                        if (key.length > 0) {
                            const finalResult = {
                                userAgent : userAgent,
                                loginKey : key,
                                cookies : thisAgent.cookiesManager.extract(result.headers['set-cookie']),
                            };

                            resolve(finalResult);
                        } else {
                            reject(new Error('Failed to get login key.'));
                        }
                    } else {
                        reject(new Error('Failed to get login key with status code ' + result.statusCode));
                    }
                } catch (error) {
                    reject(error);
                }
            }).catch(function (error) {
                reject(error);
            });
        } catch (error) {
            reject(error);
        }
    });
};


LoginAgent.prototype.connect = function () {
    const thisAgent = this;
    return new Promise(async function (resolve, reject) {
        try {
            let sessionInfos = undefined;

            if (thisAgent.isInLockMode()) {
                reject('A connection to quetext is already underway. Please retry later');
                return;
            }

            thisAgent.enterLockMode();

            let errorFound = false;
            let errorMsg = '';

            let preloginDetails = {};

            //we get quetext login key
            await thisAgent.getLoginKey().then(function (serverResponse) {
                preloginDetails = serverResponse;
            }).catch(function (error) {
                utils.writeToLog(error);
                errorFound = false;
                errorMsg = 'An error occurred while getting login key. Retry if it persists contact admin';
            });

            if (errorFound) {
                thisAgent.leaveLockMode();
                reject(errorMsg);
                return;
            }

            const MAX_ATTEMPTS = 4;
            const FIVE_SECONDS = 5000;
            let nbOfLoginAttempts = 1;

            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                nbOfLoginAttempts = attempt;
                let recaptchaToken = '';
                errorFound = false;
                errorMsg = '';

                //After the first attempt, we wait for 5 seconds.
                if (attempt > 1) {
                    await utils.sleep(FIVE_SECONDS);
                }

                //we get a recaptcha response for quetext login page
                await twoCaptcaClient.solveCaptchaV3("6LcB4MsZAAAAAKbHYoExoGwF8t-TMx9kae_MT9x1", 'https://www.quetext.com/login', 'login', 0.3)
                    .then(function (serverResponse) {
                        recaptchaToken = serverResponse;
                    }).catch(function (error) {
                        utils.writeToLog(error);
                        errorFound = false;
                        errorMsg = 'An error occurred while solving challenge. Retry if it persists contact admin';
                    });

                if (errorFound) {
                    thisAgent.leaveLockMode();
                    reject(errorMsg);
                    return;
                }


                //we try to submit login data to authentication the endpoint
                //const formData = 'login_email=' + thisAgent.username + '&login_password=' + thisAgent.password;
                const postData = 'login_email=' + thisAgent.username + '&login_password=' + thisAgent.password + '&' +
                    'key=' + preloginDetails.loginKey + '&token=' + recaptchaToken + '&deviceId=d520c7a8-421b-4563-b955-f5abc56b97ec';

                const headers = {
                    'User-Agent' : preloginDetails.userAgent,
                    'Cookie' : preloginDetails.cookies,
                    'Origin' : 'https://www.quetext.com',
                    'Referer' : 'https://www.quetext.com/login',
                    'Content-Type' : 'application/x-www-form-urlencoded',
                    'Content-Length' : Buffer.byteLength(postData),
                    'X-Requested-With' : 'XMLHttpRequest',
                };

                errorFound = false;
                errorMsg = '';
                let sessionInfos = undefined;

                const loginPath = '/api/login';
                await webClient.sendRequest('post', thisAgent.host, loginPath, headers, postData).then(async function (serverResponse) {
                    try {
                        let body = Buffer.concat(serverResponse.body).toString();
                        const logErrorDetails =  async function () {
                            await utils.writeToLog("quetext failed login details below:");
                            await utils.writeToLog('status code ' + serverResponse.statusCode);
                            await utils.writeToLog('headers ' + JSON.stringify(serverResponse.headers));
                            await utils.writeToLog('body' + body);
                        };

                        if (/application\/json/.test(serverResponse.headers['content-type'] + '')) {
                            const jsonBody = JSON.parse(body);
                            if (serverResponse.statusCode === 200) {
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
                        } else {
                            await logErrorDetails();
                            errorFound = true;
                            errorMsg = 'Login failed with status code ' + serverResponse.statusCode + ' and invalid content type.';
                        }
                    } catch (error) {
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
                    return;
                } else if (typeof sessionInfos !== 'undefined') {
                    thisAgent.leaveLockMode();
                    resolve(sessionInfos);
                    return;
                }
            }

            if (nbOfLoginAttempts === MAX_ATTEMPTS) {
                thisAgent.leaveLockMode();
                reject('Login to quetext failed after ' + MAX_ATTEMPTS + ' attempts.');
            }
        } catch (error) {
            utils.writeToLog(error);
            thisAgent.leaveLockMode();
            reject("An error occurred while connecting to quetext");
        }
    });
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


LoginAgent.prototype.saveSessionCookie = async function(cookies) {
    try {
        let userSessionCookies = '';
        let otherCookies = '';
        const cookiesArray = [];


        let sessionCookieFound = false;
        let counter = 1;
        for (let index in cookies) {
            let aCookie = cookies[index].name + "=" + cookies[index].value + "; ";
            aCookie += "domain=" + cookies[index].domain + "; ";
            aCookie += "path=" + cookies[index].path + ";";
            cookiesArray.push(aCookie);

            counter++;
        }

        const result = await mongoDb.connect();
        await AppCookiesListModel.deleteOne({name: servicesDetails.quetext.name});
        this.cookiesManager.merge(cookiesArray, this.host);
        await AppCookiesListModel.create({
            name: servicesDetails.quetext.name,
            cookies: this.cookiesManager.getAllAsObject(),
        });

        await mongoDb.close();
        return true;
    } catch (error) {
        utils.writeToLog(error);
        return false;
    }
};


LoginAgent.prototype.saveSessionCookie_FromHeader = async function(cookies) {
    try {
        const result = await mongoDb.connect();
        await AppCookiesListModel.deleteOne({name: servicesDetails.quetext.name});
        this.cookiesManager.merge(cookies, this.host);
        await AppCookiesListModel.create({
            name: servicesDetails.quetext.name,
            cookies: this.cookiesManager.getAllAsObject(),
        });

        await mongoDb.close();
        return true;
    } catch (error) {
        utils.writeToLog(error);
        return false;
    }
};