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
    this.host = "www.babbar.tech";
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
            await page.goto('https://www.babbar.tech/login', {waitUntil: 'load', timeout : defaultTimeout}).catch(async function (error) {
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

            await page.click('#hs-eu-confirmation-button').catch(async function (error) {
                await utils.writeToLog(error);
            });

            await page.focus('input[name="email"]').then(async function () {
                await page.keyboard.type(thisAgent.username, {delay: randDelay});
            });

            await page.focus('#userpassword').then(async function () {
                await page.keyboard.type(thisAgent.password, {delay: randDelay});
            });

            await page.click('#customControlInline');

            await page.keyboard.press('Enter');

            await utils.sleep(5000);

            lastErrorFound = false;

            if (/login/.test(page.url())) {
                await page.screenshot({path: `${__dirname}/shot.jpeg`, fullPage: true});
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
        const appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.babbar.name}).exec();
        if (appCookiesModel) {
            this.cookiesManager.setOldCookies(appCookiesModel.cookies);
            this.cookiesManager.merge(cookiesArray, this.host);
            await AppCookiesListModel.updateOne({_id: appCookiesModel._id},
                {
                    name: servicesDetails.babbar.name,
                    cookies: this.cookiesManager.getAllAsObject(),
                    changeDate: Date.now()
                });
        } else {
            this.cookiesManager.merge(cookiesArray, this.host);
            await AppCookiesListModel.create({
                name: servicesDetails.babbar.name,
                cookies: this.cookiesManager.getAllAsObject(),
            });
        }

        await mongoDb.close();
        return true;
    } catch (error) {
        utils.writeToLog(error);
        return false;
    }
};