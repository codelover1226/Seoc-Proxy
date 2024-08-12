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
const LOCK_MODE_FILE_PATH = __dirname + '/locked.lock';
const helpers = {};
const DEFAULT_TIMEOUT = 300000;


module.exports.create = function () {
    return new LoginAgent();
};


/**
 * This class is responsible of logging into https://yourtext.guru/ using a username and password.
 * @class LoginAgent
 * @namespace app.sites.yourtext.login
 * @constructor
 * @since 6.0.1
 */
function LoginAgent() {
    this.cookiesManager = cookiesManagerCreator.create({});
    this.host = "yourtext.guru";
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
            await page.goto('https://yourtext.guru/login', {waitUntil: 'load', timeout : defaultTimeout}).catch(async function (error) {
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

            await page.click('#hs-eu-confirmation-button').catch(async function (err) {
                await utils.writeToLog(err);
            });

            await page.focus('#email').then(async function () {
                await page.keyboard.type(thisAgent.username, {delay: randDelay});
            });

            await page.focus('#password').then(async function () {
                await page.keyboard.type(thisAgent.password, {delay: randDelay});
            });

            await page.click('#remember');

            lastErrorFound = false;
            await Promise.all([
                page.waitForNavigation({waitUntil: 'load', timeout : defaultTimeout}),
                page.keyboard.press('Enter'),

            ]).then(async function (result) {
                if (/login/.test(page.url())) {
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
            }).catch(async function (error) {
                thisAgent.leaveLockMode();
                lastErrorFound = true;
                utils.writeToLog(error);
            });

            if (lastErrorFound) {
                thisAgent.leaveLockMode();
                reject("An error occurred whilst trying to connect. Please retry");
                return false;
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
        await AppCookiesListModel.deleteOne({name: servicesDetails.yourtext.name});
        this.cookiesManager.merge(cookiesArray, this.host);
        await AppCookiesListModel.create({
            name: servicesDetails.yourtext.name,
            cookies: this.cookiesManager.getAllAsObject(),
        });

        await mongoDb.close();
        return true;
    } catch (error) {
        utils.writeToLog(error);
        return false;
    }
};