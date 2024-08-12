"use strict";
const https = require("https");
const fs = require("fs");
const cheerio = require("cheerio");
const crypto = require("crypto");
const puppeteer = require('puppeteer');
const utils = require("../../api/Utils");
const cookiesManagerCreator = require('../../api/CookiesManager');
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const mongoDb = require("../../api/db/Db").create();
const servicesDetails = require("../../api/ServicesDetails");
const webClient = require("../../api/WebClient").create(true);
const LOCK_MODE_FILE_PATH = __dirname + '/locked.lock';
const helpers = {};
const DEFAULT_TIMEOUT = 300000;


module.exports.create = function () {
    return new LoginAgent();
};


function LoginAgent() {
    this.cookiesManager = cookiesManagerCreator.create({});
    this.host = "pbnpremium.com";
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
            await page.goto('https://pbnpremium.com/login/', {waitUntil: 'load', timeout : defaultTimeout}).catch(async function (error) {
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

            await page.focus('#emailaddress').then(async function () {
                await page.keyboard.type(thisAgent.username, {delay: randDelay});
            });

            await page.focus('#password').then(async function () {
                await page.keyboard.type(thisAgent.password, {delay: randDelay});
            });

            await page.click('#rememberMe');

            await page.keyboard.press('Enter');

            await page.waitForTimeout(3000);

            if (/account\/login/.test(page.url())) {
                await browser.close(true).catch(function (error) {
                    utils.writeToLog(error);
                });
                thisAgent.leaveLockMode();
                reject("Invalid logins.");
                return false;
            } else {
                lastErrorFound = false;
                const rawCookies = await page.cookies();

                if (await thisAgent.saveSessionCookie(rawCookies)) {
                    await browser.close(true).catch(function (error) {
                        utils.writeToLog(error);
                    });
                    resolve(true);
                    return true;
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

/**
 * Login to pbnpremium.com and save cookies in **sites/pbnpremium/session/cookies.json**. Returns a Promise which resolves to a hash
 * containing the following properties (site, userAgent, cookies, creationDate); otherwise the Promise rejects with a string indicating the error message.
 * @method connect
 * @return {Promise<any>}
 */
LoginAgent.prototype.connect_http = function (username, password) {
    const thisAgent = this;
    return new Promise(async function (resolve, reject) {
        let sessionInfos = undefined;
        let errorFound = false;

        if (typeof username !== "string" || username.length === 0) {
            return reject("Invalid username");
        }

        if (typeof password !== "string" || password.length === 0) {
            return reject("Invalid password");
        }

        const preLoginDetails = await thisAgent.getPreloginCookies()
            .catch(function (error) {
                utils.writeToLog(error);
                errorFound = true;
            });

        if (errorFound) {
            return reject("Failed to get pre login details");
        }

        const loginPath = '/login_check/';
        const postData = '_username=' + username + '&_password=' + password + '&_csrf_token=' + preLoginDetails.csrfToken;
        const headers = {
            'user-agent' : preLoginDetails.userAgent,
            'cookie' : preLoginDetails.cookies,
            'content-type' : 'application/x-www-form-urlencoded ;charset=UTF-8',
            'content-length' : Buffer.byteLength(postData),
            'origin' : 'https://pbnpremium.com',
            'referer' : 'https://pbnpremium.com/login/',
            'X-Requested-With' : 'XMLHttpRequest',
        };

        await webClient.sendRequest('post', 'pbnpremium.com', loginPath, headers, postData).then(function (serverResponse) {
            //console.log(serverResponse);
            const respBody = Buffer.concat(serverResponse.body).toString();
            if (serverResponse.statusCode === 302 && /member/.test(respBody)) {
                if (/\/member/i.test(respBody + "")) {
                    const check = thisAgent.saveSessionCookie_FromHeader(serverResponse.headers['set-cookie']);
                    if (check) {
                        resolve(true);
                    } else {
                        reject('Login failed while saving cookies.');
                    }
                } else if (/flash-error/i.test(respBody + "")) {
                    reject("Bad credentials");
                } else {
                    utils.writeToLog(respBody);
                    reject('Login failed with status code ' + serverResponse.statusCode);
                }
            } else {
                utils.writeToLog(respBody);
                reject('Login failed with status code ' + serverResponse.statusCode);
            }
        }).catch(function (error) {
            utils.writeToLog(error);
            reject('An error occurred while submitting form');
        });
    });
};


/**
 * Gets the pre-login cookies by visiting the https://pbnpremium.com/account/login endpoint. In case of success it returns
 * a _Promise_ which resolves to an object with the following properties:
 * * **userAgent** a string representing the user agent used to connect to the server.
 * * **cookies** a string representing a list of cookies ent by the remote server.
 * @method getPreloginCookies
 * @return {Promise<any>}
 */
LoginAgent.prototype.getPreloginCookies = function () {
    const thisAgent = this;
    return new Promise(async function (resolve, reject) {
        try {
            const path = '/login/';
            const userAgent = utils.randomUserAgent(0);

            const headers = {
                'user-agent' : userAgent
            };
            await webClient.sendRequest('get', 'pbnpremium.com', path, headers).then(function (serverResponse) {
                if (serverResponse.statusCode === 200) {
                    const body = Buffer.concat(serverResponse.body).toString();
                    const $ = cheerio.load(body);
                    const hiddenInput = $('input[name="_csrf_token"]');
                    const finalResult = {
                        userAgent: userAgent,
                        cookies: thisAgent.extractCookies(serverResponse.headers['set-cookie']),
                        csrfToken: hiddenInput.val()
                    };
                    resolve(finalResult);
                } else {
                    reject('Failed getting login form with status code ' + serverResponse.statusCode);
                }
            }).catch(function (error) {
                utils.writeToLog(error);
                reject('An error occured while opening login form');
            });
        } catch (error) {
            utils.writeToLog(error);
            reject('An error occured while opening login form');
        }
    });
};


LoginAgent.prototype.extractCookies = function(cookies) {
    let allCookies = '';
    let counter = 1;

    if (typeof cookies !== 'object'){
        return '';
    }

    const length = cookies.length;
    for (let i = 0; i < length; i++) {
        let currentCookie = cookies[i];
        currentCookie = currentCookie.replace(/;\s.+/i, "");
        if (i === length - 1) {
            allCookies += currentCookie + ";";
        } else {
            allCookies += currentCookie + "; ";
        }
        counter++;
    }

    return allCookies;
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
        await AppCookiesListModel.deleteOne({name: servicesDetails.pbnpremium.name});
        this.cookiesManager.merge(cookiesArray, this.host);
        await AppCookiesListModel.create({
            name: servicesDetails.pbnpremium.name,
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
        await AppCookiesListModel.deleteOne({name: servicesDetails.pbnpremium.name});
        this.cookiesManager.merge(cookies, this.host);
        await AppCookiesListModel.create({
            name: servicesDetails.pbnpremium.name,
            cookies: this.cookiesManager.getAllAsObject(),
        });

        await mongoDb.close();
        return true;
    } catch (error) {
        utils.writeToLog(error);
        return false;
    }
};