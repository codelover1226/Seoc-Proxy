const querystring = require('querystring');
const fs = require('fs');
const SessionModel = require("./api/db/models/SessionModel");
const utils = require('./api/Utils');
const handlerHelpers = require('./api/HandlerHelpers');
const servicesDetails = require('./api/ServicesDetails');

const dispatcherUtils = {
    frontendComposFileTypes: {
        PROXY_ALL_FILES: 0, ALL_STATIC_FILES_SKIPPED: 1, FONT_FILES_NOT_SKIPPED: 2
    }
};

module.exports = dispatcherUtils;

dispatcherUtils.getMcopProxyJsFileContent = async function(jsFileName, fileType, isObfuscated = true) {
    let fullPath = "";
    let obfucatedFullPath = "";
    let finalJsStream = "";

    if (/mcop-sw123456789\.js/i.test(jsFileName)) {
        fullPath = __dirname + "/api/frontend-compos/proxy-parts/mcop-sw-ab$012345.js";
        switch (fileType) {
            case this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED:
                obfucatedFullPath = __dirname + "/api/frontend-compos/cache/mcop-sw-ab$012345-staticless--with-fonts-obfus.js";
                break;
            case this.frontendComposFileTypes.ALL_STATIC_FILES_SKIPPED:
                obfucatedFullPath = __dirname + "/api/frontend-compos/cache/mcop-sw-ab$012345-staticless-obfus.js";
                break;
            default:
                obfucatedFullPath = __dirname + "/api/frontend-compos/cache/mcop-sw-ab$012345-obfus.js";
                break;
        }
    } else if (/mcop-compos123456789\.js/i.test(jsFileName)) {
        fullPath = __dirname + "/api/frontend-compos/proxy-parts/mcop-components-ab$012345.js";
        switch (fileType) {
            case this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED:
                obfucatedFullPath = __dirname + "/api/frontend-compos/cache/mcop-components-ab$012345-staticless--with-fonts-obfus.js";
                break;
            case this.frontendComposFileTypes.ALL_STATIC_FILES_SKIPPED:
                obfucatedFullPath = __dirname + "/api/frontend-compos/cache/mcop-components-ab$012345-staticless-obfus.js";
                break;
            default:
                obfucatedFullPath = __dirname + "/api/frontend-compos/cache/mcop-components-ab$012345-obfus.js";
                break;
        }
    }

    if (typeof obfucatedFullPath === 'string' && obfucatedFullPath.length > 0) {
        const staticlessStr = `return this.utils.proxyMethods.ALL_STATIC_FILES_SKIPPED;`;
        const staticlessWithFontsStr = `return this.utils.proxyMethods.FONT_FILES_NOT_SKIPPED;`;

        if (isObfuscated) {
            if (! fs.existsSync(obfucatedFullPath)) {
                const fileContent = await handlerHelpers.getLocalJsFile(fullPath); // File's content is obfuscated here
                switch (fileType) {
                    case this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED:
                        await utils.writeFile(obfucatedFullPath, fileContent.replace(/return\s+this.utils.proxyMethods.PROXY_ALL_FILES;/m, staticlessWithFontsStr));
                        break;
                    case this.frontendComposFileTypes.ALL_STATIC_FILES_SKIPPED:
                        await utils.writeFile(obfucatedFullPath, fileContent.replace(/return\s+this.utils.proxyMethods.PROXY_ALL_FILES;/m, staticlessStr));
                        break;
                    default:
                        await utils.writeFile(obfucatedFullPath, fileContent);
                        break;
                }
            }
            finalJsStream = fs.createReadStream(obfucatedFullPath);
        } else {
            finalJsStream = fs.createReadStream(fullPath);
        }
    }

    return finalJsStream;
};


dispatcherUtils.getUserSessionDetails = async function (request) {
    let sentSessionCookie = null;
    let cookieName = null;
    for (let name in servicesDetails) {
        if (typeof request.cookies[servicesDetails[name].cookieName] === 'string') {
            sentSessionCookie = request.cookies[servicesDetails[name].cookieName];
            cookieName = servicesDetails[name].cookieName;
            break;
        }
    }

    if (typeof sentSessionCookie !== "string" || sentSessionCookie.length === 0) {
        return false;
    }

    let errorsFound = false;
    let mainError = null;

    const sessionModelFound = await SessionModel.findOne({token: sentSessionCookie}).exec().catch(function (error) {
        errorsFound = false;
        mainError = error;
    });

    if (sessionModelFound !== null) {
        sessionModelFound.lastRequestDate = new Date();
        await sessionModelFound.save();
    }

    if (errorsFound) {
        throw mainError;
    }


    const userDetails = (typeof sessionModelFound === 'object' && sessionModelFound !== null) ? sessionModelFound.user : false;

    if (typeof userDetails !== "object") {
        return false;
    }

    return {
        user: userDetails,
        siteId: sessionModelFound.siteId,
        cookieName: cookieName,
        cookieValue: sentSessionCookie
    };
};

dispatcherUtils.allAppsHandlersDetails = function (globalParams){
    return [
        {
            subDomain: globalParams.crunchbaseDomain,
            handler: require('./sites/crunchbase/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.spyfuDomain,
            handler: require('./sites/spyfu/handler'),
            jsFileType: this.frontendComposFileTypes.PROXY_ALL_FILES,
        },
        {
            subDomain: globalParams.yourtextDomain,
            handler: require('./sites/yourtext/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.onehourindexingDomain,
            handler: require('./sites/onehourindexing/handler'),
            jsFileType: this.frontendComposFileTypes.ALL_STATIC_FILES_SKIPPED,
        },
        {
            subDomain: globalParams.semrushDomain,
            handler: require('./sites/semrush/handler'),
            jsFileType: this.frontendComposFileTypes.ALL_STATIC_FILES_SKIPPED,
        },
        {
            subDomain: globalParams.sistrixDomain,
            handler: require('./sites/sistrix/handler'),
            jsFileType: this.frontendComposFileTypes.ALL_STATIC_FILES_SKIPPED,
        },
        {
            subDomain: globalParams.majesticDomain,
            handler: require('./sites/majestic/handler'),
            jsFileType: this.frontendComposFileTypes.ALL_STATIC_FILES_SKIPPED,
        },
        {
            subDomain: globalParams.babbarDomain,
            handler: require('./sites/babbar/handler'),
            jsFileType: this.frontendComposFileTypes.ALL_STATIC_FILES_SKIPPED,
        },
        {
            subDomain: globalParams.spinrewriterDomain,
            handler: require('./sites/spinrewriter/handler'),
            jsFileType: this.frontendComposFileTypes.PROXY_ALL_FILES
        },
        {
            subDomain: globalParams.smodinDomain,
            handler: require('./sites/smodin/handler'),
            jsFileType: this.frontendComposFileTypes.ALL_STATIC_FILES_SKIPPED,
        },
        {
            subDomain: globalParams.iconscoutDomain,
            handler: require('./sites/iconscout/handler'),
            jsFileType: this.frontendComposFileTypes.PROXY_ALL_FILES,
        },
        {
            subDomain: globalParams.espinnerDomain,
            handler: require('./sites/espinner/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED
        },
        {
            subDomain: globalParams.seolyzeDomain,
            handler: require('./sites/seolyze/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.dinorankDomain,
            handler: require('./sites/dinorank/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.wordheroDomain,
            handler: require('./sites/wordhero/handler'),
            wsHandler: require('./sites/wordhero/wsHandler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.lowfruitsDomain,
            handler: require('./sites/lowfruits/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.answerthepublicDomain,
            handler: require('./sites/answerthepublic/handler'),
            wsHandler: require('./sites/answerthepublic/wsHandler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.pbnpremiumDomain,
            handler: require('./sites/pbnpremium/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.closerscopyDomain,
            handler: require('./sites/closerscopy/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.domcopDomain,
            handler: require('./sites/domcop/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.neilpatelDomain,
            handler: require('./sites/neilpatel/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.envatoDomain,
            handler: require('./sites/envato/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.freepikDomain,
            handler: require('./sites/freepik/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.rytrDomain,
            handler: require('./sites/rytr/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.keysearchDomain,
            handler: require('./sites/keysearch/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.paraphraserDomain,
            handler: require('./sites/paraphraser/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.bigspyDomain,
            handler: require('./sites/bigspy/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.quetextDomain,
            handler: require('./sites/quetext/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.ranktrackerDomain,
            handler: require('./sites/ranktracker/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.ahrefsDomain,
            handler: require('./sites/ahrefs/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.spamzillaDomain,
            handler: require('./sites/spamzilla/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.seomonitorDomain,
            handler: require('./sites/seomonitor/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.colinkriDomain,
            handler: require('./sites/colinkri/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.keywordspeopleuseDomain,
            handler: require('./sites/keywordspeopleuse/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.serpstatDomain,
            handler: require('./sites/serpstat/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.haloscanDomain,
            handler: require('./sites/haloscan/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.copyfyDomain,
            handler: require('./sites/copyfy/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.languagetoolDomain,
            handler: require('./sites/languagetool/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.xoviDomain,
            handler: require('./sites/xovi/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.seoptimerDomain,
            handler: require('./sites/seoptimer/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
        {
            subDomain: globalParams.placeitDomain,
            handler: require('./sites/placeit/handler'),
            jsFileType: this.frontendComposFileTypes.FONT_FILES_NOT_SKIPPED,
        },
    ];
};

dispatcherUtils.pickHandler = function (currentDomain, globalParams) {
    const allHandlers = this.allAppsHandlersDetails(globalParams);

    for (let i = 0; i < allHandlers.length; i++) {
        if (allHandlers[i].subDomain === currentDomain)
            return allHandlers[i];
    }

    return false;
};

dispatcherUtils.isBlockedDomain = function(domain) {
    const __domain = domain + "";
    return /connect\.facebook\.net/i.test(__domain) || /analytics\.tiktok\.com/i.test(__domain) ||
        /static\.hotjar\.com/i.test(__domain) || /script\.hotjar\.com/i.test(__domain) ||
        /vars\.hotjar\.com/i.test(__domain) || /googlesyndication\.com/i.test(__domain) ||
        /googleadservices\.com/i.test(__domain) || /adservice\.google\.com/i.test(__domain) ||
        /doubleclick\.net/i.test(__domain) || /intercom\.io/i.test(__domain) ||
        /intercomcdn\.com/i.test(__domain) || /nr-data\.net/i.test(__domain) ||
        /getclicky\.com/i.test(__domain) || /crisp\.chat/i.test(__domain)||
        /amplitude\.com/i.test(__domain) || /clouderrorreporting\.googleapis\.com/i.test(__domain);
};
