"use strict";

const https = require("https");
const fs = require("fs");
const timers = require("timers");
const webClient = require("./WebClient").create(true);
const utils = require("./Utils");

const helpers = {};



module.exports.create = function () {
  return new TwoCaptchaClient();
};

function TwoCaptchaClient() {
    this.hostname = '2captcha.com';
}

/**
 * Sets the api key used to connect to https://2captcha.com
 * @param apiKey {string} the API key
 */
TwoCaptchaClient.prototype.setApiKey = function(apiKey) {
    this.apiKey = apiKey;
};

/**
 * Returns the api key used to connect to https://2captcha.com
 * @returns {string}
 */
TwoCaptchaClient.prototype.getApiKey = function() {
    return this.apiKey;
};

/**
 * Sets the email key used to connect to https://2captcha.com
 * @param email {string} the email address
 */
TwoCaptchaClient.prototype.setEmail = function(email) {
    this.email = email;
};

/**
 * Returns the email key used to connect to https://2captcha.com
 * @returns {string}
 */
TwoCaptchaClient.prototype.getEmail = function() {
    return this.email;
};

/**
 * Gets current balance by visiting the https://2captcha.com/res.php endpoint. In case everything went on fine, it returns a
 * _Promise_ which resolves to a float representing the current balance in USD; otherwise returns a _Promise_ which rejects
 * to the error message.
 * @method getBalance
 * @returns {Promise<any>}
 */
TwoCaptchaClient.prototype.getBalance = function () {
    const thisClient = this;
    return new Promise(async function (resolve, reject) {
        const path = '/res.php?key=' + thisClient.apiKey + '&action=getbalance&json=1';
        await webClient.sendRequest('get', thisClient.hostname, path).then(function (result) {
            try {
                const body = JSON.parse(Buffer.concat(result.body).toString());
                if (body.status === 1 && typeof body.request !== 'number') {
                    resolve(Number.parseFloat(Number.parseFloat(body.request + '').toPrecision(4)));
                } else {
                    reject(new Error('Failed to get balance.'))
                }
            } catch (error) {
                utils.writeToLog(error);
                reject(new Error('An error occurred while getting balance.'));
            }
        }).catch(function (error) {
            utils.writeToLog(error);
            reject(new Error('An error occurred while getting balance.'));
        });
    });
};


/**
 * Solves an invisible recaptcha version 3 by visiting successively the https://2captcha.com/in.php and https://2captcha.com/res.php endpoints.
 * In case the challenge was solved it returns a _Promise_ which resolves to a string representing the response token; otherwise it returns
 * a _Promise_ which rejects to an error message.
 * @method solveCaptchaV3
 * @param {string} siteKey a string representing a token used to identify the site by Google reCaptcha servers.
 * @param {string} pageUrl a string representing a page's URL for which the recaptcha challenge is to be solved.
 * @param {string} action a string representing an action for which the recaptcha challenge is to be solved.
 * @param {Number} minScore a decimal number in the range [0.1 - 0.9] representing the lowest score accepted by a website to consider a recaptcha challenge as solved
 * @returns {Promise<any>}
 */
TwoCaptchaClient.prototype.solveCaptchaV3 = function (siteKey, pageUrl, action, minScore) {
    const thisClient = this;
    let _minScore = 0.3;

    if (typeof minScore === 'number' && minScore >= 0.1 && minScore <= 0.9) {
        _minScore = minScore;
    }
    return new Promise(async function (resolve, reject) {
        const inPath = '/in.php?key=' + thisClient.apiKey + '&method=userrecaptcha&googlekey=' +
            siteKey + '&pageurl=' + pageUrl + '&version=v3&action=' + action + '&min_score=' + _minScore + '&json=1';

        let errorFound = false;
        let errorMsg = '';
        let captchaId = -1;

        console.log('TwoCaptchaClient > solving challenge v3 > step 1');
        await webClient.sendRequest('get', thisClient.hostname, inPath).then(function (result) {
            try {
                const body = JSON.parse(Buffer.concat(result.body).toString());
                if (body.status === 1 && typeof body.request === 'string') {
                    captchaId = body.request;
                } else {
                    errorFound = true;
                    errorMsg = 'Solving failed at step 1.';
                }
            } catch (error) {
                utils.writeToLog(error);
                errorFound = true;
                errorMsg = 'An error occurred while solving a challenge.';
            }
        }).catch(function (error) {
            utils.writeToLog(error);
            errorFound = true;
            errorMsg = 'An error occurred while solving a challenge.';
        });

        if (errorFound) {
            reject(new Error(errorMsg));
            return;
        }

        const resPath = '/res.php?key=' + thisClient.apiKey + '&action=get&id=' + captchaId + '&json=1';
        const FIFTEEN_SECONDS = 15000;
        const FIVE_SECONDS = 5000;
        const MAX_ATTEMPTS = 3;
        let captchaToken = '';

        //Wait 15 seconds before getting the recaptcha response
        await utils.sleep(FIFTEEN_SECONDS);

        errorFound = false;
        errorMsg = '';
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            console.log('TwoCaptchaClient > solving challenge v3 > step 2 > attempt #' + attempt);
            if (attempt > 1) {
                //Wait 5 seconds after the first attempt
                await utils.sleep(FIVE_SECONDS);
            }

            await webClient.sendRequest('get', thisClient.hostname, resPath).then(function (result) {
                try {
                    const body = JSON.parse(Buffer.concat(result.body).toString());
                    if (body.status === 1 && typeof body.request === 'string') {
                        captchaToken = body.request;
                    } else if (body.status === 0 && body.request !== 'CAPCHA_NOT_READY') {
                        errorFound = true;
                        errorMsg = 'Solving failed at step 2.';
                    }
                } catch (error) {
                    errorFound = true;
                    errorMsg = 'An error occurred while solving a challenge.';
                }
            }).catch(function (error) {
                utils.writeToLog(error);
                errorFound = true;
                errorMsg = 'An error occurred while solving a challenge.';
            });

            //Quit loop since either captcha response was found or an error occurred
            if (errorFound || captchaToken.length > 0) {
                break;
            }
        }

        if (errorFound || captchaToken.length > 0) {
            if (captchaToken.length) {
                resolve(captchaToken);
            } else {
                reject(new Error(errorMsg));
            }
        } else {
            reject(new Error('Solving challenge failed after ' + MAX_ATTEMPTS + ' attempts.'));
        }
    });
};

/**
 * Solves a recaptcha ,version 2, by visiting successively the https://2captcha.com/in.php and https://2captcha.com/res.php endpoints.
 * In case the challenge was solved it returns a _Promise_ which resolves to a string representing the response token; otherwise it returns
 * a _Promise_ which rejects to an error message.
 * @method solveCaptchaV2
 * @param {string} siteKey a string representing a token used to identify the site by Google reCaptcha servers.
 * @param {string} pageUrl a string representing a page's URL for which the recaptcha challenge is to be solved.
 * @param isInvisible true means the recapctha is invisible and false means it visible
 * @returns {Promise<any>}
 */
TwoCaptchaClient.prototype.solveCaptchaV2 = function (siteKey, pageUrl, isInvisible) {
    const thisClient = this;

    return new Promise(async function (resolve, reject) {
        let invisible = 0;
        if (typeof isInvisible === 'boolean' && isInvisible) {
            invisible = 1;
        }
        const inPath = '/in.php?key=' + thisClient.apiKey + '&method=userrecaptcha&googlekey=' +
            siteKey  + '&invisible=' + invisible + '&json=1' + '&pageurl=' + pageUrl;
        //console.log(inPath);

        let errorFound = false;
        let errorMsg = '';
        let captchaId = -1;

        console.log('TwoCaptchaClient > solving challenge v2 > step 1');

        await webClient.sendRequest('get', thisClient.hostname, inPath).then(function (result) {
            try {
                const body = JSON.parse(Buffer.concat(result.body).toString());
                if (body.status === 1 && typeof body.request === 'string') {
                    captchaId = body.request;
                } else {
                    errorFound = true;
                    errorMsg = 'Solving failed at step 1.';
                }
            } catch (error) {
                utils.writeToLog(error);
                errorFound = true;
                errorMsg = 'An error occurred while solving a challenge.';
            }
        }).catch(function (error) {
            utils.writeToLog(error);
            errorFound = true;
            errorMsg = 'An error occurred while solving a challenge.';
        });

        const resPath = '/res.php?key=' + thisClient.apiKey + '&action=get&id=' + captchaId + '&json=1';
        const TWENTY_SECONDS = 20000;
        const SIX_SECONDS = 6000;
        const MAX_ATTEMPTS = 5;
        let captchaToken = '';

        //Wait 15 seconds before getting the recaptcha response
        await utils.sleep(TWENTY_SECONDS);

        errorFound = false;
        errorMsg = '';
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            console.log('TwoCaptchaClient > solving challenge v2 > step 2 > attempt #' + attempt);
            if (attempt > 1) {
                //Wait 5 seconds after the first attempt
                await utils.sleep(SIX_SECONDS);
            }

            await webClient.sendRequest('get', thisClient.hostname, resPath).then(function (result) {
                try {
                    const body = JSON.parse(Buffer.concat(result.body).toString());
                    console.log(body);
                    if (body.status === 1 && typeof body.request === 'string') {
                        captchaToken = body.request;
                    } else if (body.status === 0 && body.request !== 'CAPCHA_NOT_READY') {
                        errorFound = true;
                        errorMsg = 'Solving failed at step 2.';
                    }
                } catch (error) {
                    errorFound = true;
                    errorMsg = 'An error occurred while solving a challenge.';
                }
            }).catch(function (error) {
                utils.writeToLog(error);
                errorFound = true;
                errorMsg = 'An error occurred while solving a challenge.';
            });

            //Quit loop since either captcha response was found or an error occurred
            if (errorFound || captchaToken.length > 0) {
                break;
            }
        }

        if (errorFound || captchaToken.length > 0) {
            if (captchaToken.length) {
                resolve(captchaToken);
            } else {
                reject(new Error(errorMsg));
            }
        } else {
            reject(new Error('Solving challenge failed after ' + MAX_ATTEMPTS + ' attempts.'));
        }
    });
};



/**
 * Solves a hCaptcha challenge by visiting successively the https://2captcha.com/in.php and https://2captcha.com/res.php endpoints.
 * In case the challenge was solved it returns a _Promise_ which resolves to a string representing the response token; otherwise it returns
 * a _Promise_ which rejects to an error message.
 * @method solveHCaptcha
 * @param {string} siteKey a string representing a token used to identify the site by hCaptcha servers.
 * @param {string} pageUrl a string representing a page's URL for which the recaptcha challenge is to be solved.
 * @param isInvisible true means the challenge is invisible and false means it visible
 * @returns {Promise<any>}
 */
TwoCaptchaClient.prototype.solveHCaptcha = function (siteKey, pageUrl, isInvisible) {
    const thisClient = this;

    return new Promise(async function (resolve, reject) {
        let invisible = 0;
        if (typeof isInvisible === 'boolean' && isInvisible) {
            invisible = 1;
        }
        const inPath = '/in.php?key=' + thisClient.apiKey + '&method=hcaptcha&sitekey=' +
            siteKey  + '&invisible=' + invisible + '&json=1' + '&pageurl=' + pageUrl;
        //console.log(inPath);

        let errorFound = false;
        let errorMsg = '';
        let captchaId = -1;

        console.log('TwoCaptchaClient > solving hCaptcha challenge > step 1');
        await webClient.sendRequest('get', thisClient.hostname, inPath).then(function (result) {
            try {
                const body = JSON.parse(Buffer.concat(result.body).toString());
                //console.log(body);
                if (body.status === 1 && typeof body.request === 'string') {
                    captchaId = body.request;
                } else {
                    errorFound = true;
                    errorMsg = 'Solving failed at step 1.';
                }
            } catch (error) {
                utils.writeToLog(error);
                errorFound = true;
                errorMsg = 'An error occurred while solving a challenge.';
            }
        }).catch(function (error) {
            utils.writeToLog(error);
            errorFound = true;
            errorMsg = 'An error occurred while solving a challenge.';
        });

        const resPath = '/res.php?key=' + thisClient.apiKey + '&action=get&id=' + captchaId + '&json=1';
        const TWENTY_SECONDS = 20000;
        const SIX_SECONDS = 6000;
        const MAX_ATTEMPTS = 5;
        let captchaToken = '';

        //Wait 15 seconds before getting the recaptcha response
        await utils.sleep(TWENTY_SECONDS);

        errorFound = false;
        errorMsg = '';
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            console.log('TwoCaptchaClient > solving hCaptcha challenge > step 2 > attempt #' + attempt);
            if (attempt > 1) {
                //Wait 5 seconds after the first attempt
                await utils.sleep(SIX_SECONDS);
            }

            await webClient.sendRequest('get', thisClient.hostname, resPath).then(function (result) {
                try {
                    const body = JSON.parse(Buffer.concat(result.body).toString());
                    console.log(body);
                    if (body.status === 1 && typeof body.request === 'string') {
                        captchaToken = body.request;
                    } else if (body.status === 0 && body.request !== 'CAPCHA_NOT_READY') {
                        errorFound = true;
                        errorMsg = 'Solving failed at step 2.';
                    }
                } catch (error) {
                    errorFound = true;
                    errorMsg = 'An error occurred while solving a challenge.';
                }
            }).catch(function (error) {
                utils.writeToLog(error);
                errorFound = true;
                errorMsg = 'An error occurred while solving a challenge.';
            });

            //Quit loop since either captcha response was found or an error occurred
            if (errorFound || captchaToken.length > 0) {
                break;
            }
        }

        if (errorFound || captchaToken.length > 0) {
            if (captchaToken.length) {
                resolve(captchaToken);
            } else {
                reject(new Error(errorMsg));
            }
        } else {
            reject(new Error('Solving challenge failed after ' + MAX_ATTEMPTS + ' attempts.'));
        }
    });
};

