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
    this.host = "www.freepik.com";
}

LoginAgent.prototype.connect = function (username, password) {
    const thisAgent = this;

    return new Promise(async function (resolve, reject) {
        const userAgent = utils.randomUserAgent(0);

        if (typeof username !== "string" || username.length === 0) {
            reject("Invalid username");
            return false;
        }

        if (typeof password !== "string" || password.length === 0) {
            reject("Invalid password");
            return false;
        }

        thisAgent.username = username;
        thisAgent.password = password;

        const defaultTimeout = 300000; // 450 seconds
        let browser;

        const windowsLikePathRegExp = /[a-z]:\\/i;
        let inProduction = false;

        if (! windowsLikePathRegExp.test(__dirname)) {
            inProduction = true;
        }

        let options = {};
        if (inProduction) {
            options = {
                headless : true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--media-cache-size=0',
                    '--disk-cache-size=0',
                    '--ignore-certificate-errors',
                    '--ignore-certificate-errors-spki-list',
                ],
                timeout: defaultTimeout
            };
        } else {
            options = {
                headless : false,
                timeout: defaultTimeout,
                args: [
                    '--ignore-certificate-errors',
                    '--ignore-certificate-errors-spki-list',
                ],
            };
        }

        try {
            let lastErrorFound = false;

            browser = await puppeteer.launch(options).catch(function (error) {
                utils.writeToLog(error);
                lastErrorFound = true;
            });

            if (lastErrorFound) {
                thisAgent.leaveLockMode();
                reject("Initialization step failed. Please retry");
                return false;
            }

            thisAgent.browser = browser;

            lastErrorFound = false;
            const page = await browser.newPage().catch(async function (error) {
                utils.writeToLog(error);
                await browser.close(true).catch(function (error) {
                    utils.writeToLog(error);
                });
                lastErrorFound = true;
            });


            if (lastErrorFound) {
                thisAgent.leaveLockMode();
                reject("Page creation step failed. Please retry");
                return false;
            }

            lastErrorFound = false;
            await page.setUserAgent(userAgent);
            await page.goto('https://id.freepikcompany.com/v2/log-in?client_id=freepik&lang=en&_gl=1*1do613q*fp_ga*MzE5ODM1ODUzLjE2NzQyNTY3NDU.*fp_ga_QWX66025LC*MTY3NDI1Njc0NS4xLjEuMTY3NDI1NzA1My42MC4wLjA.*_ga*MzE5ODM1ODUzLjE2NzQyNTY3NDU.*_ga_18B6QPTJPC*MTY3NDI1Njc0NS4xLjEuMTY3NDI1NzA1My42MC4wLjA.&_ga=2.186703656.1411521756.1674256745-319835853.1674256745', {waitUntil: 'load', timeout : defaultTimeout}).catch(async function (error) {
                utils.writeToLog(error);
                await browser.close(true).catch(function (error) {
                    utils.writeToLog(error);
                });
                lastErrorFound = true;
            });

            if (lastErrorFound) {
                thisAgent.leaveLockMode();
                reject("Failed to open the login form. Please retry");
                return false;
            }

            const randWaitTime = utils.randomInt(1509, 3500);
            await page.waitForTimeout(randWaitTime);

            const randDelay = utils.randomInt(158, 200);


            const html = await page.content();
            const $ = cheerio.load(html);
            const envelopElt = await page.$('.icon.icon--envelope');
            if (! envelopElt) {
                reject("Failed to find the login button");
                return false;
            }

            await envelopElt.click();

            await page.waitForTimeout(500);

            await page.focus('input[name="email"]').then(async function () {
                await page.keyboard.type(thisAgent.username, {delay: randDelay});
            });

            await page.focus('input[name="password"]').then(async function () {
                await page.keyboard.type(thisAgent.password, {delay: randDelay});
            });

            await page.click('input[name="keep-signed"]');

            await page.keyboard.press('Enter');

            await page.waitForTimeout(10000);

            lastErrorFound = false;

            if (page.url().includes('https://id.freepikcompany.com/v2/log-in')) {
                await browser.close(true).catch(function (error) {
                    utils.writeToLog(error);
                });
                thisAgent.leaveLockMode();
                reject("Invalid logins.");
                return false;
            } else {
                await page.waitForTimeout(3500);
                const rawCookies = await page.cookies();

                if (await thisAgent.saveSessionCookie(rawCookies)) {
                    await browser.close(true).catch(function (error) {
                        utils.writeToLog(error);
                    });

                    resolve(true);
                } else {
                    thisAgent.leaveLockMode();
                    await browser.close(true).catch(function (error) {
                        utils.writeToLog(error);
                    });
                    reject("Failed to save cookies");
                    return false;
                }
            }
        } catch (error) {
            utils.writeToLog(error);
            thisAgent.leaveLockMode();
            if (typeof browser !== 'undefined') {
                await browser.close(true).catch(function (error) {
                    utils.writeToLog(error);
                });
            }
            reject("An unpredictable error occurred while connecting");
        }
    });
};

LoginAgent.prototype.connect_bypassRecaptcha = function (username, password) {
    const thisAgent = this;
    return new Promise(async function (resolve, reject) {
        let sessionInfos = undefined;
        let errorFound = false;

        if (thisAgent.isInLockMode()) {
            return reject('A connection to semrush is already underway. Please retry later');
        }

        thisAgent.enterLockMode();

        errorFound = false;
        let preLoginCookies = await thisAgent.getPreloginDetails()
            .catch(function (error) {
                utils.writeToLog(error);
                errorFound = true;
            });

        if (errorFound) {
            thisAgent.leaveLockMode();
            return reject("Failed to get pre login cookies");
        }




        const MAX_ATTEMPTS = 5;
        const FIVE_SECONDS = 5000;
        let nbOfLoginAttempts = 1;
        let errorMsg = '';
        let recaptchaToken = '';

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            nbOfLoginAttempts = attempt;
            errorFound = false;
            errorMsg = '';

            //After the first attempt, we wait for 5 seconds.
            if (attempt > 1) {
                await utils.sleep(FIVE_SECONDS);
            }

            //we get a recaptcha response for the freepik login page
            await twoCaptcaClient.solveCaptchaV2("6LeggwQfAAAAAH1xHP3gi4BL5Rs5BwetrlWrRt4a", "https://id.freepikcompany.com/v2/log-in?client_id=freepik&lang=en&_gl=1*1do613q*fp_ga*MzE5ODM1ODUzLjE2NzQyNTY3NDU.*fp_ga_QWX66025LC*MTY3NDI1Njc0NS4xLjEuMTY3NDI1NzA1My42MC4wLjA.*_ga*MzE5ODM1ODUzLjE2NzQyNTY3NDU.*_ga_18B6QPTJPC*MTY3NDI1Njc0NS4xLjEuMTY3NDI1NzA1My42MC4wLjA.&_ga=2.186703656.1411521756.1674256745-319835853.1674256745", true)
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

            if (recaptchaToken.length === 0) {
                continue;
            }



            let postData = {
                email: username,
                password: password,
                "lang": "en-US",
                "recaptchaToken": recaptchaToken
            };


            const headers = {
                'User-Agent' : utils.randomUserAgent(0),
                'content-type': 'application/json;charset=UTF-8',
                'Content-Length': Buffer.byteLength(JSON.stringify(postData)),
                'Cookie': preLoginCookies,
                'origin': 'https://id.freepikcompany.com',
                'referer': 'https://id.freepikcompany.com/',
            };

            errorFound = false;
            errorMsg = '';
            let sessionInfos = undefined;

            const loginPath = '/v2/login?client_id=freepik';
            await webClient.sendRequest('post', 'id-api.freepikcompany.com', loginPath, headers, JSON.stringify(postData)).then(function (serverResponse) {
                try {
                    let body = Buffer.concat(serverResponse.body).toString();

                    if (/application\/json/.test(serverResponse.headers['content-type'] + '')) {
                        const jsonBody = JSON.parse(body);
                        if (serverResponse.statusCode === 200) {
                            if (! jsonBody.success) {
                                errorFound = true;
                                errorMsg = 'freepik server says: ' + jsonBody.message;
                            } else {
                                const check = thisAgent.saveSessionCookie_FromHeader(serverResponse.headers['set-cookie']);
                                if (check) {
                                    sessionInfos = true;
                                } else {
                                    errorFound = true;
                                    errorMsg = 'Login failed while saving cookies.';
                                }
                            }
                        } else if (typeof jsonBody.message === 'string') {
                            errorFound = true;
                            errorMsg = 'freepik server says: ' + jsonBody.message;
                        } else {
                            errorFound = true;
                            errorMsg = 'Login failed with status code ' + serverResponse.statusCode;
                            utils.writeToLog('Login to freepik failed with :');
                            utils.writeToLog('status code ' + serverResponse.statusCode);
                            utils.writeToLog('body ' + JSON.stringify(jsonBody));
                        }
                    } else {
                        errorFound = true;
                        errorMsg = 'Login failed with status code ' + serverResponse.statusCode + '. Retry after 2 or 3 minutes if it persists contact admin.';
                    }
                } catch (error) {
                    utils.writeToLog(error);
                    errorFound = true;
                    errorMsg = 'An error occurred whilst reading response. Retry if it persists contact admin.';
                }
            }).catch(function (error) {
                utils.writeToLog(error);
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

        thisAgent.leaveLockMode();
        reject('Login to freepik failed after ' + MAX_ATTEMPTS + ' attempts. Please wait a few minutes and retry.');
    });
};


/**
 * Gets the pre-login cookies by visiting the https://www.freepik.com/login/?src=header&redirect_to=%2Fnavigator%2F endpoint.
 * @method getPreloginDetails
 * @return {Promise<any>}
 */
LoginAgent.prototype.getPreloginDetails = function () {
    const thisAgent = this;
    let errorFound = false;
    return new Promise(async function (resolve, reject) {
        const serverRes = await webClient.sendRequest('get', 'www.freepik.com', '/').catch(async function (error) {
            errorFound = true;
            await utils.writeToLog(error);
        });

        if (errorFound) {
            return reject('Failed to get pre-login details.');
        }

        const body = Buffer.concat(serverRes.body).toString();

        if (serverRes.statusCode === 200) {
            const $ = cheerio.load(body);
            const hiddenInput = $('input[name="csrfmiddlewaretoken"]');
            resolve(serverRes.headers['set-cookie']);
        } else {
            utils.writeToLog("request to https://www.freepik.com/login/?src=header&redirect_to=%2Fnavigator%2F failed with status code : " + serverRes.statusCode);
            return reject("Request failed with code " + serverRes.statusCode);
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
        await AppCookiesListModel.deleteOne({name: servicesDetails.freepik.name});
        this.cookiesManager.merge(cookiesArray, this.host);
        await AppCookiesListModel.create({
            name: servicesDetails.freepik.name,
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
        await AppCookiesListModel.deleteOne({name: servicesDetails.freepik.name});
        this.cookiesManager.merge(cookies, this.host);
        await AppCookiesListModel.create({
            name: servicesDetails.freepik.name,
            cookies: this.cookiesManager.getAllAsObject(),
        });

        await mongoDb.close();
        return true;
    } catch (error) {
        utils.writeToLog(error);
        return false;
    }
};