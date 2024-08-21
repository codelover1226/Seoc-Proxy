(function () {
    const __Mcop = function (scope) {
        if (! scope)
            throw new Error("Invalid scope.");

        this._windowsDetails = [];
        this._broadcastChannel = null;
        this._cachedRealUrl = null;
        this._realOrigin = null;
        this._proxyOrigin = scope.location.origin;

        this.utils = {
            originalPrefix: '__mcopOriginal',
            originalValueOf: '__mcopOriginalValueOf',
            mcopUtilsName: '__mcopUtils',
            mcopp: '__mcopp',
            mcopHrefAttrib: '__mcophref',
            mcoppValue: '1',
            mcopLocationName: '__mcopLocation',
            locationName: 'location',
            aboutBlank: 'about:blank',
            httpPort: '80',
            httpsPort: '443',
            logTypes: {
                LOG: 'log',
                WARN: 'warn',
                ERROR: 'error',
            },
            proxyMethods: {
                PROXY_ALL_FILES: {
                    value: 0,
                    regExp: null
                }, ALL_STATIC_FILES_SKIPPED: {
                    value: 1,
                    regExp: /\.(css|json|png|jpg|map|ico|svg|mp3|mp4|jfproj|etx|pfa|fnt|vlw|woff|fot|ttf|sfd|pfb|vfb|otf|gxf|odttf|woff2|pf2|bf|ttc|chr|bdf|fon)/i
                }, FONT_FILES_NOT_SKIPPED: {
                    value: 2,
                    regExp: /\.(css|json|png|jpg|map|ico|svg|mp3|mp4)/i
                }
            },
            sWorkerFileRelPath: '/mcop-sw123456789.js',
            mcopComposFileRelPath: '/mcop-compos123456789.js',
            mcopRequestSpecialSourceVarname: '__mcop-rssrc',
            mcopRequestPossileSpecialSources: {
                FROM_IFRAME: 'ifr',
                FROM_WORKER: 'wk',
                FROM_WEBSOCKET: 'ws',
            },
            MCOP_B_CHANNEL: 'MCOP_B_CHANNEL$$$$$0987_bBuio123465321',
            mcopBroadcastChannelActions: {
                GET_IMAGE_REAL_URL: 'GET_IMAGE_REAL_URL',
                SHARE_WINDOW_INFOS: 'SHARE_WINDOW_INFOS',
            },
            generateRandomInt : function (min, max) {
                if (typeof min !== "number" || min <= 0 || /[^0-9]/.test(min + "")) {
                    return 0;
                }

                if (typeof max !== "number" || max <= 0 || /[^0-9]/.test(max + "")) {
                    return 0;
                }

                if (max < min) {
                    return min;
                }

                if (max === min) {
                    return min;
                }
                return Math.floor(Math.random() * (max - min + 1) ) + min;
            },
            ucFirst: function (str) {
                if (typeof str !== 'string' || str.length === 0)
                    return str;
                str = (str + '');
                let newStr = '';
                for (let i = 0; i < str.length; i++) {
                    if (i === 0) {
                        newStr += str.charAt(i).toUpperCase();
                    } else {
                        newStr += str.charAt(i);
                    }
                }

                return newStr;
            },
            hasToString: function(objt){
                return typeof objt === 'object' && ('toString' in objt);
            },
            urlContainsOriginalHost: function (url) {
                if (typeof url !== "string" || url.length === 0)
                    return false;

                return /[?&]original-host=[a-z0-9.\-]+/.test(url);
            },
            extractOriginalHost: function (url) {
                if (typeof url !== "string" || url.length === 0)
                    throw new Error("Invalid url");

                let fullUrl = url;
                let isRelativeUrl = false;
                let fullURL = null;
                const fullUrlRegExp = /^(http|https):\/\/.+/;

                if (! fullUrlRegExp.test(fullUrl)) {
                    isRelativeUrl = true;
                    if (/^\//) {
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
                    fullURL = new URL(fullUrl);
                } catch (e) {
                    return '';
                }

                let originalDomain = '';

                fullURL.searchParams.forEach(function (value, key) {
                    if (key === 'original-host') {
                        originalDomain = value;
                    }
                });

                return originalDomain;
            },
            removeOriginalHostAndGetRelativeUrl: function (url) {
                if (typeof url !== "string" || url.length === 0)
                    return url;

                let fullUrl = url;
                let fullURL = null;
                const fullUrlRegExp = /^(http|https):\/\/.+/;

                if (! fullUrlRegExp.test(fullUrl)) {
                    if (/^\//) {
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
                    fullURL = new URL(fullUrl);
                } catch (e) {
                    return '';
                }

                let searchPart = '';
                fullURL.searchParams.forEach(function (value, key) {
                    if (key !== 'original-host') {
                        if (searchPart.length === 0) {
                            searchPart = '?';
                        } else {
                            searchPart += '&';
                        }

                        //param value is a url
                        if (fullUrlRegExp.test(value)) {
                            //encoded url contains original-host
                            if (/original-host/.test(value)) {
                                let subURL = null;
                                try {
                                    subURL = new URL(value);
                                    let subUrlSearchPart = '';
                                    let realSubUrlDomain = '';

                                    subURL.searchParams.forEach(function (value, key) {
                                        if (key !== 'original-host') {
                                            if (searchPart.length === 0) {
                                                subUrlSearchPart = '?';
                                            } else {
                                                subUrlSearchPart += '&';
                                            }

                                            subUrlSearchPart += key + '=' + encodeURIComponent(value);
                                        } else {
                                            realSubUrlDomain = value;
                                        }
                                    });

                                    const realSubUrl = subURL.protocol + "//" + realSubUrlDomain + subURL.pathname + subUrlSearchPart;
                                    searchPart += key + '=' + encodeURIComponent(realSubUrl);
                                } catch (e) {
                                    searchPart += key + '=' + encodeURIComponent(value);
                                }
                            } else {
                                searchPart += key + '=' + encodeURIComponent(value);
                            }
                        } else {
                            searchPart += key + '=' + encodeURIComponent(value);
                        }
                    }
                });

                return fullURL.pathname + searchPart;
            },
            isBlockedDomain: function(domain) {
                const __domain = domain + "";
                return /connect\.facebook\.net/i.test(__domain) || /analytics\.tiktok\.com/i.test(__domain) ||
                    /static\.hotjar\.com/i.test(__domain) || /script\.hotjar\.com/i.test(__domain) ||
                    /vars\.hotjar\.com/i.test(__domain) || /googlesyndication\.com/i.test(__domain) ||
                    /googleadservices\.com/i.test(__domain) || /adservice\.google\.com/i.test(__domain) ||
                    /doubleclick\.net/i.test(__domain) || /intercom\.io/i.test(__domain) ||
                    /intercomcdn\.com/i.test(__domain) || /nr-data\.net/i.test(__domain) ||
                    /getclicky\.com/i.test(__domain) || /crisp\.chat/i.test(__domain)||
                    /amplitude\.com/i.test(__domain) || /clouderrorreporting\.googleapis\.com/i.test(__domain) ||
                    /owox\.com/i.test(__domain) || /chatra\.io/i.test(__domain) ||
                    /www\.google-analytics\.com/i.test(__domain);
            },
            isIFrame: function (elt) {
                return (elt && elt.tagName && elt.tagName.toLowerCase() === 'iframe')
            }
        };

        scope[this.utils.mcopUtilsName] = this.utils;
        this.scope = scope;
        this.sWorkerStatus = null;
    };

    __Mcop.prototype.isAbsoluteUrl = function (url) {
        return /^(https|http|wss|ws):\/\//.test(url + '');
    };

    __Mcop.prototype.shouldBeEncoded = function (value) {
        return /\s|\||\\|&|\?/.test(value + '') || /^(https|http|wss|ws):\/\//.test(value + '');
    };

    __Mcop.prototype.urlContainsSearchPart = function (url) {
        return /[?&]/.test(url + '');
    };

    /**
     *
     * @param {string} oldUrl a url to rewrite
     * @returns {string}
     */
    __Mcop.prototype.modifyUrl = function (oldUrl) {
        if (typeof oldUrl !== 'string')
            return oldUrl;


        if (/data:|blob:|javascript:|about:blank|^#|^\*$/.test(oldUrl) || oldUrl.length === 0) {
            return oldUrl;
        }

        const thisProxy = this;
        let newUrl = oldUrl.replace(/\s*/mg, '').replace(/\?/g, '&').replace(/&/, '?');
        const ORIGINAL_HOST = 'original-host';
        const locationUsed = (this.scope.location.href === this.utils.aboutBlank) ? this.scope.top.location : this.scope.location;

        if (! this.isAbsoluteUrl(oldUrl)) {
            if (/^\/\//.test(oldUrl)) {
                newUrl = locationUsed.protocol + oldUrl;
            } else {
                if (/^\//.test(oldUrl)) {
                    newUrl = locationUsed.origin + oldUrl;
                } else {
                    newUrl = locationUsed.origin + '/' + oldUrl;
                }

                const realHost = this.getRealHost();
                if (typeof realHost === 'string' && realHost.length > 0) {
                    if (thisProxy.urlContainsSearchPart(oldUrl)) {
                        newUrl += '&' + ORIGINAL_HOST + '=' + realHost;
                    } else {
                        newUrl += '?' + ORIGINAL_HOST + '=' + realHost;
                    }
                }

                return newUrl;
            }
        }

        if (oldUrl.startsWith(locationUsed.origin)) {
            return oldUrl;
        }

        let targetedUrlObjt = null;
        try {
            targetedUrlObjt = new URL(newUrl);
        } catch (error) {
            return oldUrl;
        }

        if (locationUsed.hostname === targetedUrlObjt.hostname)
            return oldUrl;

        newUrl = targetedUrlObjt.protocol + "//" + locationUsed.host + targetedUrlObjt.pathname;
        const realHost = targetedUrlObjt.host;

        newUrl += targetedUrlObjt.search;

        newUrl += (thisProxy.urlContainsSearchPart(newUrl)) ? '&' + ORIGINAL_HOST + '=' + realHost : '?' + ORIGINAL_HOST + '=' + realHost;
        if (typeof targetedUrlObjt.hash === 'string')
            newUrl += targetedUrlObjt.hash;

        return newUrl.replace(/null|undefined/, '');
    };

    __Mcop.prototype.inServiceWorkerScope = function () {
        //return ('ServiceWorkerGlobalScope' in this.scope) || ('DedicatedWorkerGlobalScope' in this.scope) || ('SharedWorkerGlobalScope' in this.scope);
        return ('ServiceWorkerGlobalScope' in this.scope);
    };

    __Mcop.prototype.activeProxyMethod = function () {
        return this.utils.proxyMethods.PROXY_ALL_FILES;
    };

    __Mcop.prototype.isTopWindow = function () {
        return (this.scope.parent === this.scope);
    };

    __Mcop.prototype.printMsg = function (msg, type = 'log') {
        const beginning = '[MCOP]--> ';
        if (this.scope.console[type]) {
            if (typeof msg === 'string') {
                this.scope.console[type](beginning + msg);
            } else {
                this.scope.console[type](beginning);
                this.scope.console[type](msg);
            }
        } else {
            this.scope.console.log(beginning + msg);
            if (typeof msg === 'string') {
                this.scope.console.log(beginning + msg);
            } else {
                this.scope.console.log(beginning);
                this.scope.console.log(msg);
            }
        }
    };

    __Mcop.prototype.installServiceWorker = function () {
        if (typeof this.scope.navigator === 'undefined')
            return;

        const thisProxy = this;

        //check that the service worker is active; as soon as it's no more trigger an event and quit.
        if ('serviceWorker' in this.scope.navigator) {
            const scriptUrl = "https://" + this.scope.location.host + this.utils.sWorkerFileRelPath;
            const checkInterval = setInterval(function () {
                try {

                    thisProxy.scope.navigator.serviceWorker.getRegistration(scriptUrl).then(function (registration) {
                        if (typeof registration === "undefined") {
                            thisProxy.scope.navigator.serviceWorker.register(scriptUrl).then(function (registration) {
                                //thisProxy.printMsg('main proxy method started!!');
                            }).catch(function (error) {
                            });
                        }
                    }).catch(function (error) {
                    });
                } catch (error) {
                }
            }, 0);
        }
    };

    __Mcop.prototype.stopServiceWorker = function () {
        const thisProxy = this;
        return new Promise(function (resolve, reject) {
            if (typeof thisProxy.scope.navigator === 'undefined') {
                return reject('Invalid scope provided.');
            }

            //check that the service worker is active; as soon as it's no more trigger an event and quit.
            if ('serviceWorker' in thisProxy.scope.navigator) {
                let currentRegistration = null;
                const scriptUrl = "https://" + thisProxy.scope.location.host + thisProxy.sWorkerFileRelPath;

                thisProxy.scope.navigator.serviceWorker.getRegistration(scriptUrl).then(function (registration) {
                    if (registration) {
                        registration.unregister().then(async function () {
                            //thisUtils.printMsg('main proxy method properly stopped!!');
                            return resolve(true);
                        }).catch(async function (error) {
                            thisProxy.printMsg('failed to stop main proxy method');
                            thisProxy.printMsg(error, thisProxy.utils.logTypes.WARN);
                            return reject(error);
                        });
                    } else {
                        return resolve(false);
                    }
                });
            }else {
                return reject('Invalid scope provided.');
            }
        });
    };

    __Mcop.prototype.inWindowScope = function () {
        return (('document' in this.scope) && ('Window' in this.scope));
    };

    __Mcop.prototype.getRealUrl = function () {
        if (this.scope.location.href === this.utils.aboutBlank)
            return this.utils.aboutBlank;

        let realUrl = this.scope.location.href;
        if (('document' in this.scope) && ('querySelector' in this.scope['document'])) {
            const baseElt = this.scope['document'].querySelector('base');
            if (baseElt !== null) {
                this.baseElement = baseElt;
                /*if (! /https:\/\//.test(baseElt.getAttribute(this.mcophref)))
                    throw new Error('mcophref attribute is missing from the base element.');*/
                const href = baseElt.getAttribute('href');
                const mcophref = baseElt.getAttribute(this.utils.mcopHrefAttrib);

                if (href !== null && href.length > 0 && ! href.includes(this.scope.location.hostname)) {
                    realUrl = href;
                } else {
                    realUrl = mcophref;
                }
            } else if (this.utils.urlContainsOriginalHost(this.scope.location.href)) {
                const expectedHost = this.utils.extractOriginalHost(this.scope.location.href);
                const relativeUrl = this.utils.removeOriginalHostAndGetRelativeUrl(this.scope.location.href);
                realUrl = this.scope.location.protocol + "//" + expectedHost + relativeUrl;
            }
        }

        this._cachedRealUrl = realUrl;
        return realUrl;
    };

    __Mcop.prototype.modifyProperty = function (objtToModify, propName, getFunct, setFunct){
        if (typeof objtToModify !== "object")
            throw new Error("Invalid object to modify");

        if (typeof propName !== "string" || propName.length === 0)
            throw new Error("Invalid property name");

        if (! propName in objtToModify)
            throw new Error("the property " + propName + ' does not exist in ' + objtToModify.constructor.name);

        const descriptor = Object.getOwnPropertyDescriptor(objtToModify, propName);

        if (! descriptor || ! descriptor.configurable)
            throw new Error("the property " + propName + ' of object ' + objtToModify.constructor.name + ' has no configurable descriptor');

        if (typeof getFunct !== 'function')
            throw new Error("Invalid get function provided");

        if (! objtToModify[this.utils.mcopUtilsName]) {
            objtToModify[this.utils.mcopUtilsName] = this.utils;
        }

        const newDetails = {
            enumerable: true,
            configurable: true,
            get: function () {
                return getFunct.call(this, descriptor);
            }
        };

        if (typeof setFunct === 'function' && typeof descriptor.set === 'function') {
            newDetails['set'] = function (value) {
                setFunct.call(this, descriptor, value);
            }
        }

        const mcopOriginalProp = this.utils.originalPrefix + this.utils.ucFirst(propName);
        if (! (mcopOriginalProp in objtToModify)) {
            Object.defineProperty(objtToModify, mcopOriginalProp, descriptor);
            Object.defineProperty(objtToModify, propName, newDetails);
        }
    };

    __Mcop.prototype.modifyMethodOrConstructor = function (targetedObjt, methName, replacementFunct) {
        if (typeof targetedObjt !== "object")
            new Error("Invalid object to modify");

        if (typeof methName !== "string" || methName.length === 0)
            new Error("Invalid method name");

        if (! methName in targetedObjt)
            new Error("the method " + methName + ' does not exist in ' + targetedObjt.constructor.name);

        if (typeof replacementFunct !== 'function')
            new Error("the replacement function is not valid");

        if (! targetedObjt[this.utils.mcopUtilsName]) {
            targetedObjt[this.utils.mcopUtilsName] = this.utils;
        }

        const mcopOriginalMeth = this.utils.originalPrefix + this.utils.ucFirst(methName);
        if (! targetedObjt[mcopOriginalMeth]) {
            targetedObjt[mcopOriginalMeth] = targetedObjt[methName];
            targetedObjt[methName] = replacementFunct;
        }
    };

    __Mcop.prototype.initScope = function () {
        const thisProxy = this;
        this.modifyMethodOrConstructor(this.scope, 'fetch', async function () {
            if (thisProxy.utils.isBlockedDomain(arguments[0]) || thisProxy.utils.isBlockedDomain(arguments[0].url))
                return new Response("");

            const staticFilesRegexp = thisProxy.activeProxyMethod().regExp;

            if (arguments[0] instanceof  Request) {
                let referrer = '';
                if (('referrer' in arguments[0])) {
                    if (arguments[0].referrer === 'no-referrer' || arguments[0].referrer === 'client') {
                        referrer = arguments[0].referrer;
                    } else {
                        referrer = thisProxy.modifyUrl(arguments[0].referrer);
                    }
                }

                let requestOptions = {
                    method: arguments[0].method,
                    headers: new Headers(arguments[0].headers),
                    mode: 'cors',
                    cache: 'default',
                    credentials: 'include',
                    redirect: arguments[0].redirect,
                    referrer: referrer
                };

                let finalUrl = arguments[0].url + '';
                /*if (arguments[0].destination === 'image') {
                    //console.log(arguments[0]);
                    let pageDetails = null;
                    for (let i = 0; i < thisProxy._windowsDetails.length; i++) {
                        if (finalUrl.includes(thisProxy._windowsDetails[i].pageCurrentPrefix)) {
                            pageDetails = thisProxy._windowsDetails[i];
                            break;
                        }
                    }

                    if (pageDetails) {
                        finalUrl = finalUrl.replace(pageDetails.pageCurrentPrefix, pageDetails.pageRealPrefix);
                    }
                }*/

                finalUrl = thisProxy.modifyUrl(finalUrl);

                if (staticFilesRegexp && staticFilesRegexp.test(arguments[0].url) &&  /:\/\//.test(arguments[0].url)) {
                    if (thisProxy.utils.urlContainsOriginalHost(arguments[0].url)) {
                        const originalHost = thisProxy.utils.extractOriginalHost(arguments[0].url);
                        const relativeUrl = thisProxy.utils.removeOriginalHostAndGetRelativeUrl(arguments[0].url);
                        if (typeof originalHost === 'string' && originalHost.length > 0 &&
                            typeof relativeUrl === 'string' && relativeUrl.length > 0) {
                            finalUrl = 'https://' + originalHost + relativeUrl;
                        } else {
                            finalUrl = arguments[0].url;
                        }
                    } else {
                        finalUrl = arguments[0].url;
                    }

                    requestOptions['mode'] = 'no-cors';
                }

                //console.log(requestOptions.Body);
                if (/^post$/i.test(arguments[0].method)) {
                    requestOptions.body = await arguments[0].arrayBuffer();
                }

                arguments[0] = new Request(finalUrl, requestOptions);
            } else if (typeof arguments[0] === 'string' || thisProxy.utils.hasToString(arguments[0])) {
                if (!(staticFilesRegexp && staticFilesRegexp.test(arguments[0]) &&  /:\/\//.test(arguments[0].url))) {
                    arguments[0] = thisProxy.modifyUrl(arguments[0]);
                }

                if (typeof arguments[1] === 'object' && arguments[1].referrer) {
                    arguments[1].referrer = thisProxy.modifyUrl(arguments[1].referrer);
                }

                if (typeof arguments[1] === 'object' && arguments[1]['integrity']) {
                    delete arguments[1]['integrity'];
                }
            }

            return thisProxy.scope[thisProxy.utils.originalPrefix + thisProxy.utils.ucFirst('fetch')].call(thisProxy.scope, ...arguments);
        });

        //We modify the scope propery on ServiceWorkerRegistration.prototype
        this.modifyProperty(this.scope.ServiceWorkerRegistration.prototype, 'scope', function (descriptor) {
            return thisProxy.modifyUrl(descriptor.get.call(this));
        });

        if (this.scope.XMLHttpRequest && this.scope.XMLHttpRequest.prototype) {
            //We modify the open method of XMLHttpRequest.prototype
            this.modifyMethodOrConstructor(this.scope.XMLHttpRequest.prototype, 'open', function () {
                if (typeof arguments[1] === 'string' || thisProxy.utils.hasToString(arguments[1])) {
                    arguments[1] = thisProxy.modifyUrl(arguments[1]);
                }

                const result = this[thisProxy.utils.originalPrefix + thisProxy.utils.ucFirst('open')].apply(this, arguments);
                this.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                return result;
            });

            //We replace the responseURL property on XMLHttpRequest.prototype
            this.modifyProperty(this.scope.XMLHttpRequest.prototype, 'responseURL', function (descriptor) {
                return thisProxy.modifyUrl(descriptor.get.call(this));
            });
        }

        const preparePostMsgOrigin = '_mcopPreparePostMessageOrigin';
        if (! this.scope[preparePostMsgOrigin]) {
            this.scope[preparePostMsgOrigin] = function(realOrigin) {
                let returnedOrigin = realOrigin;

                if (/^http:\/\//.test(realOrigin)) {
                    returnedOrigin = thisProxy.scope.location.origin;
                    if (thisProxy.scope.location.port.length > 0) {
                        returnedOrigin += ':' + thisProxy.scope.location.port;
                    } else {
                        returnedOrigin += ':' + thisProxy.utils.httpPort;
                    }
                } else if (/^https:\/\//.test(realOrigin)) {
                    returnedOrigin = thisProxy.scope.location.origin;
                    if (thisProxy.scope.location.port.length > 0) {
                        returnedOrigin += ':' + thisProxy.scope.location.port;
                    } else {
                        returnedOrigin += ':' + thisProxy.utils.httpsPort;
                    }
                }

                return returnedOrigin;
            };
        }

        const preparePostMsgData = '_mcopPreparePostMessageMsg';
        if (! this.scope[preparePostMsgData]) {
            this.scope[preparePostMsgData] = function(originalMsg) {
                return originalMsg;
            };
        }

        if (this.scope.MessageEvent) {
            this.modifyProperty(this.scope.MessageEvent.prototype, 'origin', function (descriptor) {
                return thisProxy.modifyUrl(descriptor.get.call(this));
            });

            this.modifyProperty(this.scope.MessageEvent.prototype, 'data', function (descriptor) {
                return descriptor.get.call(this);
            });
        }

        if (this.scope.ExtendableMessageEvent) {
            this.modifyProperty(this.scope.ExtendableMessageEvent.prototype, 'origin', function (descriptor) {
                return thisProxy.modifyUrl(descriptor.get.call(this));
            });

            this.modifyProperty(this.scope.ExtendableMessageEvent.prototype, 'data', function (descriptor) {
                return descriptor.get.call(this);
            });
        }

        if (this.scope.WebSocket) {
            //We modify the native WebSocket constructor
            this.modifyMethodOrConstructor(this.scope, 'WebSocket', function () {
                arguments[0] = thisProxy.modifyUrl(arguments[0] + '');

                return new thisProxy.scope[thisProxy.utils.originalPrefix + thisProxy.utils.ucFirst('WebSocket')](...arguments);
            });
        }

        if (this.scope.Worker) {
            //We modify the native Worker constructor
            this.modifyMethodOrConstructor(this.scope, 'Worker', function () {
                arguments[0] = thisProxy.modifyUrl(arguments[0] + '');
                return new thisProxy.scope[thisProxy.utils.originalPrefix + thisProxy.utils.ucFirst('Worker')](...arguments);
            });
        }

        return this;
    };


    __Mcop.prototype.initLocation = function () {
        const thisProxy = this;

        function McopLocation(expectedUrl) {
            if (typeof expectedUrl !== "string")
                throw  new Error('Invalid real url provided to McopLocation constructor: ' + expectedUrl);

            this.expectedUrl = expectedUrl;

            if (expectedUrl !== thisProxy.utils.aboutBlank) {
                this.URL = new URL(expectedUrl);
                const thisLocation = this;
                const interval = setInterval(function () {
                    if (typeof thisProxy.scope.location.hash === 'string' && thisProxy.scope.location.hash !== thisLocation.URL.hash) {
                        let fullUrl = thisLocation.URL.protocol + "//" + thisLocation.URL.host;
                        fullUrl += thisLocation.URL.pathname + thisLocation.URL.search + thisProxy.scope.location.hash;
                        thisLocation.URL.href = fullUrl;
                        thisLocation.URL.hash = thisProxy.scope.location.hash;
                    }
                }, 5);
            }
        }

        Object.defineProperty(McopLocation.prototype, 'href', {
            enumerable: true,
            configurable: true,
            get: function () {
                return (this.expectedUrl !== thisProxy.utils.aboutBlank) ? this.URL.href : thisProxy.utils.aboutBlank;
            },
            set: function (newHref) {
                let modifiedHref = thisProxy.modifyUrl(newHref);
                if (/^\//.test(modifiedHref)) {
                    modifiedHref = "https://" + this.URL.host + modifiedHref;
                }
                thisProxy.scope.location.href = modifiedHref;
                this.URL.href = modifiedHref;
            }
        });

        Object.defineProperty(McopLocation.prototype, 'protocol', {
            enumerable: true,
            configurable: true,
            get: function () {
                return (this.expectedUrl !== thisProxy.utils.aboutBlank) ? this.URL.protocol : "about:";
            },
            set: function (protocol) {
                if (typeof protocol === 'string') {
                    this.URL.protocol = protocol;
                    thisProxy.scope.location.protocol = protocol;
                }
            }
        });

        Object.defineProperty(McopLocation.prototype, 'host', {
            enumerable: true,
            configurable: true,
            get: function () {
                return (this.expectedUrl !== thisProxy.utils.aboutBlank) ? this.URL.host : "";
            },
            set: function (host) {
                if (typeof host === 'string') {
                    this.URL.host = host;
                    thisProxy.scope.location.host = host;
                }
            }
        });

        Object.defineProperty(McopLocation.prototype, 'hostname', {
            enumerable: true,
            configurable: true,
            get: function () {
                return (this.expectedUrl !== thisProxy.utils.aboutBlank) ? this.URL.hostname : "";
            },
            set: function (hostname) {
                if (typeof hostname === 'string') {
                    this.URL.hostname = hostname;
                    thisProxy.scope.location.hostname = hostname;
                }
            }
        });

        Object.defineProperty(McopLocation.prototype, 'port', {
            enumerable: true,
            configurable: true,
            get: function () {
                return (this.expectedUrl !== thisProxy.utils.aboutBlank) ? this.URL.port : "";
            },
            set: function (port) {
                if (typeof port === 'string') {
                    this.URL.port = port;
                    thisProxy.scope.location.port = port;
                }
            }
        });

        Object.defineProperty(McopLocation.prototype, 'pathname', {
            enumerable: true,
            configurable: true,
            get: function () {
                return (this.expectedUrl !== thisProxy.utils.aboutBlank) ? this.URL.pathname : "blank";
            },
            set: function (pathname) {
                if (typeof pathname === 'string') {
                    this.URL.pathname = pathname;
                    thisProxy.scope.location.pathname = pathname;
                }
            }
        });

        Object.defineProperty(McopLocation.prototype, 'search', {
            enumerable: true,
            configurable: true,
            get: function () {
                return (this.expectedUrl !== thisProxy.utils.aboutBlank) ? this.URL.search : "";
            },
            set: function (search) {
                if (typeof search === 'string') {
                    this.URL.search = search;
                    thisProxy.scope.location.search = search;
                }
            }
        });

        Object.defineProperty(McopLocation.prototype, 'hash', {
            enumerable: true,
            configurable: true,
            get: function () {
                return (this.expectedUrl !== thisProxy.utils.aboutBlank) ? this.URL.hash : "";
            },
            set: function (newHash) {
                this.URL.hash = newHash;
                thisProxy.scope.location.hash = newHash;
            }
        });

        Object.defineProperty(McopLocation.prototype, 'origin', {
            enumerable: true,
            configurable: true,
            get: function () {
                if (this.expectedUrl === thisProxy.utils.aboutBlank)
                    return "null";
                let expectedOrigin = this.URL.origin;

                //We are in an embedded window (for example in an iFrame, frame, etc)
                if (! thisProxy.isTopWindow()) {
                    //The current window's origin should be the one of the top window
                    expectedOrigin = thisProxy.scope.top.origin;
                }

                return expectedOrigin;
            }
        });

        McopLocation.prototype.assign = function(url) {
            const newUrl = thisProxy.modifyUrl(url);

            thisProxy.scope.location.assign(newUrl);
        };

        McopLocation.prototype.reload = function(forceReload) {
            thisProxy.scope.location.reload(forceReload);
        };

        McopLocation.prototype.replace = function(url) {
            const newUrl = thisProxy.modifyUrl(url);
            thisProxy.scope.location.replace(newUrl);
        };

        McopLocation.prototype.toString = function() {
            return this.URL.toString();
        };

        const realUrl = thisProxy.getRealUrl();
        const __mcopLocation = new McopLocation(realUrl);
        const mcopLocationDescriptor = {
            get: function () {
                return __mcopLocation;
            },
            set: function (href) {
                if (typeof href === "string") {
                    thisProxy.scope[thisProxy.utils.locationName].replace(thisProxy.modifyUrl(href));
                }
            },
            enumerable: true,
            configurable: true
        };

        if (thisProxy.inWindowScope()) {
            Object.defineProperty(thisProxy.scope, thisProxy.utils.mcopLocationName,  mcopLocationDescriptor);
            Object.defineProperty(thisProxy.scope['Window']['prototype'], thisProxy.utils.mcopLocationName,  mcopLocationDescriptor);
            Object.defineProperty(thisProxy.scope['document'], thisProxy.utils.mcopLocationName,  mcopLocationDescriptor);
        } else {
            Object.defineProperty(thisProxy.scope, thisProxy.utils.mcopLocationName,  mcopLocationDescriptor);
        }

        return this;
    };

    __Mcop.prototype.initWorker = function () {
        if (! this.inServiceWorkerScope())
            return this;

        const thisProxy = this;

        this.scope.addEventListener('install', function(event) {
            event.waitUntil(self.skipWaiting());
        });

        this.scope.addEventListener('activate', function(event) {
            //console.log("activated");
            event.waitUntil(self.clients.claim());
        });

        this.scope.addEventListener('fetch', async function(event) {
            const reqUrl = event.request.url + "";
            if (! reqUrl.startsWith(thisProxy._proxyOrigin)) {
                event.respondWith(
                    thisProxy.scope.fetch(event.request)
                );
            }

            /*if (! /worker|iframe|document/.test(event.request.destination) && event.request.destination.length > 0) {

            }*/
        });

        return this;
    };

    __Mcop.prototype.init = function () {
        this.initScope()
            .initLocation()
            .initWorker();
    };


    (new __Mcop(self)).init();
})();