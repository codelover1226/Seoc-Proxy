"use strict";

const utils = require("./Utils");



module.exports.create = function (oldCookies) {
    return new CookiesManager(oldCookies);
};

module.exports.CookiesManager = CookiesManager;


/**
 * This class is in charge of reading and saving session details (cookies and user agent) in a file.
 * @class CookiesManager
 * @constructor
 * @param {string} oldCookies a file in which session details will be read from and written in.
 * @throws Error
 * @namespace app
 * @since 5.0.0
 */
function CookiesManager(oldCookies) {
    if (typeof oldCookies === "object") {
        this.oldCookies = oldCookies;
    } else {
        this.oldCookies = {};
    }
}



/**
 * In case of success it returns an object containing the value and name of a cookie; otherwise it returns false.
 * ### Note:
 * the returned array contains the following keys: *name* and *value*
 * @method extractNameAndValue
 * @param {string} rawCookie a string representing the details of a given cookie.
 * @return Object|bool
 */
CookiesManager.prototype.extractNameAndValue = function (rawCookie) {
    if (typeof rawCookie !== "string" || rawCookie.length === 0)
        return false;


    let currentCookie = rawCookie + "";
    currentCookie = currentCookie.replace(/\s/g, "");
    const cookieParts = currentCookie.split(";");
    if (cookieParts.length === 0)
        return false;

    //Get name=value
    currentCookie = cookieParts[0];

    let value = "";
    let name = "";

    if (/^[a-z0-9_\-~%$#@!.]+=/i.test(currentCookie)) {
        value = currentCookie.replace(/^[a-z0-9_\-~%$#@!.]+=/i, "") + "";
        const equalAndValue = "=" + value;
        name = currentCookie.replace(equalAndValue, "") + "";
    }


    if (name.length === 0 || value.length === 0)
        return false;

    return {
        'name': name,
        'value' : value
    }
};


/**
 * Returns a string representing the value of a given cookie attribute,in case of success; otherwise it returns false.
 * @method extractAttributeValue
 * @param {string} rawCookie a string representing the details of a given cookie.
 * @param {string} attributeName a string representing the attribute which value must be extracted.
 * Only the following attributes are supported *expires*, *max-age*, *domain*, *path*, and *SameSite*
 * @returns string|boolean
 */
CookiesManager.prototype.extractAttributeValue = function (rawCookie, attributeName) {
    if (typeof rawCookie !== "string" || rawCookie.length === 0)
        return false;

    if (typeof attributeName !== "string" || ! /^Expires$|^Max-Age$|^Domain$|^Path$|^SameSite$/i.test(attributeName))
        return false;

    const regExp = new RegExp(attributeName + "=.+;*", 'i');
    const matches = rawCookie.match(regExp, attributeName);

    if (matches === null)
        return false;

    const exploded = matches[0].split("=");

    return exploded[1].replace(/;.*/, "");

};


/**
 * Returns true in case a cookie contains at least one attribute; otherwise it returns false.
 * @method hasMultipleAttributes
 * @param {string} rawCookie a string representing the details of a given cookie.
 * @returns {boolean}
 */
CookiesManager.prototype.hasMultipleAttributes = function(rawCookie) {
    if (typeof rawCookie !== "string" || rawCookie.length === 0)
        return false;

    const matches = rawCookie.match(/;/g);

    return Array.isArray(matches) && matches.length > 1;
};


/**
 * Returns an object in which each property represents a cookie name that contains another object in which there is its value and attributes. If no cookie was found
 * it returns an empty object (*{}*).
 * #### Note:
 * each entry is an object with the following properties:
 * * *value* a string representing the cookie value. This key is mandatory since a cookie always has a value.
 * * *expires* a string representing the value of the expires attribute. This key is optional.
 * * *max-age* a string representing the value of the Max-Age attribute. This key is optional.
 * * *domain* a string representing the value of the domain attribute. This key is optional.
 * * *path* a string representing the value of the path attribute. This key is optional.
 * * *samesite* a string representing the value of the SameSite attribute. This key is optional.
 * #### Example:
 * ``
 * const rawCookies = ["login_session=deleted; expires=Thu, 01-Jan-1970 00:00:01 GMT; Max-Age=0; path=/;"];
 * manager = new CookiesManager("A_FILE_PATH");
 * extractedCookies = $manager.extract(rawCookies);
 * // The returned object is {"login_session" : {"value" : "deleted", "expires" : "Thu, 01-Jan-1970 00:00:01 GMT", "max-age" : "0", "path" : "/"} }
 * ``
 * @method extract
 * @param {Array} rawCookies an array containing each cookie and its attributes in a string.
 * @returns {Object}
 */
CookiesManager.prototype.extract = function(rawCookies) {
    const thisManager = this;
    if (! Array.isArray(rawCookies) || rawCookies.length === 0)
        return {};

    let counter = 1;

    const size = rawCookies.length;
    const allCookies = {};

    for (let i = 0; i < size; i++) {
        let currentCookie = rawCookies[i] + "";
        if (typeof currentCookie === "string" && currentCookie.length > 0) {
            const infos = thisManager.extractNameAndValue(currentCookie);
            if (typeof infos === "boolean")
                continue;
            const cookieDetails = {};
            cookieDetails["value"] = infos["value"];

            if (thisManager.hasMultipleAttributes(currentCookie)) {
                const attributesList = ['expires','max-age','domain','path','SameSite'];
                for (let index = 0; index < attributesList.length; index++) {
                    const attribName = attributesList[index];
                    const extractedValue = thisManager.extractAttributeValue(currentCookie, attribName);
                    if (typeof extractedValue === "string") {
                        cookieDetails[attribName] = extractedValue;
                    }
                }
            }

            allCookies[infos['name']] = cookieDetails;
        }
    }

    return allCookies;
};



/**
 * Returns true new cookies were successfully merged with existing ones; otherwise it returns false.
 * #### Note:
 * It's important to note that in case a cookie exists in the file its value and attributes are updated; if it does not exists it's added to the file alongside the provided user agent.
 * @param {Array} rawCookies an array containing each cookie and its attributes in a string. E.g ["session=reset; expires=Thu, 01-Jan-1970 00:00:01 GMT; Max-Age=0; path=/;"]
 * @method merge
 * @returns {boolean}
 */
CookiesManager.prototype.merge = function (rawCookies, defaultDomain) {
    if (typeof defaultDomain !== 'string' || defaultDomain.length === 0)
        throw new Error('Default domain is missing');

    const newCookies = this.extract(rawCookies);
    const objtEntries = Object.entries(newCookies);

    if (objtEntries.length === 0)
        return false;

    const attributesList = ['expires','max-age','domain','path','samesite'];
    for (let cookieName in newCookies) {
        if (newCookies[cookieName]["expires"]) {
            if (Date.parse(newCookies[cookieName]["expires"]) < Date.now())
                continue;
        }

        if (this.oldCookies.hasOwnProperty(cookieName)) {
            this.oldCookies[cookieName]["value"] = newCookies[cookieName]["value"];
        } else {
            this.oldCookies[cookieName] = {
                value : newCookies[cookieName]["value"]
            };
        }


        for (let index = 0; index < attributesList.length; index++) {
            const attribName = attributesList[index];
            if (attribName === 'domain') {
                if (newCookies[cookieName]['domain']) {
                    this.oldCookies[cookieName]['domain'] = (newCookies[cookieName]['domain']);
                } else {
                    this.oldCookies[cookieName]['domain'] = defaultDomain;
                }
            } else {
                this.oldCookies[cookieName][attribName] = newCookies[cookieName][attribName];
            }
        }
    }

    return true;
};


/**
 * Returns a string that can be used as the value of the cookie HTTP header. In other words a string in which each cookie is in the format
 * COOKIE_NAME=COOKIE_VALUE;
 * @param targetedDomain
 * @returns {string}
 */
CookiesManager.prototype.getAsString = function (targetedDomain = "") {
    let returnedCookies = "";

    for (let cookieName in this.oldCookies) {
        const expires = this.oldCookies[cookieName]["expires"];
        if (typeof expires === "string") {
            if (Date.parse(expires) < Date.now())
                continue;
        }

        const cookieValue = this.oldCookies[cookieName]["value"];
        if (typeof targetedDomain === "string" && targetedDomain.length > 0) {
            const currentDomain = this.oldCookies[cookieName]["domain"];
            if (typeof currentDomain === "string" && currentDomain.length > 0) {
                if (! (targetedDomain.includes(currentDomain) || currentDomain.includes(targetedDomain))) {
                    continue;
                }

                returnedCookies += cookieName + "=" + cookieValue + ";";
            } else {
                returnedCookies += cookieName + "=" + cookieValue + ";";
            }
        } else {
            returnedCookies += cookieName + "=" + cookieValue + ";";
        }
    }

    return returnedCookies.replace(/;$/, '');
};

/**
 * Returns an array in which each item is a string that can be used as a value of the set-cookie header, with each cookie's domain appended to its name.
 * #### Example:
 * ``
 * const rawCookies = ["login_session=ijfsgty_RTYiooo; Domain=a-domain.com; Max-Age=0; path=/;"];
 * const manager = new CookiesManager();
 * manager.merge(rawCookies);
 * const setCookieValue = manager.getForClientSide();
 * // The returned array is ["login_session@a-domain.com=ijfsgty_RTYiooo; path=/;"]
 * ``
 * @param defaultDomain
 * @returns {Array}
 */
CookiesManager.prototype.getForClientSide = function (defaultDomain = "") {
    let returnCookies = [];

    for (let cookieName in this.oldCookies) {
        const expires = this.oldCookies[cookieName]["expires"];
        if (typeof expires === "string") {
            if (Date.parse(expires) < Date.now())
                continue;
        }


        const cookieValue = this.oldCookies[cookieName]["value"];
        const path = this.oldCookies[cookieName]["path"];
        let aCookie = '';
        if (typeof this.oldCookies[cookieName].domain === 'string') {
            aCookie = `${cookieName}@${this.oldCookies[cookieName].domain}=${cookieValue};`;
        } else if (typeof defaultDomain === 'string' && defaultDomain.length > 0) {
            aCookie = `${cookieName}@${defaultDomain}=${cookieValue};`;
        } else {
            aCookie = returnCookies += `${cookieName}=${cookieValue};`;
        }

        if (typeof path === 'string')
            aCookie += `path=${path};`;
        if (typeof expires === 'string')
            aCookie += `expires=${expires};`;
        returnCookies.push(aCookie);

    }

    return returnCookies;
};


CookiesManager.prototype.getAllAsObject = function () {
    return this.oldCookies;
};

CookiesManager.prototype.setOldCookies = function (oldCookies) {
    let _oldCookies = {};
    if (typeof oldCookies === "object") {
        _oldCookies = oldCookies;
    }

    const returnCookies = {};

    for (let cookieName in _oldCookies) {
        const expires = _oldCookies[cookieName]["expires"];
        if (typeof expires === "string") {
            if (Date.parse(expires) < Date.now())
                continue;
        }

        returnCookies[cookieName] = _oldCookies[cookieName];
    }



    this.oldCookies = returnCookies;
};