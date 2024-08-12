"use strict";

const cheerio = require("cheerio");
const utils = require("./Utils");
const jsObfuscator = require('javascript-obfuscator');
const btoa = require('btoa');
const fs = require("fs");
const fsPromises = require("fs").promises;
const acorn = require("acorn");
const espree = require("espree");
const babelParser = require("@babel/parser");
const babelTraverse = require("@babel/traverse").default;
const babelGenerator = require("@babel/generator").default;
const acornLoose = require("acorn-loose");
const acornTreeWalk = require("acorn-walk");
const escodegen = require("escodegen");
const path = require("path");
const minify = require("babel-minify");




module.exports = new HandlerHelpers();


/**
 * This class contains functions used by proxy Handler classes to perform all the proxy related activities.`
 */
function HandlerHelpers() {}

HandlerHelpers.prototype.MCOP_LOCATION_STR = '__mcopLocation';
HandlerHelpers.prototype.LOCATION_STR = 'location';
HandlerHelpers.prototype.MCOP_COMPOSITE_GET_VAR_NAME = 'mcop-comenc';


/**
 * Returns true if the cf_clearance cookie exists in a string; otherwise it returns false.
 * @param {string} rawCookies a string containing cookies (name and value each separated by a semi colon).
 * @function cloudFlareClearanceCookieExists
 */
HandlerHelpers.prototype.cloudFlareClearanceCookieExists = function (rawCookies) {
    if (typeof rawCookies !== "string")
        return false;
    return /cf_clearance=.+;/.test(rawCookies);
};

/**
 * Returns the new JavaScript code in which location has been replaced with __mcopLocation; otherwise in case nothing was found
 * , the unchanged code is returned. It throws an exception in case an error occurred in the process or **jsCode** is not a string.
 * @param {string} jsCode s string representing JavaScript code.
 * @return string
 * @throws Error
 */
HandlerHelpers.prototype.replaceLocationInJsCode = function (jsCode) {
    const thisHelper = this;
    const MCO_TEMP_TOKEN = 'MCO_TEMP_TOKEN';
    const ALLOWED_CHARS_REGEXP = /[.=\s,;():?\[\]+\-{}&|!>\n\r]/;
    const skippedStrings = Array.from([]);
    const processedPropertyNodeSnippets = Array.from([]);
    const processedMemberNodesDetails = Array.from([]);
    const groupedNodes = {
        literal: Array.from([]),
        memberExpr: Array.from([]),
        identifier: Array.from([]),
        property: Array.from([]),
        objectPattern: Array.from([]),
        allOrdered: Array.from([]),
    };

    if (typeof jsCode !== 'string')
        throw new Error('Invalid JavaScript code');

    if (! /location/mg.test(jsCode))
        return jsCode;

    const looksLikeURL = (str) => {
        const matches = (str + '').match(/\//g);
        const NO_ILLEGAL_CHAR = ! /[\s'"\\]/.test(str + '')
        return ((Array.isArray(matches) && matches.length > 0) && NO_ILLEGAL_CHAR ||
            ((Array.isArray(matches) && (str + '').includes('.')))) && NO_ILLEGAL_CHAR;
    }

    const looksLikeCss = (str) => {
        const regExp = /[a-z0-9-_:\s]+location|location[\s:_]+[a-z0-9-_:\s]+/;
        return regExp.test(str + '');
    }

    const addStrToList = function (str, stringsList) {
        if (! stringsList.toString().includes(str)) {
            stringsList.push(str);
        }
    }

    const containsSkippedStr = function (codeSnippet, stringsList) {
        for (let i = 0; i < stringsList.length; i++) {
            const curStr = stringsList[i];
            if ((codeSnippet + '').includes(curStr)) {
                return true;
            }
        }

        return false;
    }

    const isSubstringOfSnippet = function (targetedSnippet, stringsList) {
        for (let i = 0; i < stringsList.length; i++) {
            const curStr = stringsList[i];
            if (((targetedSnippet + '').includes(curStr) &&
                (targetedSnippet + '').replace(curStr, '').length > 0) ||
                ((curStr + '').includes(targetedSnippet) &&
                    (curStr + '').replace(targetedSnippet, '').length > 0)) {
                return true;
            }
        }

        return false;
    }

    const replaceLocationInSnippet = function (jsCode, newJsCode, node) {
        const replaced = jsCode.substring(node.start, node.end);
        const matches = replaced.matchAll(new RegExp(thisHelper.LOCATION_STR, 'mg'));
        const matchesAsArray = Array.from(matches);

        if (matchesAsArray.length === 0 || containsSkippedStr(replaced, skippedStrings))
            return newJsCode;

        if (matchesAsArray.length === 1) {
            const replacement = replaced.replace(new RegExp(thisHelper.LOCATION_STR, 'mg'), thisHelper.MCOP_LOCATION_STR);
            return newJsCode.replace(replaced, replacement);
        } else {
            let progressiveReplaced = replaced.substring(0, matchesAsArray[1].index) + thisHelper.MCOP_LOCATION_STR;
            const replacement = progressiveReplaced.replace(thisHelper.LOCATION_STR, thisHelper.MCOP_LOCATION_STR);
            return newJsCode.replace(progressiveReplaced, replacement);
        }
    }

    const canLocationBeReplacedInMemberExpression = function (node, jsCode) {
        const snippet = jsCode.substring(node.start, node.end);
        const match = Array.from(snippet.matchAll(new RegExp(thisHelper.LOCATION_STR, 'g')))[0];
        const start = node.start; //the index of the char before l
        const end = match.index + thisHelper.LOCATION_STR.length - 1; // the index of the char after n
        const charBeforeFirstLetter = jsCode.charAt(start - 1);
        const charAfterLastLetter = snippet.charAt(end + 1);
        const test1 =
            start === 0 || ALLOWED_CHARS_REGEXP.test(charBeforeFirstLetter);
        const test2 =
            charAfterLastLetter.length === 0 || ALLOWED_CHARS_REGEXP.test(charAfterLastLetter);

        return (test1 && test2);
    }

    const canLocationBeReplacedInProperty = function (node, jsCode) {
        let snippet = jsCode.substring(node.start, node.end);

        const match = Array.from(snippet.matchAll(new RegExp(thisHelper.LOCATION_STR, 'g')))[0];
        const charBefore = jsCode.charAt(node.start - 1);
        const lastCharIndex = match.index + thisHelper.LOCATION_STR.length;
        const charAfter = snippet.charAt(lastCharIndex);
        const test1 = charBefore.length === 0 || ALLOWED_CHARS_REGEXP.test(charBefore);
        const test2 = charAfter.length === 0 || ALLOWED_CHARS_REGEXP.test(charAfter);

        if (node.type === 'Literal') {
            return snippet
                .replace(/['"]/g, '')
                .replace(thisHelper.LOCATION_STR, '').length === 0;
        }

        return test1 && test2;
    }

    const locationIsPartOfIdentifier = function (memberExprNode, jsCode) {
        const snippet = jsCode.substring(memberExprNode.start, memberExprNode.end);
        const match = Array.from(snippet.matchAll(new RegExp(thisHelper.LOCATION_STR, 'g')))[0];
        const start = match.index;
        const charBeforeL = (start > 0) ? snippet.charAt(start - 1) : '';
        return (charBeforeL.length > 0 && ! ALLOWED_CHARS_REGEXP.test(charBeforeL)) ;
    }

    try {
        let jsCodeTree = thisHelper.parseJsCode(jsCode);
        let newJsCode = jsCode;


        acornTreeWalk.full(jsCodeTree, function (node) {
            if (node.type === "Program")
                return;

            const nodeSnippet = jsCode.substring(node.start, node.end);

            if (node.type === 'Literal' && node.raw && node.raw.includes(thisHelper.LOCATION_STR)) {
                if (looksLikeURL(node.raw) || looksLikeCss(node.raw)) {
                    addStrToList(node.raw, skippedStrings);
                    return;
                }

                groupedNodes.literal.push(node);
            } else if (node.type === 'MemberExpression' &&
                nodeSnippet.includes(thisHelper.LOCATION_STR) &&
                node.object && node.property) {
                const objectPartSnippet = jsCode.substring(node.object.start, node.object.end);
                const propertyPartSnippet = jsCode.substring(node.property.start, node.property.end);

                const type1 = (typeof node.object === 'object' &&
                    ! objectPartSnippet.includes(thisHelper.LOCATION_STR) &&
                    typeof node.property === 'object' &&
                    propertyPartSnippet.includes(thisHelper.LOCATION_STR));

                const type2 = (typeof node.object === 'object' &&
                    objectPartSnippet.includes(thisHelper.LOCATION_STR) &&
                    typeof node.property === 'object' &&
                    ! propertyPartSnippet.includes(thisHelper.LOCATION_STR));

                if (! (type1 || type2)) {
                    return;
                }

                //we check the characters before the l and after the n of "location" to check if it can be
                // replaced by __mcopLocation
                if (! canLocationBeReplacedInMemberExpression(node, jsCode)) {
                    return;
                }

                groupedNodes.memberExpr.push(node);
            } else if (node.type === 'Identifier' && typeof node.name === 'string' &&
                (node.name + '').includes(thisHelper.LOCATION_STR)) {
                const snippet = jsCode.substring(node.start, node.end);
                const remaining = snippet.replace(thisHelper.LOCATION_STR, '');
                if (remaining.length > 0) {
                    addStrToList(snippet, skippedStrings);
                    return;
                }

                //console.log(snippet);
                groupedNodes.identifier.push(node);
            } else if (node.type === 'Property' && nodeSnippet.includes(thisHelper.LOCATION_STR)) {
                groupedNodes.property.push(node);
            } else if (node.type === 'ObjectPattern' &&
                jsCode.substring(node.start, node.end).includes(thisHelper.LOCATION_STR)
                && Array.isArray(node.properties)) {
                for (let i = 0; i < node.properties.length; i++) {
                    const curPropNode = node.properties[i];
                    const propSnippet = jsCode.substring(curPropNode.start, curPropNode.end);
                    if (! propSnippet.includes(thisHelper.LOCATION_STR))
                        continue;
                    groupedNodes.objectPattern.push(curPropNode);
                }
            }
        });

        groupedNodes.allOrdered =
            groupedNodes.literal.concat(groupedNodes.memberExpr,
                groupedNodes.objectPattern, groupedNodes.property, groupedNodes.identifier);

        groupedNodes.allOrdered.forEach(function (node) {
            if (node.type === 'Literal') {
                const originalSnippet = jsCode.substring(node.start, node.end);
                const modifiedSnippet =
                    originalSnippet.replace(new RegExp(thisHelper.LOCATION_STR, 'mg'),
                        thisHelper.MCOP_LOCATION_STR);
                newJsCode = newJsCode.replace(originalSnippet, modifiedSnippet);
            } else if (node.type === 'MemberExpression') {
                const originalSnippet = jsCode.substring(node.start, node.end);

                if (locationIsPartOfIdentifier(node, jsCode)) {
                    processedMemberNodesDetails.push({
                        originalSnippet: originalSnippet,
                        modifiedSnippet: originalSnippet,
                    });
                    return;
                }

                //We copy before modification
                const newJsCodeCopy = newJsCode;
                utils.findAllOccurrences(originalSnippet, newJsCode).forEach(function (curOccurrence) {
                    const start = curOccurrence.index;
                    const end = start + originalSnippet.length - 1;
                    const charBeforeFirstOne = newJsCodeCopy.substring(start - 1, start);
                    const charAfterLastOne = newJsCodeCopy.substring(end + 1, end + 2);
                    const charBeforeIsFine = start === 0 || ALLOWED_CHARS_REGEXP.test(charBeforeFirstOne);
                    const charAfterIsFine = charAfterLastOne.length === 0 || ALLOWED_CHARS_REGEXP.test(charAfterLastOne);

                    if (charBeforeIsFine && charAfterIsFine) {
                        let replaced = originalSnippet;
                        if (charBeforeFirstOne) {
                            replaced = charBeforeFirstOne + replaced;
                        }

                        if (charAfterLastOne) {
                            replaced = replaced + charAfterLastOne;
                        }

                        const modifiedSnippet =
                            originalSnippet.replace(thisHelper.LOCATION_STR, thisHelper.MCOP_LOCATION_STR);
                        const replacement = charBeforeFirstOne + modifiedSnippet + charAfterLastOne;
                        processedMemberNodesDetails.push({
                            originalSnippet: replaced,
                            modifiedSnippet: replacement,
                        });

                        newJsCode = newJsCode.replace(replaced, replacement);
                    }
                });
            } else if (node.type === 'ObjectPattern') {
                newJsCode = replaceLocationInSnippet(jsCode, newJsCode, node);
            } else if (node.type === 'Property') {
                const charBefore = jsCode.substring(node.start - 1, node.start);
                const charAfter = jsCode.substring(node.end, node.end + 1);
                let originalSnippet = charBefore + jsCode.substring(node.start, node.end) + charAfter;

                //We skip any snippet that was already processed and is a substring of the current snippet
                if (isSubstringOfSnippet(originalSnippet, processedPropertyNodeSnippets)) {
                    //console.log(originalSnippet)
                    return;
                }

                const valuePartContainsProcessedMemberExp = function (valueNode) {
                    const valueOriginalSnippet = jsCode.substring(valueNode.start, valueNode.end);
                    let result = false;
                    processedMemberNodesDetails.forEach(function (details) {
                        const memberExprOriginalSnippet = details.originalSnippet + '';
                        if (memberExprOriginalSnippet.includes(valueOriginalSnippet) ||
                            valueOriginalSnippet.includes(memberExprOriginalSnippet)) {
                            result = true;
                        }
                    });

                    return result;
                }

                const replaceLocationInPart = function (node) {
                    if (looksLikeURL(jsCode.substring(node.start, node.end))) {
                        return;
                    }

                    const charBefore = jsCode.charAt(node.start - 1);
                    const charAfter = jsCode.charAt(node.end);
                    const originalSnippet = charBefore + jsCode.substring(node.start, node.end) + charAfter;
                    const modifiedSnippet =
                        originalSnippet.replace(thisHelper.LOCATION_STR, thisHelper.MCOP_LOCATION_STR);
                    const test1 = charBefore === '' || ALLOWED_CHARS_REGEXP.test(charBefore);
                    const test2 = charAfter === '' || ALLOWED_CHARS_REGEXP.test(charAfter);

                    if (test1 && test2) {
                        while (newJsCode.indexOf(originalSnippet) !== -1) {
                            newJsCode = newJsCode.replace(originalSnippet, modifiedSnippet);
                        }
                    }
                }

                if (typeof node.key === 'object' &&
                    thisHelper.generateCodeFromTree(node.key).includes(thisHelper.LOCATION_STR) &&
                    canLocationBeReplacedInProperty(node.key, jsCode)) {
                    const keyPart = jsCode.substring(node.key.start, node.key.end);
                    const remaining = keyPart.replace(thisHelper.LOCATION_STR, '')
                        .replace(/"/g, '').replace(/'/g, '');

                    if (! looksLikeURL(keyPart) && remaining.length === 0) {
                        replaceLocationInPart(node.key);
                    }
                }

                if (typeof node.value === 'object' &&
                    thisHelper.generateCodeFromTree(node.value).includes(thisHelper.LOCATION_STR) &&
                    canLocationBeReplacedInProperty(node.value, jsCode) &&
                    !valuePartContainsProcessedMemberExp(node.value)) {
                    if (node.value.type !== 'FunctionExpression') {
                        replaceLocationInPart(node.value);
                    }
                }

                processedPropertyNodeSnippets.push(originalSnippet);
            } else if (node.type === 'Identifier') {
                const charBefore = jsCode.substring(node.start - 1, node.start);
                const charAfter = jsCode.substring(node.end, node.end + 1);
                const test1 = charBefore.length === 0 || ALLOWED_CHARS_REGEXP.test(charBefore);
                const test2 = charAfter.length === 0 || ALLOWED_CHARS_REGEXP.test(charAfter);
                if (test1 && test2) {
                    const originalSnippet = charBefore + jsCode.substring(node.start, node.end) + charAfter;
                    const modifiedSnippetSnippet =
                        originalSnippet.replace(thisHelper.LOCATION_STR, thisHelper.MCOP_LOCATION_STR);
                    newJsCode = newJsCode.replace(originalSnippet, modifiedSnippetSnippet);
                }
            }
        });

        //console.log(skippedStrings)
        return newJsCode;
    } catch (error) {
        throw error;
    }
};



HandlerHelpers.prototype.toSingleQuoted =  function(str) {
    return (str + "").replace(/\u0022/mg, "\u0027");
};

HandlerHelpers.prototype.toDoubleQuoted =  function(str) {
    return (str + "").replace(/\u0027/mg, '\u0022');
};

HandlerHelpers.prototype.toDoubleQuoted_withEscape =  function(str) {
    return (str + "").replace(/'/mg, '\\"');
};


HandlerHelpers.prototype.replaceLocationIdentifierInJsCode = function(jsCode) {
    const thisHelper = this;
    const asTree = thisHelper.parseJsCode(jsCode);
    let foundOnce = false;

    acornTreeWalk.full(asTree, function (node, state, type) {
        let originalSnippet, newSnippet = '';
        if (node.type === 'Identifier' && node.name === 'location' && ! foundOnce) {
            foundOnce = true;
            originalSnippet = thisHelper.generateCodeFromTree(node) + '';
            if (node.start === 0) {
                const endSubtr = jsCode.substr(node.end);
                jsCode = thisHelper.MCOP_LOCATION_STR + endSubtr;
            } else {
                const startSubtr = jsCode.substring(0, node.start);
                const endSubtr = jsCode.substr(node.end);
                jsCode = startSubtr + thisHelper.MCOP_LOCATION_STR + endSubtr;
            }
        }
    });

    return jsCode;
};

HandlerHelpers.prototype.replacePostMessageAndLocation = function(jsCode) {
    const asTree = this.parseJsCode(jsCode);
    let newJsCode = jsCode;

    newJsCode = this.replacePostMessage(jsCode);
    newJsCode = this.replaceLocationInJsCode(jsCode);

    return newJsCode;
};


/**
 * Replaces location to __mcopLocation in all inline scripts of the given page and returns the new page. In case an error
 * occurred throughout the process it throws an exception.
 * @param htmlPage
 */
HandlerHelpers.prototype.replaceLocationInInlineScripts = function (htmlPage) {
    if (typeof htmlPage !== "string" || htmlPage.length === 0)
        throw new Error("Invalid html document");

    const $ = cheerio.load(htmlPage);
    const scripts = $("script");
    const thisHelper = this;

    scripts.each(function () {
        const currentItem = $(this);
        if (typeof currentItem.attr("src") === "undefined") {
            const newJsCode = thisHelper.replaceLocationInJsCode(currentItem.html());
            currentItem.html(newJsCode);
        }
    });

    return $.html();
};

/**
 * This function replaces the WebSocket(url) constructor calls with WebSocket(mcopModifyUrl(url)) in a Javascript source code and returns the modified version.
 * @param jsCode
 * @return {String}
 */
HandlerHelpers.prototype.replaceWebSocketInJsCode = function (jsCode) {
    /*const codeSnippetRegExp = /WebSocket\([a-zA-Z0-9]+\)/mg;
    const matches = jsCode.match(codeSnippetRegExp);
    if (matches !== null) {
        for (let i = 0; i < matches.length; i++) {
            let codeSnippet = matches[i];
            let url = (codeSnippet + "").replace(/WebSocket\(/, "").replace(/\)/, "");
            const newCodeSnippet = "WebSocket(mcopModifyUrl(" + url + "))";
            jsCode = jsCode.replace(codeSnippetRegExp, newCodeSnippet);
        }
    }*/


    return jsCode;
};


/*HandlerHelpers.prototype.replaceWorkerInJsCode = function (jsCode) {
    return jsCode.replace(/new\sWorker\(/mg, "McopWorker(");
};*/

/**
 * This function modifies arguments of the browser postMessage(message, origin) method into
 * postMessage(_mcopPreparePostMessageMsg(message), _mcopPreparePostMessageOrigin(origin)) and returns the changed JavaScript code.
 * It throws an exception in case the code could not be parsed.
 * @param {string} jsCode a script to parse and modify
 * @param {Object} asTree an object representing the abstract syntax tree of jsCode (generated with acorn). Provide it if you have already parsed the code with acorn.
 * @return {string}
 * @throws {Error}
 */
HandlerHelpers.prototype.replacePostMessage = function (jsCode) {
    //The code is likely a JSON object.
    /*if (/^{/m.test(jsCode) &&  /}$/m.test(jsCode))
        return jsCode;*/

    if (typeof jsCode !== 'string')
        throw new Error('Invalid JavaScript code');

    if (! /postMessage/mg.test(jsCode))
        return jsCode;


    const thisHelper = this;
    const MCOP_FUNC1_NAME = '_mcopPreparePostMessageMsg';
    const MCOP_FUNC2_NAME = '_mcopPreparePostMessageOrigin';
    const POST_MESSAGE_NAME = 'postMessage';

    const removeNewlines = function (str) {
        if (typeof str !== 'string' || /void\s+/.test(str)) return str;
        return str.replace(/[\n\s]/g, '');
    }

    //
    const buildArgumentsPart = function (args) {
        if (! Array.isArray(args) || ! (args.length >= 1 && args.length <= 3))
            return '';

        if (args.length === 1) {
            const arg1Part = removeNewlines(jsCode.substring(args[0].start, args[0].end));
            if (args[0].type === 'SequenceExpression') {
                return `${MCOP_FUNC1_NAME}((${arg1Part}))`;
            } else {
                return `${MCOP_FUNC1_NAME}(${arg1Part})`;
            }
        } else if (args.length === 2) {
            let argumentsPart = buildArgumentsPart([args[0]]);
            const arg2Part = removeNewlines(jsCode.substring(args[1].start, args[1].end));
            if (args[1].type === 'SequenceExpression') {
                argumentsPart +=`,${MCOP_FUNC2_NAME}((${arg2Part}))`;
            } else {
                argumentsPart +=`,${MCOP_FUNC2_NAME}(${arg2Part})`;
            }
            return argumentsPart;
        } else if (args.length === 3) {
            let argumentsPart = buildArgumentsPart([args[0], args[1]]);
            const arg3Part = removeNewlines(jsCode.substring(args[2].start, args[2].end));
            if (args[2].type === 'SequenceExpression') {
                argumentsPart +=`,(${arg3Part})`;
            } else {
                argumentsPart +=`,${arg3Part}`;
            }
            return argumentsPart;
        }
    }

    try {
        let jsCodeTree = thisHelper.parseJsCode(jsCode);
        let newJsCode = jsCode;


        acornTreeWalk.full(jsCodeTree, function (node) {
            if (node.type === "Program")
                return;

            if (node.type === 'CallExpression' &&
                node.callee && node.callee.property &&
                thisHelper.generateCodeFromTree(node.callee.property).includes(POST_MESSAGE_NAME) &&
                Array.isArray(node.arguments) && node.arguments.length > 0) {
                const originalSnippet = jsCode.substring(node.start, node.end);

                if (node.arguments.length >= 1 && node.arguments.length <= 3) {
                    const callPart = originalSnippet.split(POST_MESSAGE_NAME)[0] + POST_MESSAGE_NAME;
                    let modifiedSnippet = `${callPart}(${buildArgumentsPart(node.arguments)})`;
                    newJsCode = newJsCode.replace(originalSnippet, modifiedSnippet);
                }
            }
        });

        return newJsCode;
    } catch (error) {
        throw error;
    }
};

HandlerHelpers.prototype.replaceDomainInString = function (str, targetedDomain, replacementDomain) {
    if (typeof str !== 'string' || str.length === 0 ||
        typeof targetedDomain !== 'string' || targetedDomain.length === 0 ||
        typeof replacementDomain !== 'string' || replacementDomain.length === 0)
        return str;

    if (! str.includes(targetedDomain)) return str;

    return str.replace(new RegExp(targetedDomain, 'mg'), replacementDomain);
};

/**
 * Returns a string corresponding to the textual representation of an abstract syntax tree; otherwise it throws an exception.
 * @param jsCodeTree {Object} an <a hre="https://github.com/estree/estree">ESTree spec</a> object representing an abstract syntax tree of a JavaScript source code.
 * @param options {Object} an object representing the parameters allowed by the generate method of the escodegen js code generator. They are available here:
 * <a href="https://github.com/estools/escodegen/wiki/API">API</a>.
 * @return {string}
 */
HandlerHelpers.prototype.generateCodeFromTree = function(jsCodeTree, options = {compact:'auto', comments: true}){
    return escodegen.generate(jsCodeTree, options);
};


/**
 * Returns the abstract syntax tree (as per the ESTree spec) of a JavaScript source code; otherwise it throws an exception.
 * @param jsCode {string} a JavaScript source code.
 * @param options {Object} an object representing parameters supported by the parse method of the acorn JavaScript parser. As defined here
 * <a href="https://github.com/acornjs/acorn/tree/master/acorn">Acorn parse options</a>
 * @return {Object}
 */
HandlerHelpers.prototype.parseJsCode = function(jsCode, options = {ecmaVersion: "latest"}) {
    if (/(import|export)\s*\(/.test(jsCode + '')) {
        options.sourceType = 'module';
    }

    try {
        return acorn.parse(jsCode, options);
    } catch (e) {
        console.log(e);
        return acornLoose.parse(jsCode, options);
    }
};




/**
 * Replaces location to __mcopLocation in all inline scripts of the given page and returns the new page. In case an error
 * occurred throughout the process it throws an exception.
 * @param htmlPage
 */
HandlerHelpers.prototype.replaceLocationInInlineScripts = function (htmlPage) {
    if (typeof htmlPage !== "string" || htmlPage.length === 0)
        throw new Error("Invalid html document");

    const $ = cheerio.load(htmlPage);
    const scripts = $("script");
    const thisHelper = this;

    scripts.each(function () {
        const currentItem = $(this);
        if (typeof currentItem.attr("src") === "undefined") {
            const newJsCode = thisHelper.replaceLocationInJsCode(currentItem.html());
            currentItem.html(newJsCode);
        }
    });

    return $.html();
};

/**
 * Returns a full https url or throws an exception. The returned url is obtained as follows:
 * * in case the Referer header of a HTTP request is not set or it's not a secure https url the returned url is **https://canvaDomain/
 * * in case the Referer header of a HTTP request is like **https://domain/path?originalhost=real-domain** the returned url is changed to
 * **https://real-domain/path**
 * * in case the Referer header of a HTTP request contains the service worker file name (mcop-sw123456789.js) a new url without it is simply returned.
 * @param {string} targetSiteDomain the currently used jungleScout domain used by the proxy server
 * @param {string} serverName the proxy server domain
 * @param {string} rawRefererUrl a referer url to modify
 * @return string
 * @throws Error
 */
HandlerHelpers.prototype.getRealReferer = function (targetSiteDomain, serverName, rawRefererUrl) {
    if (typeof targetSiteDomain !== "string" || targetSiteDomain.length === 0)
        throw new Error("Invalid domain");

    if (typeof serverName !== "string" || serverName.length === 0)
        throw new Error("Invalid server name : " + serverName);

    const urlProtocolsRegExp = /^(https|http|wss|ws):\/\//;
    if (typeof rawRefererUrl !== "string" || rawRefererUrl.length === 0 || ! urlProtocolsRegExp.test(rawRefererUrl))
        throw new Error("Invalid referer url");

    let newRefererUrl = rawRefererUrl;
    const refererURLObjt = new URL(rawRefererUrl);

    if (this.urlContainsOriginalHost(rawRefererUrl)) {
        const relUrl = (rawRefererUrl + '').replace(refererURLObjt.origin, '');
        const realUrl = this.removeOriginalHost(relUrl);
        const realHost = this.extractOriginalHost(relUrl);
        newRefererUrl = `${refererURLObjt.protocol}//${realHost}${realUrl}`;
    } else {
        newRefererUrl = `${refererURLObjt.protocol}//${targetSiteDomain}${refererURLObjt.pathname}${refererURLObjt.search}${refererURLObjt.hash}`;
    }

    return newRefererUrl.replace(/mcop-sw123456789\.js/, "");
};


/**
 * Returns true in case a web page contains CloudFlare security hCaptcha challenge; otherwise it returns false.
 * @param {string} htmlPage a html web page to parse.
 * @return bool
 */
HandlerHelpers.prototype.isHCaptchaPage = function (htmlPage) {
    if (typeof htmlPage !== "string")
        return false;

    function itemIsFound(item) {
        return (item !== null && item.length > 0);
    }

    const $ = cheerio.load(htmlPage);

    const bypassMeta = $("#captcha-bypass");
    const challengeForm = $("#challenge-form");

    return (itemIsFound(bypassMeta) && itemIsFound(challengeForm));
};


/**
 * Injects a base tag in the head of a given html document and returns it. In case an error occurred in the process it throws an exception.
 * @param htmlPage {string} a HTML document.
 * @param hrefUrl {string} a url used to set the base's href property. The href property contains a page's url relative to the proxy server
 * @param mcopHref {string}  a url used to set the base's mcopHref property. The mcopHref contains the real url of a page.
 * @param serverDomain {string} the server's domain name
 * @return string
 * @throws Error
 */
HandlerHelpers.prototype.injectPageBase = function(htmlPage, hrefUrl, mcopHref, serverDomain = '') {
    if (typeof htmlPage !== "string" || htmlPage.length === 0)
        throw new Error("Invalid html document");

    if (typeof mcopHref !== "string" || mcopHref.length === 0)
        throw new Error("Invalid mcop href url");

    const $ = cheerio.load(htmlPage);
    const head = $("head");

    if (head.length > 0) {
        if (typeof hrefUrl !== "string" || hrefUrl.length === 0) {
            head.eq(0).prepend('<base mcophref="' + mcopHref + '">');
        } else {
            head.eq(0).prepend('<base href="' + hrefUrl + '" mcophref="' + mcopHref + '" class="mcop-added">');
        }
    }

    const thisHandler = this;
    $('script').each(function () {
        const src = $(this).attr('src');
        if (typeof src === "undefined") {
            let jsCode = $(this).html();


            try {
                jsCode = thisHandler.replaceLocationInJsCode(jsCode);
                jsCode = thisHandler.replaceWebSocketInJsCode(jsCode);
                jsCode = thisHandler.replacePostMessage(jsCode);
            } catch (error) {
                console.log("Failed to parse code \n" + jsCode);
            }

            $(this).attr("__mcopp", '1');
            $(this).html(jsCode);
        } else {
            if (serverDomain) {
                const realUrlObjt = new URL(mcopHref);
                const absoluteUrl = thisHandler.toAbsoluteUrl(src, realUrlObjt.origin);
                $(this).attr('src', thisHandler.modifyUrl(absoluteUrl, serverDomain, realUrlObjt.hostname));
            }
        }
        $(this).removeAttr("integrity");
    });

    $('link').each(function () {
        const href = $(this).attr('href');
        if (href) {
            if (serverDomain) {
                const realUrlObjt = new URL(mcopHref);
                const absoluteUrl = thisHandler.toAbsoluteUrl(href, realUrlObjt.origin);
                $(this).attr('href', thisHandler.modifyUrl(absoluteUrl, serverDomain, realUrlObjt.hostname));
            }
        }
        $(this).removeAttr("integrity");
    });

    return $.html();
};

/**
 * Returns the absolute version of **relativeUrl**.
 * @param relativeUrl {string} a relative url to convert
 * @param origin {string} an origin to append to the relative url
 * @return {string|*}
 */
HandlerHelpers.prototype.toAbsoluteUrl = function(relativeUrl, origin = '') {
    if (typeof relativeUrl !== 'string' || typeof origin !== 'string' || relativeUrl.length === 0)
        return relativeUrl;

    if ((relativeUrl + '').startsWith('//')) {
        let protocol = 'https:';
        let originUrlObjt = null;
        try {
            protocol =( new URL(origin)).protocol;
        } catch (e) {}
        return protocol + relativeUrl;
    } else if ((relativeUrl + '').startsWith('/')) {
        if (/\/(https|http|wss|ws):/.test(relativeUrl)) {
            return (relativeUrl + '').replace(/\//, '');
        }
        return origin + relativeUrl;
    } else if (/^[a-z0-9_]/.test(relativeUrl) && ! /(https|http|wss|ws):/.test(relativeUrl)) {
        return origin + '/' + relativeUrl;
    }

    return relativeUrl;
}

HandlerHelpers.prototype.injectPageBaseAsString = function(htmlPage, hrefUrl, mcopHref) {
    if (typeof htmlPage !== "string" || htmlPage.length === 0)
        throw new Error("Invalid html document");

    if (typeof mcopHref !== "string" || mcopHref.length === 0)
        throw new Error("Invalid mcop href url");

    let base = '';

    if (typeof hrefUrl !== "string" || hrefUrl.length === 0) {
        base = `<base mcophref="${mcopHref}">`
    } else {
        base = `<base href="${hrefUrl}" mcophref="${mcopHref}">`
    }

    return (htmlPage + '').replace('<head>', `<head>\n${base}`);
};

/**
 * Injects a script tag (which code is loaded from an external file) in the head of a given html document and returns it. In case an error occurred in the process it throws an exception.
 * @param htmlPage a HTML document.
 * @param {string} src a url which points to an external JavaScript file.
 * @returns string
 * @throws Error
 */
HandlerHelpers.prototype.injectJsScriptInHead = function (htmlPage, src) {
    if (typeof htmlPage !== "string" || htmlPage.length === 0)
        throw new Error("Invalid html document");

    if (typeof src !== "string" || src.length === 0)
        throw new Error("Invalid script src");

    const $ = cheerio.load(htmlPage);
    const head = $("head");
    if (head.length > 0) {
        head.eq(0).prepend('<script type="text/javascript" class="mcop-added" src="' + src + '"></script>');
    }

    return $.html();
};

HandlerHelpers.prototype.injectJsScriptInHeadAsString = function (htmlPage, src) {
    if (typeof htmlPage !== "string" || htmlPage.length === 0)
        throw new Error("Invalid html document");

    if (typeof src !== "string" || src.length === 0)
        throw new Error("Invalid script src");

    const script = `<script type="text/javascript" class="mcop-added" src="${src}"></script>`;
    return (htmlPage + '').replace('<head>', `<head>\n${script}`);
};

/**
 * Injects a script tag (which contains scripting statements) in the head of a given html document and returns it. In case an error occurred in the process it throws an exception.
 * @param htmlPage a HTML document.
 * @param {string} jsCode a JavaScript code snippet to inject.
 * @returns string
 * @throws Error
 */
HandlerHelpers.prototype.injectInlineJsScriptInHead = function (htmlPage, jsCode) {
    if (typeof htmlPage !== "string" || htmlPage.length === 0)
        throw new Error("Invalid html document");

    if (typeof jsCode !== "string" || jsCode.length === 0)
        throw new Error("Invalid JavaScript code");

    const $ = cheerio.load(htmlPage);
    const head = $("head");
    if (head.length > 0) {
        head.eq(0).prepend('<script type="text/javascript" class="mcop-added">' + jsCode + '</script>');
    }

    return $.html();
};

HandlerHelpers.prototype.prependJsCodeToInlineJsScript = function (htmlPage, jsCode) {
    if (typeof htmlPage !== "string" || htmlPage.length === 0)
        throw new Error("Invalid html document");

    if (typeof jsCode !== "string" || jsCode.length === 0)
        throw new Error("Invalid JavaScript code");

    const $ = cheerio.load(htmlPage);
    $('script').each(function () {
        const scriptCode = $(this).html();
        if (typeof scriptCode === 'string' && scriptCode.length > 0)
            $(this).html('\n' + jsCode + '\n' + scriptCode);
    });

    return $.html();
};


/**
 * Returns true if a url contains the original-host variable; otherwise it returns false.
 * @param {string} url a url to check from.
 * @return boolean
 */
HandlerHelpers.prototype.urlContainsOriginalHost = function (url) {
    if (typeof url !== "string" || url.length === 0)
        return false;

    return /[?&]original-host=[a-z0-9.\-]+/.test(url) || /[?&]original-host%3D[a-z0-9.\-]+/.test(url);
};

/**
 * Returns the value of a variable named original-host contained in a given url. In case the variable is not found it returns the empty string.
 * In case an error occurred it throws an exception.
 * #### Note:
 * it's important to note that the original-host variable is supposed to be the last one.
 * @param {string} url a url to parse.
 * @return string
 * @throws Error
 */
HandlerHelpers.prototype.extractOriginalHost = function (url) {
    if (typeof url !== "string" || url.length === 0)
        throw new Error("Invalid url");

    const ORIGINAL_HOST = 'original-host';
    let fullUrl = decodeURIComponent(url.replace(/\?/g, '&').replace(/&/, '?'));
    let isRelativeUrl = false;
    let fullURLObjt = null;
    const fullUrlRegExp = /^(http|https|wss|ws):\/\/.+/;

    if (! fullUrlRegExp.test(fullUrl)) {
        isRelativeUrl = true;
        if (/^\//.test(fullUrl)) {
            fullUrl = 'http://fake-domain' + fullUrl;
        } else {
            fullUrl = 'http://fake-domain/' + fullUrl;
        }
    }

    try {
        fullURLObjt = new URL(fullUrl);
    } catch (e) {
        return url;
    }

    let originalDomain = '';

    fullURLObjt.searchParams.forEach(function (value, key) {
        if (key === ORIGINAL_HOST) {
            originalDomain = value;
        }
    });

    if (url.includes(ORIGINAL_HOST) && originalDomain.length === 0) {
        const urlBase = fullURLObjt.protocol + '//' + fullURLObjt.host + fullURLObjt.pathname;
        const queryPart = url.replace(urlBase, '').replace('?', '');
        const allVars = queryPart.split('&');
        if (Array.isArray(allVars) && allVars.length > 0) {
            for (let i = 0; i < allVars.length; i++) {
                const varPart = (allVars[i] + '').split('=');
                if (Array.isArray(varPart) && varPart.length === 2) {
                    if (varPart[0] === ORIGINAL_HOST) {
                        originalDomain = varPart[1];
                    }
                }
            }
        }
    }

    return originalDomain;
};

/**
 * Returns a new version of $url without the original-host variable. url is just returned unchanged if it does not
 * contain the original-host variable. An exception is thrown in case an error occurred anywhere in the process.
 * #### Note:
 * it's important to note that the original-host variable is supposed to be the last one.
 * @param {string} url a url to work on.
 * @return string
 * @throws \Exception
 */
HandlerHelpers.prototype.removeOriginalHost = function (url, serverHost = '', realHost = '') {
    const handlerHelpers = this;
    if (typeof url !== "string" || url.length === 0)
        return url;

    let fullUrl = url.replace(/\?/g, '&').replace(/&/, '?');
    let isRelativeUrl = false;
    let fullURLObjt = null;
    const fullUrlRegExp = /^(https|http|wss|ws):\/\/.+/;

    if (! fullUrlRegExp.test(fullUrl)) {
        isRelativeUrl = true;
        if (/^\//.test(fullUrl)) {
            fullUrl = 'http://fake-domain' + fullUrl;
        } else {
            fullUrl = 'http://fake-domain/' + fullUrl;
        }
    }

    //Url with malformed search part. It has ampersands (&) and no question marks (?)
    if (/&/.test(fullUrl) && ! /\?/.test(fullUrl)) {
        //replace first & by ?
        fullUrl = (fullUrl + "").replace(/&/, '?');
    }

    try {
        fullURLObjt = new URL(fullUrl);
    } catch (e) {
        return url;
    }


    if (url.includes('~')) {
        let counter = 1;
        let originalHostPart = '';
        fullURLObjt.searchParams.forEach(function (value, key) {
            if (key === 'original-host') {
                originalHostPart = key + '=' + value;
            }
        });

        let _url = url;
        if (originalHostPart.length > 0) {

            _url = (_url + '').replace(new RegExp(`\\?${originalHostPart}`, 'g'), '');
            _url = (_url + '').replace(new RegExp(`&${originalHostPart}`, 'g'), '');
            _url = (_url + '').replace(new RegExp(encodeURIComponent(`?${originalHostPart}`), 'g'), '');
            _url = (_url + '').replace(new RegExp(encodeURIComponent(`&${originalHostPart}`), 'g'), '');
            _url = (_url + '').replace(new RegExp(realHost, 'g'), serverHost);

            return _url;
        }
    }

    let searchPart = '';
    let urlVariables = [];
    if (fullURLObjt.search.includes('&')) {
        urlVariables = fullURLObjt.search.replace('?', '').split('&');
    } else {
        urlVariables.push(fullURLObjt.search.replace('?', ''));
    }

    const encodeURIComponentWrapper = function (value) {
        if (typeof value !== 'string')
            return value;

        if (/^(https|http|wss|ws):\/\//.test(value) || /\s+/.test(value)) {
            return encodeURIComponent(value);
        }

        return value;
    };

    for (let i = 0; i < urlVariables.length; i++) {
        const parts = (urlVariables[i] + '').split('=');

        if (Array.isArray(parts) && parts.length === 1) {
            const key = parts[0] + '';
            if (! /original-host/.test(key)) {
                if (! /\?/.test(searchPart)) {
                    searchPart += '?' + key;
                } else {
                    searchPart += '&' + key;
                }
            }
        } else if (Array.isArray(parts) && parts.length === 2) {
            const key = parts[0] + '';
            let value = parts[1] + '';
            const encodedHttp = encodeURIComponent('http://');
            const encodedHttps = encodeURIComponent('https://');
            const encodedWs = encodeURIComponent('ws://');
            const encodedWss = encodeURIComponent('wss://');

            if (value.includes(encodedHttp) || value.includes(encodedHttps) || value.includes(encodedWs) || value.includes(encodedWss)) {
                try {
                    const decodedValue = decodeURIComponent(value);
                    const subURL = new URL(decodedValue);

                    if (/original-host/.test(decodedValue)) {
                        const subOriginalHost = handlerHelpers.extractOriginalHost(decodedValue) + '';
                        let subSearchPart = '';
                        subURL.searchParams.forEach(function (value, key) {
                            if (! /original-host/.test(key)) {
                                if (subSearchPart.length === 0) {
                                    subSearchPart = `?${key}=${value}`;
                                } else {
                                    subSearchPart += `&${key}=${value}`;
                                }
                            }
                        });
                        value = encodeURIComponent(subURL.protocol + "//" + subOriginalHost + subURL.pathname + subSearchPart);
                    } else {
                        if (subURL.hostname === serverHost) {
                            value = encodeURIComponent(subURL.protocol + "//" + realHost + subURL.pathname + subURL.search);
                        }
                    }
                } catch (e) {}
            }

            if (! /original-host/.test(key)) {
                if (! /\?/.test(searchPart)) {
                    searchPart += '?' + key + '=' + value;
                } else {
                    searchPart += '&' + key + '=' + value;
                }
            }
        }
    }


    if (isRelativeUrl)
        return fullURLObjt.pathname + searchPart;



    return fullURLObjt.origin + fullURLObjt.pathname + searchPart;
};

/**
 * Returns a new version of a url without a given variable. The url is just returned unchanged if it does not
 * contain the given variable. An exception is thrown in case an error occurred anywhere in the process.
 * @param {string} url a url to work on.
 * @param {string} varName the GET variable to take off a given URL
 * @return {*}
 */
HandlerHelpers.prototype.removeVarFromUrl = function (url, varName) {
    if (typeof url !== "string" || url.length === 0 || typeof varName !== "string" || varName.length === 0)
        return url;

    try {
        const urlObjt = new URL(url);
        let searchPart = '';
        urlObjt.searchParams.forEach(function (value, key) {
            if (key !== varName) {
                if (searchPart.length === 0) {
                    searchPart = '?';
                } else {
                    searchPart += '&';
                }
                searchPart += key + '=' + encodeURIComponent(value);
            }
        });

        return urlObjt.protocol + '//' + urlObjt.hostname + urlObjt.pathname + searchPart;
    } catch (e) {
        return url;
    }
};


/**
 * Removes the @ char from client side cookies and return a string of cookies ready to be forwarded to a server.
 *#### Note:
 * The @ char is supposed to separate a cookie name from its domain; and all cookies without it are simply ignored.
 * @param {string} rawCookies a string containing cookies to parse.
 * @param {string} targetedDomain the domain for which cookies should be gathered.
 * @return string
 * @throws Error
 */
HandlerHelpers.prototype.getClientSideCookies = function (rawCookies, targetedDomain) {
    if (typeof rawCookies !== "string" || rawCookies.length === 0)
        return "";

    if (typeof targetedDomain !== "string" || targetedDomain.length === 0)
        throw new Error("Invalid domain");

    const cookies = rawCookies.replace(/\s/g, '').split(";");
    let cookiesFound = "";
    cookies.forEach(function (currentCookie, index, array) {
        if (currentCookie.length === 0) return;
        const parts = currentCookie.split("=");
        if (! Array.isArray(parts))
            return;

        const nameParts = parts[0].split("@");
        if (nameParts.length !== 2)
            return;

        if ((nameParts[1] + '').includes(targetedDomain)) {
            const name  = nameParts[0].replace(/\s/g, "");
            const value = currentCookie.replace(`${parts[0]}=`, '').replace(`;`, '');

            if (name.length > 0 && ! cookiesFound.includes(`${name}=`)) {
                cookiesFound += name + "=" + value + ";";
            }
        }
    });

    return cookiesFound;
};

/**
 *
 * @param rawCookies
 * @return {Array}
 */
HandlerHelpers.prototype.getAllClientSideCookiesAsArray = function (rawCookies) {
    if (typeof rawCookies !== "string" || rawCookies.length === 0)
        return [];


    const cookies = rawCookies.split(";");
    const cookiesFound = [];

    cookies.forEach(function (currentCookie, index, array) {
        const parts = currentCookie.split("=");
        if (parts.length === 2) {
            const nameParts = parts[0].split("@");
            if (nameParts.length === 2) {
                const name  = nameParts[0].replace(/\s/g, "");
                const domain  = nameParts[1].replace(/\s/g, "");
                if (name.length > 0) {
                    cookiesFound.push(`${name}=${parts[1]}; domain=${domain}; path=/;`);
                }
            } else {
                /*const name  = parts[0];
                const value  = parts[1];
                if (typeof name === "string" && typeof value === "string")
                    cookiesFound.push(`${name}=${value};`);*/
            }
        }
    });

    return cookiesFound;
};


/**
 * This function uses a list of allowed request headers and return them ,with their values, as an object in which each property corresponds to a header name.
 * This helps ensure that only specific headers can be sent to a destination server.
 * @param {{}} requestHeaders an object containing all the headers of a request.
 * @param {[]} supportedNames an array containing the names of supported headers.
 * @param {string} refererUrl a url to override the referer value from the client side.
 * @return {{}}
 */
HandlerHelpers.prototype.getAllowedRequestHeaders = function (requestHeaders, supportedNames, refererUrl) {
    if (! Array.isArray(supportedNames) || supportedNames.length === 0)
        return {};

    let headerRegExpStr = "";
    for (let i = 0; i < supportedNames.length; i++) {
        if (i < (supportedNames.length - 1)) {
            headerRegExpStr += "^" + supportedNames[i] + "$|";
        } else {
            headerRegExpStr += "^" + supportedNames[i] + "$";
        }
    }

    const allowedHeadersRegExp = new RegExp(headerRegExpStr);
    const allowedHeaders = {};

    for (let headerName in requestHeaders) {
        if (allowedHeadersRegExp.test(headerName)) {
            if (/referer/i.test(headerName)) {
                if (typeof refererUrl === "string" && refererUrl.length > 0)
                    allowedHeaders[headerName] = refererUrl;
            } else if (/Sec-Fetch-Mode/i.test(headerName)) {
                allowedHeaders[headerName] = "cors";
            } else {
                allowedHeaders[headerName] = requestHeaders[headerName];
            }
        }
    }
    return allowedHeaders;
};


/**
 * This function returns allowed request headers after excluding some headers from an original list of headers.
 * @param {Object} requestHeaders the original list of headers
 * @param {Array} excludedHeaders the list of headers to exclude
 * @param {Object} someHeadersValue a list of headers which each value will override the original value
 * @return {{}}
 */
HandlerHelpers.prototype.filterRequestHeaders = function (requestHeaders, excludedHeaders, someHeadersValue) {
    let headerRegExpStr = "";

    if (Array.isArray(excludedHeaders)) {
        for (let i = 0; i < excludedHeaders.length; i++) {
            if (i < (excludedHeaders.length - 1)) {
                headerRegExpStr += "^" + excludedHeaders[i] + "$|";
            } else {
                headerRegExpStr += "^" + excludedHeaders[i] + "$";
            }
        }
    }

    const excludedHeadersRegExp = new RegExp(headerRegExpStr, "im");

    const allowedHeaders = {};

    if (requestHeaders !== null && typeof requestHeaders === "object" && typeof requestHeaders.hasOwnProperty === "function") {
        for (let headerName in requestHeaders) {
            if (! excludedHeadersRegExp.test(headerName)) {
                /*if (/Sec-Fetch-Mode/i.test(headerName)) {
                    allowedHeaders[headerName] = "cors";
                } else {
                    allowedHeaders[headerName] = requestHeaders[headerName];
                }*/
                allowedHeaders[headerName] = requestHeaders[headerName];
            }
        }
    }

    if (someHeadersValue !== null && typeof someHeadersValue === "object" && typeof someHeadersValue.hasOwnProperty === "function") {
        for (let headerName in someHeadersValue) {
            if (typeof allowedHeaders[headerName] !== "undefined") {
                allowedHeaders[headerName] = someHeadersValue[headerName];
            }
        }
    }

    return allowedHeaders;
};

/**
 * Return true if a given MIME type is a binary one; otherwise it returns false.
 * #### Note:
 * MIME types starting with image, application (except application/javascript,application/json) and text/csv are considered as binary.
 * @param {string} contentType a MIME type.
 * @return boolean
 */
HandlerHelpers.prototype.isBinary = function (contentType) {
    if (typeof contentType !== "string" || /javascript/i.test(contentType) || /json/i.test(contentType))
        return false;

    return /image|font|audio|video|application|text\/csv/i.test(contentType);
};


/**
 * Return true if a given MIME type is text/html; otherwise it returns false.
 * @param {string} contentType a MIME type.
 * @return boolean
 */
HandlerHelpers.prototype.mimeIsHtml = function (contentType) {
    if (typeof contentType !== "string")
        return false;

    return /text\/html/mi.test(contentType);
};

HandlerHelpers.prototype.isHtml = function(content) {
    if (typeof content !== "string")
        return false;

    return (/<html/.test(content) || (/^</.test(content) && />/.test(content)));
};

HandlerHelpers.prototype.isFullHtmlPage = function(content) {
    if (typeof content !== "string")
        return false;

    return /<html/m.test(content);
};

HandlerHelpers.prototype.mimeIsJson = function(contentType) {
    if (typeof contentType !== "string")
        return false;

    return /application\/json/i.test(contentType);
};

HandlerHelpers.prototype.isXml = function (str) {
    return /^<\?xml/.test(str + '');
};

HandlerHelpers.prototype.isJson = function (str) {
    return /^{/.test(str + '') && /}$/.test(str + '');
};


/**
 * Return true if a given MIME type contains javascript; otherwise it returns false.
 * @param {string} contentType a MIME type.
 * @return boolean
 */
HandlerHelpers.prototype.mimeIsJs = function (contentType) {
    if (typeof contentType !== "string")
        return false;

    return /text\/javascript|application\/javascript|text\/ecmascript|application\/ecmascript/i.test(contentType);
};

HandlerHelpers.prototype.isJsCode = function (str) {
    if (str === null || ! (typeof str === "string" || (typeof str === 'object' && typeof str['toString'] === 'function')))
        return false;

    if (typeof str === 'object' && typeof str['toString'] === 'function') str = str['toString']();

    const jsReservedWords = [
        'abstract','arguments','await','boolean','break','byte','case','catch','char','class',
        'const','continue','debugger','default','delete','do','double','else','enum','eval','export',
        'extends','false','final','finally','float','for','function','goto','if','implements','import',
        'in','instanceof','int','interface','let','long','native','new','null','package','private',
        'protected','public','return','short','static','super','switch','synchronized','this','throw','throws',
        'transient','true','try','typeof','var','void','volatile','while','with','yield'
    ];
    let containsReservedWord = false;
    for (let i = 0; i < jsReservedWords.length; i++) {
        const aWord = jsReservedWords[i] + '';
        if (str.includes(aWord)) {
            containsReservedWord = true;
            break;
        }
    }

    return containsReservedWord;
};

/**
 * Returns true if the supplied url corresponds to a any item of the MCO proxy; otherwise it returns false.
 * #### Note:
 * The itmes include:
 * * the **mcop-sw-loader123456789.js** file corresponds to the **mcop-sw-loader-ab$012345.js** file located in the ui/static/js folder
 * * the **mcop-sw123456789.js** file corresponds to the **mcop-sw-ab$012345-old.js** file located in the ui/static/js folder
 * * the **mcop-compos123456789.js** file corresponds to the **mcop-components-ab$012345-old.js** file located in the ui/static/js folder
 * @param {string} url a string representing a url to check from.
 * @return boolean
 */
HandlerHelpers.prototype.isMcoProxyPart = function (url) {
    if (typeof url !== "string" || url.length === 0)
        return false;

    return /mcop-sw-loader123456789\.js|mcop-sw123456789\.js|mcop-compos123456789\.js/i.test(url);
};


HandlerHelpers.prototype.isAbsoluteUrl = function (url) {
    return /^(https|http|wss|ws):\/\//.test(url + '');
};

HandlerHelpers.prototype.isRootUrl = function (url) {
    return /^(\/|\/\?.*)/.test(url + '');
};

/**
 * This function replaces the domain in $url with the server name and appends it at the end as the value of the original-host variable.
 * If $url already contains the server name it's returned unchanged. urls without the https scheme are returned unchanged. In case an error
 * occurred an exception is thrown.
 * #### Examples:
 * * https://a-domain/ is rewritten to https://server-name/?original-host=a-domain
 * * https://server-name/ is returned unchanged
 * * http://server-name/ is returned unchanged
 * @param  url {string} a string representing a url to modify.
 * @param proxyServerDomain {string} a string representing a proxy server name.
 * @param proxyServerDomain {string} a string representing a proxy server name.
 * @param appDomain {string} a string representing a proxied application domain.
 * @return string
 * @throws Error
 */
HandlerHelpers.prototype.modifyUrl = function (url, proxyServerDomain, appDomain= '') {
    if (typeof proxyServerDomain !== "string" || proxyServerDomain.length === 0)
        throw new Error("Invalid server name");

    if (/^\/\//.test(url)) {
        url = "https:" + url;
    }

    const localhostRegExp = new RegExp("https://" + proxyServerDomain);
    if (typeof url !== "string" || url.length === 0 || localhostRegExp.test(url) || /data:|blob:|javascript:|^#/.test(url))
        return url;

    let newUrl = url;
    if (/^(https|http|wss|ws):\/\//.test(url)) {
        let urlObjt = new URL(url);

        newUrl = urlObjt.protocol + "//" + proxyServerDomain + urlObjt.pathname + urlObjt.search;

        if (urlObjt.hostname !== appDomain) {
            if (/\?/.test(newUrl)) {
                newUrl += "&original-host=" + urlObjt.hostname + urlObjt.hash;
            } else {
                newUrl += "?original-host=" + urlObjt.hostname + urlObjt.hash;
            }
        }
    } else {
        newUrl = url;
        if (url.charAt(0) === "/") {
            newUrl = "https://" + proxyServerDomain + url;
        } else {
            newUrl = "https://" + proxyServerDomain + "/" + url;
        }
    }

    return newUrl;
};

HandlerHelpers.prototype.modifyUrlInJson = function (jsonStr, serverName) {
    const thisHelper =  this;

    if (typeof jsonStr !== 'string' || jsonStr.length === 0)
        return jsonStr;

    if (typeof serverName !== "string" || serverName.length === 0)
        throw new Error("Invalid server name");

    const jsCode = `const fakeVar = ${jsonStr}`;

    const escapeUrl = function (url) {
        return (url + '').replace(/\//g, '\\\/');
    };

    try {
        let jsCodeTree = thisHelper.parseJsCode(jsCode);
        acornTreeWalk.full(jsCodeTree, function (node) {
            if ((node.type === 'Literal' && /^(https|http|wss|ws):\/\//.test(node.value))) {
                const originalUrl = node.value;
                const modifiedUrl = thisHelper.modifyUrl(originalUrl, serverName);

                if (/\\\//.test(node.raw)) {
                    const escapedOriginalUrl = escapeUrl(originalUrl);
                    const escapedModifiedUrl = escapeUrl(modifiedUrl);
                    jsonStr = jsonStr.replace(escapedOriginalUrl, escapedModifiedUrl);
                } else {
                    jsonStr = jsonStr.replace(originalUrl, modifiedUrl);
                }
            }
        });

        return jsonStr;
    } catch (e) {
        throw e;
    }
};

/**
 * Returns true in case cookieName is found in clientSideCookies; otherwise it returns false.
 * #### Note:
 * That cookie indicates that the service worker is loaded and functional on the client side.
 * @param {string} clientSideCookies a string containing cookies sent from the client side.
 * @param {string} cookieName a string containing cookies sent from the client side.
 * @return boolean
 */
HandlerHelpers.prototype.serviceWorkerIsLoaded = function (clientSideCookies, cookieName) {
    if (typeof clientSideCookies !== "string" || typeof cookieName !== "string")
        return false;
    const regExp = new RegExp(cookieName + "=" + ".+;?", "m");
    return regExp.test(clientSideCookies);
};

/**
 * This function replaces the WebSocket(url) constructor calls with WebSocket(mcopModifyUrl(url)) in a Javascript source code and returns the modified version.
 * @param jsCode
 * @return {String}
 */
HandlerHelpers.prototype.replaceWebSocketInJsCode = function (jsCode) {
    /*const codeSnippetRegExp = /WebSocket\([a-zA-Z0-9]+\)/mg;
    const matches = jsCode.match(codeSnippetRegExp);
    if (matches !== null) {
        for (let i = 0; i < matches.length; i++) {
            let codeSnippet = matches[i];
            let url = (codeSnippet + "").replace(/WebSocket\(/, "").replace(/\)/, "");
            const newCodeSnippet = "WebSocket(mcopModifyUrl(" + url + "))";
            jsCode = jsCode.replace(codeSnippetRegExp, newCodeSnippet);
        }
    }*/


    return jsCode;
};


/**
 * This function reads a local JavaScript file and returns its content as a string; otherwise it throws an exception.
 * @param {String} filePath a string representing a file's absolute path.
 * @param {boolean} obfuscated indicates whether to obfuscate the code prior to returning it.
 * @param {String} prependedJsCode a string representing JavaScript code that is prepended to the code found in a file.
 * @return {*}
 */
HandlerHelpers.prototype.getLocalJsFile = async function (filePath, obfuscated = true, prependedJsCode = "") {
    try {
        let jsCode = await utils.readFile(filePath);

        if (typeof prependedJsCode === "string")
            jsCode = prependedJsCode + jsCode;

        if (obfuscated) {
            jsCode = jsObfuscator.obfuscate(jsCode, {
                compact: true,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 1,
                numbersToExpressions: true,
                simplify: true,
                shuffleStringArray: true,
                splitStrings: true,
                stringArrayThreshold: 1
            });

            jsCode = 'eval(atob("' + btoa(jsCode) + '"));';
            return '(function(){' + jsCode + '})();';
        }

        return jsCode;
    } catch (error) {
        throw error
    }
};

/**
 * Returns true in case a JavaScript code snippet contains at least a call of the importScripts function; otherwise it returns false.
 * @param jsCode a JavaScript code snippet
 * @return {boolean}
 */
HandlerHelpers.prototype.containsImportScrips = function (jsCode) {
    if (typeof jsCode !== "string")
        return false;

    return /importScripts\(/m.test(jsCode) && (! /window\./.test(jsCode) || ! /document\./.test(jsCode));
};


/**
 * Returns
 * @param serverDomain
 * @return {string}
 */
HandlerHelpers.prototype.injectMcopSwInImportScrips = function (serverHost) {
    return 'importScripts("https://' + serverHost + '/mcop-sw123456789.js"); \n\r';
};

HandlerHelpers.prototype.injectMcopSwComponentsInImportScrips = function (serverDomain) {
    return 'importScripts("https://' + serverDomain + '/mcop-compos123456789.js"); \n\r';
};


/**
 * This helper method writes an uncompressed Buffer to a remote HTTP client; otherwise it throws an exception.
 * @param {string|Buffer} rawBuffer a string or Buffer to write to the underlying stream.
 * @param {Number} statusCode a positive integer representing a HTTP status code.
 * @param {http.ServerResponse} response an HTTP writable stream in which data will be sent to the remote client.
 * @throws {Error}
 */
HandlerHelpers.prototype.serveBinaryRes = function(rawBuffer, statusCode, response) {
    if (! (rawBuffer instanceof Buffer || typeof rawBuffer === "string") )
        throw new Error("Invalid data type. Buffer or string expected");

    try {


        let realBuffer = rawBuffer;
        if (typeof rawBuffer === "string") {
            realBuffer = Buffer.from(rawBuffer);
            response.setHeader('transfer-encoding', "chunked");
        } else if (rawBuffer instanceof Buffer) {
            response.setHeader('content-length', rawBuffer.length);
        }

        response.statusCode = statusCode;
        response.end(realBuffer);
    } catch (error) {
        throw error;
    }
};

/**
 * This helper method writes a compressed Buffer (using the brotli compression method) to a remote HTTP client; otherwise it throws an exception.
 * @param {string|Buffer} data a string or Buffer to write to the underlying stream.
 * @param {Number} statusCode a positive integer representing a HTTP status code.
 * @param {http.ServerResponse} response an HTTP writable stream in which data will be sent to the remote client.
 */
HandlerHelpers.prototype.serveCompressedData = function(data, statusCode, response) {
    const zlib = require("zlib");
    try {
        const compressedData = zlib.brotliCompressSync(data);

        response.statusCode = statusCode;
        response.setHeader('content-encoding', "br");
        response.setHeader('content-length', compressedData.length);
        response.end(compressedData);
    } catch (error) {
        //utils.writeToLog(JSON.stringify(response.headers));
        throw error;
    }
};


HandlerHelpers.prototype.containsPortNumber = function(host) {
    return (typeof host === 'string' && /.+:[0-9]+$/.test(host));
};

HandlerHelpers.prototype.extractPortNumber = function(host) {
    if (typeof host === 'string' && /.+:[0-9]+$/.test(host)) {
        const matches = (host + "").match(/:/g);
        if (Array.isArray(matches) && matches.length === 1) {
            const parts = (host + "").split(/:/);
            return parts[1];
        }
    }

    return '';
};

HandlerHelpers.prototype.stripPortNumber = function(host) {
    if (typeof host === 'string') {
        return (host + "").replace(/:[0-9]+$/, "");
    }

    return host;
};


HandlerHelpers.prototype.getErrorPage = function(title, message) {
    const fullPath = __dirname + '/ui/static/pages/title-msg.html';

    try {
        const htmlPage = fs.readFileSync(fullPath, {
            encoding: "utf8"
        });

        const $ = cheerio.load(htmlPage);
        $("#page-title").text(title);
        $("title").text(title);
        const msgBlock = $("#page-msg");
        msgBlock.addClass('error-block');
        msgBlock.html(message);
        return $.html();
    } catch (error) {
        utils.writeToLog(error);
        let html = '<!doctype html>\n';
        html += '<html lang="en">';
        html += '<head><title>' + title + '</title></head>';
        html += '<body>';
        html += '<h2>' + title + '</h2';
        html += '<div style="padding: 10px; color: rgba(255,0,0,0.71);">' + message + '</div>';
        html += '</body>';
        html += '</html>';
        return html;
    }
};

HandlerHelpers.prototype.getRedirectPage = function(redirectUrl, serviceName) {
    const fullPath = __dirname + '/ui/static/pages/redirect-page.html';
    const title  = 'Redirecting to ' + serviceName;

    try {
        const htmlPage = fs.readFileSync(fullPath, {
            encoding: "utf8"
        });

        const $ = cheerio.load(htmlPage);
        $("#page-title").text(title);
        $("title").text(title);
        $('#redirect-btn').attr('_href', redirectUrl);
        return $.html();
    } catch (error) {
        utils.writeToLog(error);
        let html = '<!doctype html>\n';
        html += '<html lang="en">';
        html += '<head><title>' + title + '</title></head>';
        html += '<body>';
        html += '<h2>' + title + '</h2';
        html += '<div style="padding: 10px; color: #073984;background-color: #cfe2ff;border-color: #bbd6fe;">'
            + msgHtml +
            '</div>';
        html += '</body>';
        html += '</html>';
        return html;
    }
};


/**
 * Returns true if a url contains a variable named **mcop-comenc** (representing the search part of the original url encoded in base 64), otherwise it returns false.
 * @param {string} url a url to check from
 * @return {boolean}
 */
HandlerHelpers.prototype.containsCompositeGetVar = function (url) {
    const regExp = new RegExp('\\?' + this.MCOP_COMPOSITE_GET_VAR_NAME + '=.+', 'i');
    const matchedQuestionMarks = (url + "").match(/\?/);
    return regExp.test(url + '') && ! /&/.test(url + '') && Array.isArray(matchedQuestionMarks) && matchedQuestionMarks.length === 1;
};


HandlerHelpers.prototype.decodeCompositeGetVar = function (url) {
    if (! this.containsCompositeGetVar(url))
        return url;

    try {
        const regExp = new RegExp('\\?' + this.MCOP_COMPOSITE_GET_VAR_NAME + '=.+', 'i');
        const urlParts = (url + '').split('=');
        const decodedSearch = atob(urlParts[1]);
        return (url + '').replace(regExp, '') + decodedSearch;
    } catch (e) {
        return url;
    }
};

HandlerHelpers.prototype.shouldBeDecompressed = function (contentType) {
    return /html|javascript/i.test(contentType + '');
};

HandlerHelpers.prototype.extractFileName = function (relativeUrl) {
    return path.basename((relativeUrl + '').replace(/\?.+/, ''));
};

HandlerHelpers.prototype.staticFileIsCached = function (filename, folder = __dirname) {
    if (typeof filename !== 'string' || filename.length === 0 || typeof folder !== 'string' || folder.length === 0)
        return false;

    const path = `${folder}/cache/${filename}`;
    return fs.existsSync(path);
};

HandlerHelpers.prototype.cacheStaticFile = async function (filename, content, folder = __dirname) {
    if (typeof filename !== 'string' || filename.length === 0 || typeof folder !== 'string' || folder.length === 0)
        return false;
    let error = null;
    const folderPath = `${folder}/cache`;
    const fullPath = `${folderPath}/${filename}`;
    if (! fs.existsSync(folderPath))
        await fsPromises.mkdir(folderPath);

    if (fs.existsSync(fullPath))
        await fsPromises.unlink(fullPath);
    await fsPromises.appendFile(fullPath, content).catch(function (wError) {
        error = wError;
    });

    if (error)
        throw error;
    return true;
};

HandlerHelpers.prototype.staticFileReadableStream = function (filename, folder = __dirname) {
    if (typeof filename !== 'string' || filename.length === 0 || typeof folder !== 'string' || folder.length === 0)
        return '';

    const path = `${folder}/cache/${filename}`;
    return fs.createReadStream(path);
};