"use strict";

const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const utils = require("./Utils");
const helpers = {};


const fileFullPath = __dirname + path.sep + "global-param.json";


module.exports = new GlobalParamManager();

/**
 * This class is in charge of reading and writing global parameters to the global-param.json file (located in the same folder as this class's file).
 * ###### Example:
 *      const paramsMan = require("./params/GlobalParamManager"); // returns a single instance
 * @class GlobalParamManager
 * @namespace app.params
 * @since 1.0.0
 * @constructor
 */
function GlobalParamManager() {}



GlobalParamManager.prototype.save = async (params) => {
    helpers.validateParams(params);

    let mainError = null;

    await utils.writeFile(fileFullPath, JSON.stringify(params)).catch(function (error) {
        mainError = error;
    });


    if (mainError !== null)
        throw mainError;
};


GlobalParamManager.prototype.get = async () => {

    let mainError = null;

    let params = await utils.readFile(fileFullPath).catch(function (error) {
        mainError = error;
    });

    if (mainError !== null) {
        await utils.writeToLog(mainError);
    }

    if (typeof params === 'string') {
        params = JSON.parse(params);
    } else {
        params = false;
    }

    return params;
};





helpers.validateParams =  function (params) {
    if (typeof params !== "object") {
        throw new Error("Invalid parameters list");
    }

    if (typeof params.appSecretKey !== "string" || params.appSecretKey.length < 30) {
        throw new Error("Invalid app secret key");
    }


    this.stringIsOk(params.wordpressUrl, "Invalid WordPress URL");
    this.stringIsOk(params.wordpressRestApiPath, "Invalid WordPress Rest API path");
    this.stringIsOk(params.membershipProApiPath, "Invalid MemberShip API path");
    this.stringIsOk(params.membershipProApiKey, "Invalid MemberShip API key");


    this.stringIsOk(params.crunchbaseDomain, "Invalid crunchbase domain");
    this.stringIsOk(params.crunchbaseUsername, "Invalid crunchbase username");
    this.stringIsOk(params.crunchbasePassword, "Invalid crunchbase password");

    this.stringIsOk(params.spyfuDomain, "Invalid spyfu domain");
    this.stringIsOk(params.spyfuUsername, "Invalid spyfu username");
    this.stringIsOk(params.spyfuPassword, "Invalid spyfu password");

    this.stringIsOk(params.onehourindexingDomain, "Invalid onehourindexing domain");
    this.stringIsOk(params.onehourindexingUsername, "Invalid onehourindexing username");
    this.stringIsOk(params.onehourindexingPassword, "Invalid onehourindexing password");

    this.stringIsOk(params.yourtextDomain, "Invalid yourtext domain");
    this.stringIsOk(params.yourtextUsername, "Invalid yourtext username");
    this.stringIsOk(params.yourtextPassword, "Invalid yourtext password");

    return true;
};


helpers.stringIsOk =  function (strParam, errorMsg = "Invalid parameter") {
    if (typeof strParam !== "string" || strParam.length === 0) {
        throw new Error(errorMsg);
    }

    return true;
};