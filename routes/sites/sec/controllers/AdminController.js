const fsPromises = require("fs").promises;
const path = require("path");
const querystring = require('querystring');
const utils = require('../../../api/Utils');
const paramsManager = require('../../../api/GlobalParamManager');
const allServicesDetails = require('../../../api/ServicesDetails');
const adminUrls = require('../../../api/AdminUrls');
const mongoDb = require("../../../api/db/Db").create();
const WordpressSiteModel = require("../../../api/db/models/WordpressSiteModel");
const ParamModel = require("../../../api/db/models/ParamModel");
const SessionModel = require("../../../api/db/models/SessionModel");
const paramNames = require("../../../api/ParamNames");
const seocConfig = require('../config');
const titlePrefix = "Seoc - ";
const contHelpers = {};
const NOT_AVAILABLE = 'N/A';


module.exports.create = function (request, reply) {
    return new AdminController(request, reply);
};




function AdminController(request, reply) {
    this.request = request;
    this.reply = reply;
}




AdminController.prototype.serveFirstSetupPage = async function () {
    const modelFound = await ParamModel.findOne({name: paramNames.GLOBAL_PARAMS_NAME}).exec();
    const params = (typeof modelFound === 'object' && modelFound !== null) ? modelFound.value : null;

    if (! params) {
        return this.reply.view('first-config', {
            title: titlePrefix + 'Initial Config', formAction: adminUrls.SAVE_FIRST_PARAMETERS_URL,
            isFirstSetup: true,
            restApiPath: '/wp-json/wp/v2/users/me',
            membershipProApiPath: '/wp-content/plugins/indeed-membership-pro/apigate.php',
        });
    }

    return this.reply.send('Not allowed');
};

AdminController.prototype.serveParamsPage = async function () {
    const thisCont = this;

    if (! thisCont.isAdmin()) {
        this.reply.send("Please connect");
        return false;
    }

    try {
        const modelFound = await ParamModel.findOne({name: paramNames.GLOBAL_PARAMS_NAME}).exec();
        const params = (typeof modelFound === 'object' && modelFound !== null) ? modelFound.value : null;

        const adminDomain = (thisCont.request.seocromom.adminDomain + '');
        const adminDomainParts = adminDomain.split(/\./g);
        const matches = adminDomain.match(/\./g);

        let tplVars = {
            title: titlePrefix + 'Admin Panel',
            formAction: adminUrls.SAVE_PARAMETERS_URL,
            wordpressSitesUrl: adminUrls.WORDPRESS_SITES_URL,
            logsUrl: adminUrls.LOGS_URL,
            logoutUrl: adminUrls.LOGOUT_URL,
            semrushKeywordLimit: params.semrushKeywordLimit,
            semrushDomainExplorerLimit: params.semrushDomainExplorerLimit,
            dinorankKeywordLimit: params.dinorankKeywordLimit,
            lowfruitsCreditLimit: params.lowfruitsCreditLimit,
            pbnpremiumViewLimit: params.pbnpremiumViewLimit,
            majestickBulkBacklinkCheckLimit: params.majestickBulkBacklinkCheckLimit,
            ahrefsSiteExplorerLimit: params.ahrefsSiteExplorerLimit,
            ahrefsKeywordsExplorerLimit: params.ahrefsKeywordsExplorerLimit,
            ahrefsKeywordsExportLimit: params.ahrefsKeywordsExportLimit,
            batchAnalysisLimit: params.batchAnalysisLimit,
            ahrefsBatchAnalysisExportLimit: params.ahrefsBatchAnalysisExportLimit,
            proxyIp: params.proxyIp,
            proxyPort: params.proxyPort,
            proxyUsername: params.proxyUsername,
            proxyPassword: params.proxyPassword,
            twoCaptchaEmail: params.twoCaptchaEmail,
            twoCaptchaApiKey: params.twoCaptchaApiKey,
            freepikDownloadLimit: params.freepikDownloadLimit,
            adminCanConnectOnce: (Array.isArray(matches) && matches.length >= 2)
        };

        tplVars = contHelpers.injectMenuUrls(thisCont, params, tplVars);
        tplVars = contHelpers.copyServicesParamsFromOriginToTarget(tplVars, params);

        return this.reply.view('params', tplVars);
    } catch (error) {
        await utils.writeToLog(error);
        this.reply.code(500);
        return this.reply.view("error.pug",
            { title: "Internal error", msg: "Oops! we're sorry but an error occurred on the server. Please contact the administrator." });
    }
};

AdminController.prototype.saveParams = async function () {
    const thisCont = this;
    if (! thisCont.isAdmin()) {
        return this.reply.send("Please connect");
    }

    //const result = await mongoDb.connect();
    const modelFound = await ParamModel.findOne({name: paramNames.GLOBAL_PARAMS_NAME}).exec();
    const params = (typeof modelFound === 'object' && modelFound !== null) ? modelFound.value : null;
    //await mongoDb.close();

    try {
        await this.processParamsForm(false);
        thisCont.reply.header('location', adminUrls.DASHBOARD_URL);
        thisCont.reply.code(301);
        return thisCont.reply.send('redirecting...');
    } catch (error) {
        await utils.writeToLog(error);
        /*if (! /^{/.test(error.message))
            await utils.writeToLog(error);*/

        let tplVars = {
            title: titlePrefix + 'Admin Panel',
            wordpressSitesUrl: adminUrls.WORDPRESS_SITES_URL,
            logsUrl: adminUrls.LOGS_URL,
            logoutUrl: adminUrls.LOGOUT_URL,
            errorMsg: 'An error occurred whilst saving parameters. Please check below for more.',
            errors: JSON.parse(error.message),
            semrushKeywordLimit: this.request.body['semrush-keyword-limit'],
            semrushDomainExplorerLimit: this.request.body['semrush-domain-explorer-limit'],
            dinorankKeywordLimit: this.request.body['dinorank-keyword-limit'],
            lowfruitsCreditLimit: this.request.body['lowfruits-credit-limit'],
            pbnpremiumViewLimit: this.request.body['pbnpremium-view-limit'],
            majestickBulkBacklinkCheckLimit: this.request.body['majestic-bulk-backlink-check-limit'],
            ahrefsSiteExplorerLimit: this.request.body['ahrefs-site-expl-limit'],
            ahrefsKeywordsExplorerLimit: this.request.body['ahrefs-keywords-expl-limit'],
            ahrefsKeywordsExportLimit: this.request.body['ahrefs-keywords-expl-export-limit'],
            batchAnalysisLimit: this.request.body['batch-analysis-limit'],
            ahrefsBatchAnalysisExportLimit: this.request.body['ahrefs-batch-analysis-export-limit'],
            proxyIp: this.request.body['proxy-ip'],
            proxyPort: this.request.body['proxy-port'],
            proxyUsername: this.request.body['proxy-username'],
            proxyPassword: this.request.body['proxy-password'],
            twoCaptchaEmail: this.request.body['2captcha-email'],
            twoCaptchaApiKey: this.request.body['2captcha-api-key'],
            freepikDownloadLimit: this.request.body['freepik-download-limit'],
        };

        tplVars = contHelpers.injectMenuUrls(thisCont, params, tplVars);
        tplVars = contHelpers.copyServicesParamsFromOriginToTarget(tplVars, this.request.body, false);

        return this.reply.view('params', tplVars);
    }

};


AdminController.prototype.saveParamsFirstTime = async function () {
    const result = await mongoDb.connect();
    const modelFound = await ParamModel.findOne({name: paramNames.GLOBAL_PARAMS_NAME}).exec();
    const globalParams = (typeof modelFound === 'object' && modelFound !== null) ? modelFound.value : null;

    if (! globalParams) {
        try {
            await this.processParamsForm(true);
            const wpSite = new WordpressSiteModel();
            wpSite.rootUrl = this.request.body["root-url"];
            wpSite.appSecretKey = utils.randCode(50, 100);
            wpSite.restMeApiPath = this.request.body["rest-api-path"];
            wpSite.membershipProApiPath = this.request.body["mem-pro-api-path"];
            wpSite.membershipProApiKey = this.request.body["mem-pro-api-key"];
            wpSite.creationDate = new Date();
            wpSite.changeDate = new Date();
            await wpSite.save();

            const postUpdateMsg =
                'Seo Cromom parameters were saved successfully. You can now integrate it to your Wordpress installation by copying the scripts below.';
            await this.servePhpScriptsPage(wpSite._id, false, postUpdateMsg);
        } catch (error) {
            if (! /^{/.test(error.message))
                utils.writeToLog(error);

            let tplVars = {
                isFirstSetup: true,
                title: titlePrefix + 'Initial Config', errorMsg: 'An error occurred whilst saving parameters. Please check below for more.',
                errors: JSON.parse(error.message),
                rootUrl: this.request.body['root-url'],
                restApiPath: this.request.body['rest-api-path'],
                membershipProApiPath: this.request.body['mem-pro-api-path'],
                membershipProApiKey: this.request.body['mem-pro-api-key'],
                semrushKeywordLimit: this.request.body['semrush-keyword-limit'],
                semrushDomainExplorerLimit: this.request.body['semrush-domain-explorer-limit'],
                dinorankKeywordLimit: this.request.body['dinorank-keyword-limit'],
                lowfruitsCreditLimit: this.request.body['lowfruits-credit-limit'],
                pbnpremiumViewLimit: this.request.body['pbnpremium-view-limit'],
                majestickBulkBacklinkCheckLimit: this.request.body['majestic-bulk-backlink-check-limit'],
                proxyIp: this.request.body['proxy-ip'],
                proxyPort: this.request.body['proxy-port'],
                proxyUsername: this.request.body['proxy-username'],
                proxyPassword: this.request.body['proxy-password'],
                twoCaptchaEmail: this.request.body['2captcha-email'],
                twoCaptchaApiKey: this.request.body['2captcha-api-key'],
                freepikDownloadLimit: this.request.body['freepik-download-limit'],
            };

            tplVars = contHelpers.copyServicesParamsFromOriginToTarget(tplVars, this.request.body, false);

            return this.reply.view('first-config', tplVars);
        }
    } else  {
        return this.reply.send('Not allowed');
    }
};


AdminController.prototype.processParamsForm = async function (isFirstSetup = false) {
    const newParams = contHelpers.validateParamsForm(this.request.body, isFirstSetup);
    await ParamModel.updateMany({name: paramNames.GLOBAL_PARAMS_NAME},
        {name: paramNames.GLOBAL_PARAMS_NAME, value: newParams},
        {upsert: true});
};


AdminController.prototype.serveWordpressSitesList = async function () {
    const thisCont = this;

    if (! thisCont.isAdmin()) {
        this.reply.send("Please connect");
        return false;
    }

    const allSites = await WordpressSiteModel.find({}).exec();

    return this.reply.view('all-wordpress-sites', {
        title: titlePrefix + "Wordpress sites",
        allSites: allSites,
        homeUrl: adminUrls.DASHBOARD_URL,
        phpScriptsUrl: adminUrls.PHP_SCRIPTS_URL,
        addSiteUrl: adminUrls.ADD_WORDPRESS_SITE_URL,
        deleteSiteUrl: adminUrls.DELETE_WORDPRESS_SITE_URL,
    });
};

AdminController.prototype.serveAddWordpressSiteForm = async function () {
    const thisCont = this;

    if (! thisCont.isAdmin()) {
        this.reply.send("Please connect");
        return false;
    }

    return this.reply.view('new-wordpress-site', {
        title: titlePrefix + "New Wordpress site",
        formAction: adminUrls.ADD_WORDPRESS_SITE_URL,
        backUrl: adminUrls.WORDPRESS_SITES_URL,
    });
};

AdminController.prototype.saveWordpressSite = async function () {
    const thisCont = this;

    if (! thisCont.isAdmin()) {
        this.reply.send("Please connect");
        return false;
    }

    const controls = {};
    let errorsFound = false;
    const parsedData =  thisCont.request.body;

    if (typeof parsedData["root-url"] !== "string" || parsedData["root-url"].length === 0) {
        controls["root-url"] = "Invalid root url";
        errorsFound = true;
    } else if (! /https:\/\//.test(parsedData["root-url"] + "")) {
        controls["root-url"] = "Only urls via https";
        errorsFound = true;
    } else if (/^https:\/\/.+\/$/.test(parsedData["root-url"] + "")) {
        controls["root-url"] = "Remove the <b>/</b> at the end.";
        errorsFound = true;
    }

    if (typeof parsedData["rest-api-path"] !== "string" || parsedData["rest-api-path"].length === 0) {
        controls["rest-api-path"] = "Invalid API path";
        errorsFound = true;
    } else if (! /^\/.+$/.test(parsedData["rest-api-path"] + "")) {
        controls["rest-api-path"] = "Add the first <b>/</b>";
        errorsFound = true;
    }

    if (typeof parsedData["mem-pro-api-path"] !== "string" ||  parsedData["mem-pro-api-path"].length === 0) {
        controls["mem-pro-api-path"] = "Invalid API path";
        errorsFound = true;
    } else if (! /^\/.+$/.test(parsedData["mem-pro-api-path"] + "")) {
        controls["mem-pro-api-path"] = "Add the first <b>/</b>";
        errorsFound = true;
    }

    if (typeof parsedData["mem-pro-api-key"] !== "string" || parsedData["mem-pro-api-key"].length === 0) {
        controls["mem-pro-api-key"] = "Invalid API key";
        errorsFound = true;
    }


    if (! errorsFound) {
        //const result = await mongoDb.connect();
        const wpSite = new WordpressSiteModel();
        wpSite.rootUrl = parsedData["root-url"];
        wpSite.appSecretKey = utils.randCode(50, 100);
        wpSite.restMeApiPath = parsedData["rest-api-path"];
        wpSite.membershipProApiPath = parsedData["mem-pro-api-path"];
        wpSite.membershipProApiKey = parsedData["mem-pro-api-key"];
        wpSite.creationDate = new Date();
        wpSite.changeDate = new Date();
        await wpSite.save();
        thisCont.reply.header('location', adminUrls.WORDPRESS_SITES_URL);
        thisCont.reply.code(302);
        return thisCont.reply.send('Redirecting...');
    }

   return this.reply.view('new-wordpress-site', {
        title: titlePrefix + "New Wordpress site",
        formAction: adminUrls.ADD_WORDPRESS_SITE_URL,
        backUrl: adminUrls.WORDPRESS_SITES_URL,
        errors: controls,
        errorMsg: 'An error occurred whilst saving a new site. Please check below for more.',
        rootUrl: controls["root-url"],
        restApiPath: parsedData["rest-api-path"],
        membershipProApiPath: parsedData["mem-pro-api-path"],
        membershipProApiKey: parsedData["mem-pro-api-key"],
    });
};

AdminController.prototype.servePhpScriptsPage = async function (wpSiteId, checkUser = true, speciaSuccesslMsg = null) {
    const thisCont = this;
    if (checkUser) {
        if (! thisCont.isAdmin()) {
            this.reply.send("Please connect");
            return false;
        }
    }

    //const result = await mongoDb.connect();
    let wpSite = null;
    try {
        wpSite = await WordpressSiteModel.findById(wpSiteId).exec();
    } catch (e) {
        await utils.writeToLog(e);
        return this.reply.view('wordpress-xyz-php-scripts', {
            title : titlePrefix + 'Wordpress integration',
            siteNotFound: true
        });
    }

    const modelFound = await ParamModel.findOne({name: paramNames.GLOBAL_PARAMS_NAME}).exec();
    const params = (typeof modelFound === 'object' && modelFound !== null) ? modelFound.value : null;
    //await mongoDb.close();

    const regExp = new RegExp("routes" + "\\" + path.sep + "sites" + "\\" + path.sep + "sec" + "\\" + path.sep + "controllers");
    const rootPath = __dirname.replace(regExp, "");
    const phpFileFullPath = rootPath + "deployment/php-scripts/wordpress.php";
    let rawPhpCode = (await utils.readFile(phpFileFullPath)).toString();
    let mainError = null;
    const pugTplVars = {title : titlePrefix + 'Wordpress integration', wpSiteId: wpSiteId};

    const deploymentInfos = [
        {name: allServicesDetails.seocromom.name, serviceDomain: seocConfig.domain, pugVarName: "seocPhpCode"},
        {name: allServicesDetails.crunchbase.name, serviceDomain: params.crunchbaseDomain, pugVarName: "crunchbasePhpCode"},
        {name: allServicesDetails.spyfu.name, serviceDomain: params.spyfuDomain, pugVarName: "spyfuPhpCode"},
        {name: allServicesDetails.onehourindexing.name, serviceDomain: params.onehourindexingDomain, pugVarName: "onehourindexingPhpCode"},
        {name: allServicesDetails.yourtext.name, serviceDomain: params.yourtextDomain, pugVarName: "yourtextPhpCode"},
        {name: allServicesDetails.semrush.name, serviceDomain: params.semrushDomain, pugVarName: "semrushPhpCode"},
        {name: allServicesDetails.sistrix.name, serviceDomain: params.sistrixDomain, pugVarName: "sistrixPhpCode"},
        {name: allServicesDetails.majestic.name, serviceDomain: params.majesticDomain, pugVarName: "majesticPhpCode"},
        {name: allServicesDetails.babbar.name, serviceDomain: params.babbarDomain, pugVarName: "babbarPhpCode"},
        {name: allServicesDetails.spinrewriter.name, serviceDomain: params.spinrewriterDomain, pugVarName: "spinrewriterPhpCode"},
        {name: allServicesDetails.smodin.name, serviceDomain: params.smodinDomain, pugVarName: "smodinPhpCode"},
        {name: allServicesDetails.iconscout.name, serviceDomain: params.iconscoutDomain, pugVarName: "iconscoutPhpCode"},
        {name: allServicesDetails.espinner.name, serviceDomain: params.espinnerDomain, pugVarName: "espinnerPhpCode"},
        {name: allServicesDetails.seolyze.name, serviceDomain: params.seolyzeDomain, pugVarName: "seolyzePhpCode"},
        {name: allServicesDetails.dinorank.name, serviceDomain: params.dinorankDomain, pugVarName: "dinorankPhpCode"},
        {name: allServicesDetails.wordhero.name, serviceDomain: params.wordheroDomain, pugVarName: "wordheroPhpCode"},
        {name: allServicesDetails.lowfruits.name, serviceDomain: params.lowfruitsDomain, pugVarName: "lowfruitsPhpCode"},
        {name: allServicesDetails.answerthepublic.name, serviceDomain: params.answerthepublicDomain, pugVarName: "answerthepublicPhpCode"},
        {name: allServicesDetails.pbnpremium.name, serviceDomain: params.pbnpremiumDomain, pugVarName: "pbnpremiumPhpCode"},
        {name: allServicesDetails.closerscopy.name, serviceDomain: params.closerscopyDomain, pugVarName: "closerscopyPhpCode"},
        {name: allServicesDetails.domcop.name, serviceDomain: params.domcopDomain, pugVarName: "domcopPhpCode"},
        {name: allServicesDetails.neilpatel.name, serviceDomain: params.neilpatelDomain, pugVarName: "neilpatelPhpCode"},
        {name: allServicesDetails.envato.name, serviceDomain: params.envatoDomain, pugVarName: "envatoPhpCode"},
        {name: allServicesDetails.freepik.name, serviceDomain: params.freepikDomain, pugVarName: "freepikPhpCode"},
        {name: allServicesDetails.rytr.name, serviceDomain: params.rytrDomain, pugVarName: "rytrPhpCode"},
        {name: allServicesDetails.keysearch.name, serviceDomain: params.keysearchDomain, pugVarName: "keysearchPhpCode"},
        {name: allServicesDetails.paraphraser.name, serviceDomain: params.paraphraserDomain, pugVarName: "paraphraserPhpCode"},
        {name: allServicesDetails.bigspy.name, serviceDomain: params.bigspyDomain, pugVarName: "bigspyPhpCode"},
        {name: allServicesDetails.quetext.name, serviceDomain: params.quetextDomain, pugVarName: "quetextPhpCode"},
        {name: allServicesDetails.ranktracker.name, serviceDomain: params.ranktrackerDomain, pugVarName: "ranktrackerPhpCode"},
        {name: allServicesDetails.ahrefs.name, serviceDomain: params.ahrefsDomain, pugVarName: "ahrefsPhpCode"},
        {name: allServicesDetails.spamzilla.name, serviceDomain: params.spamzillaDomain, pugVarName: "spamzillaPhpCode"},
        {name: allServicesDetails.seomonitor.name, serviceDomain: params.seomonitorDomain, pugVarName: "seomonitorPhpCode"},
        {name: allServicesDetails.colinkri.name, serviceDomain: params.colinkriDomain, pugVarName: "colinkriPhpCode"},
        {name: allServicesDetails.keywordspeopleuse.name, serviceDomain: params.keywordspeopleuseDomain, pugVarName: "keywordspeopleusePhpCode"},
        {name: allServicesDetails.serpstat.name, serviceDomain: params.serpstatDomain, pugVarName: "serpstatPhpCode"},
        {name: allServicesDetails.haloscan.name, serviceDomain: params.haloscanDomain, pugVarName: "haloscanPhpCode"},
        {name: allServicesDetails.copyfy.name, serviceDomain: params.copyfyDomain, pugVarName: "copyfyPhpCode"},
        {name: allServicesDetails.languagetool.name, serviceDomain: params.languagetoolDomain, pugVarName: "languagetoolPhpCode"},
        {name: allServicesDetails.xovi.name, serviceDomain: params.xoviDomain, pugVarName: "xoviPhpCode"},
        {name: allServicesDetails.seoptimer.name, serviceDomain: params.seoptimerDomain, pugVarName: "seoptimerPhpCode"},
        {name: allServicesDetails.placeit.name, serviceDomain: params.placeitDomain, pugVarName: "placeitPhpCode"},
    ];

    for (let i = 0; i < deploymentInfos.length;i++) {
        pugTplVars[deploymentInfos[i].pugVarName] =
            (rawPhpCode + "")
                .replace(/SERVICE_NAME_PLACEHOLDER/g, deploymentInfos[i].name)
                .replace(/KEY_PLACEHOLDER/g, wpSite.appSecretKey)
                .replace(/SERVICE_DOMAIN/g, deploymentInfos[i].serviceDomain)
                .replace(/SITE_PLACEHOLDER/g, wpSite._id);
    }

    if (typeof speciaSuccesslMsg === 'string' && speciaSuccesslMsg.length > 0)
        pugTplVars['speciaSuccesslMsg'] = speciaSuccesslMsg;
    return this.reply.view('wordpress-xyz-php-scripts.pug', pugTplVars);
};

AdminController.prototype.deleteWordpressSite = async function () {
    const thisCont = this;
    if (! thisCont.isAdmin()) {
        return this.reply.send("Please connect");
    }

    //const result = await mongoDb.connect();
    await WordpressSiteModel.findByIdAndDelete({_id : thisCont.request.query.id}).exec();

    //await mongoDb.close();

    this.reply.header('location', adminUrls.WORDPRESS_SITES_URL);
    this.reply.code(302);
    return this.reply.send('Redirecting...');
};

AdminController.prototype.redirectTo = function () {
    const thisCont = this;

    if (! thisCont.isAdmin()) {
        return this.reply.send("Please connect");
    }

    if (typeof this.request.query.endpoint === 'string' && this.request.query.endpoint.length > 0) {
        //this.reply.code(303).redirect(302, querystring.unescape(this.request.query.endpoint));
        return this.reply.view("redirecting.pug", {redirectUrl: this.request.query.endpoint});
    } else {
        throw new Error("Invalid requirect endpoint");
    }
};

AdminController.prototype.logout = async function () {
    const thisCont = this;

    if (thisCont.isAdmin()) {
        //const result = await mongoDb.connect();
        const sessionModel = await SessionModel.findOne({token : thisCont.request.seocromom.cookieValue}).exec();
        if (sessionModel) {
            //await sessionModel.remove();
            await SessionModel.deleteMany({
                userId: sessionModel.userId,
                siteId: sessionModel.siteId,
            });
            thisCont.reply.header("Set-Cookie", `${thisCont.request.seocromom.cookieName}=0; Expires= 21 Oct 1980 07:28:00 GMT`);
        }

        //await mongoDb.close();
    }


    thisCont.reply.header("location", adminUrls.DASHBOARD_URL);
    thisCont.reply.code(302);
    return thisCont.reply.send("You are now logged out of seocromom");
};

AdminController.prototype.isAdmin = function () {
    if (typeof this.request.seocromom !== 'object' ||
        typeof this.request.seocromom.currentUser !== 'object' ||
        this.request.seocromom.currentUser.role !== 'admin')
        return false;

    return true;
};







contHelpers.validateParamsForm = function (formData, isFirstSetup = false) {
    const controls = {};
    let errorsFound = false;
    const subdomainAndDomainRegExp = /(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]/i;
    const result = {};

    if (isFirstSetup) {
        result.rootUrl = formData["root-url"];
        if (typeof formData["root-url"] !== "string" || formData["root-url"].length === 0) {
            controls["root-url"] = "Invalid root url";
            errorsFound = true;
        } else if (! /https:\/\//.test(formData["root-url"] + "")) {
            controls["root-url"] = "Only urls via https";
            errorsFound = true;
        } else if (/^https:\/\/.+\/$/.test(formData["root-url"] + "")) {
            controls["root-url"] = "Remove the <b>/</b> at the end.";
            errorsFound = true;
        }

        result.restApiPath = formData["rest-api-path"];
        if (typeof formData["rest-api-path"] !== "string" || formData["rest-api-path"].length === 0) {
            controls["rest-api-path"] = "Invalid API path";
            errorsFound = true;
        } else if (! /^\/.+$/.test(formData["rest-api-path"] + "")) {
            controls["rest-api-path"] = "Add the first <b>/</b>";
            errorsFound = true;
        }

        result.membershipProApiPath = formData["mem-pro-api-path"];
        if (typeof formData["mem-pro-api-path"] !== "string" ||  formData["mem-pro-api-path"].length === 0) {
            controls["mem-pro-api-path"] = "Invalid API path";
            errorsFound = true;
        } else if (! /^\/.+$/.test(formData["mem-pro-api-path"] + "")) {
            controls["mem-pro-api-path"] = "Add the first <b>/</b>";
            errorsFound = true;
        }

        result.membershipProApiKey = formData["mem-pro-api-key"];
        if (typeof formData["mem-pro-api-key"] !== "string" || formData["mem-pro-api-key"].length === 0) {
            controls["mem-pro-api-key"] = "Invalid API key";
            errorsFound = true;
        }
    }

    for (let propName in allServicesDetails) {
        const serviceName = allServicesDetails[propName].name;
        const domainFieldName = `${serviceName}-domain`;
        const usernameFieldName = `${serviceName}-username`;
        const passwordFieldName = `${serviceName}-pwrd`;
        const serviceDomain = `${serviceName}Domain`;
        const serviceUsername = `${serviceName}Username`;
        const servicePassword = `${serviceName}Password`;

        if (serviceName === allServicesDetails.seocromom.name)
            continue;

        const curDomainValue = (formData[domainFieldName] + '').replace(/\s/g, '');
        result[serviceDomain] = curDomainValue;
        if (typeof curDomainValue !== "string" || curDomainValue.length === 0) {
            formData[domainFieldName] = NOT_AVAILABLE;
        } else {
            if (curDomainValue !== NOT_AVAILABLE && ! subdomainAndDomainRegExp.test(curDomainValue)) {
                controls[domainFieldName] = "Invalid domain";
                errorsFound = true;
            }
        }

        if (typeof formData[usernameFieldName] !== "string" || formData[usernameFieldName].length === 0) {
            result[serviceUsername] = NOT_AVAILABLE;
        } else {
            result[serviceUsername] = formData[usernameFieldName];
        }

        if (typeof formData[passwordFieldName] !== "string" || formData[passwordFieldName].length === 0) {
            result[servicePassword] = NOT_AVAILABLE;
        } else {
            result[servicePassword] = formData[passwordFieldName];
        }
    }

    const numericFieldsDetails = [
        {refParamName: 'semrushDomain',paramName: 'semrushKeywordLimit', fieldName: 'semrush-keyword-limit'},
        {refParamName: 'semrushDomain',paramName: 'semrushDomainExplorerLimit', fieldName: 'semrush-domain-explorer-limit'},
        {refParamName: 'dinorankDomain',paramName: 'dinorankKeywordLimit', fieldName: 'dinorank-keyword-limit'},
        {refParamName: 'lowfruitsDomain',paramName: 'lowfruitsCreditLimit', fieldName: 'lowfruits-credit-limit'},
        {refParamName: 'pbnpremiumDomain',paramName: 'pbnpremiumViewLimit', fieldName: 'pbnpremium-view-limit'},
        {refParamName: 'majesticDomain',paramName: 'majestickBulkBacklinkCheckLimit', fieldName: 'majestic-bulk-backlink-check-limit'},
        {refParamName: 'freepikDomain',paramName: 'freepikDownloadLimit', fieldName: 'freepik-download-limit'},
        {refParamName: 'ahrefsDomain',paramName: 'ahrefsSiteExplorerLimit', fieldName: 'ahrefs-site-expl-limit'},
        {refParamName: 'ahrefsDomain',paramName: 'ahrefsKeywordsExplorerLimit', fieldName: 'ahrefs-keywords-expl-limit'},
        {refParamName: 'ahrefsDomain',paramName: 'ahrefsKeywordsExportLimit', fieldName: 'ahrefs-keywords-expl-export-limit'},
        {refParamName: 'ahrefsDomain',paramName: 'batchAnalysisLimit', fieldName: 'batch-analysis-limit'},
        {refParamName: 'ahrefsDomain',paramName: 'ahrefsBatchAnalysisExportLimit', fieldName: 'ahrefs-batch-analysis-export-limit'},
    ];

    for (const i in numericFieldsDetails) {
        const fieldDetails = numericFieldsDetails[i];
        result[fieldDetails.paramName] = 0;
        if (result[fieldDetails.refParamName] !== NOT_AVAILABLE) {
            if (typeof formData[fieldDetails.fieldName] !== "string" ||
                formData[fieldDetails.fieldName].length === 0 ||
                /[^0-9]/.test(formData[fieldDetails.fieldName].replace(/\s/g, '') + "")) {
                controls[fieldDetails.fieldName] = "Invalid limit";
                errorsFound = true;
            } else {
                result[fieldDetails.paramName] = formData[fieldDetails.fieldName];
            }
        }
    }





    result['proxyIp'] = result['proxyPort'] = result['proxyUsername'] = result['proxyPassword'] = '';
    if (formData['proxy-ip'] && formData['proxy-port'] && formData['proxy-username'] && formData['proxy-password']) {
        result['proxyIp'] = formData['proxy-ip'];
        result['proxyPort'] = formData['proxy-port'];
        result['proxyUsername'] = formData['proxy-username'];
        result['proxyPassword'] = formData['proxy-password'];
        if (/[^0-9]/.test(formData['proxy-port'] + '')) {
            controls["proxy-port"] = "Invalid port number";
            errorsFound = true;
        }
    }

    result['twoCaptchaEmail'] = result['twoCaptchaApiKey'] = '';
    if (formData['2capctha-email'] && formData['2capctha-api-key']) {
        result['twoCaptchaEmail'] = formData['2capctha-email'];
        result['twoCaptchaApiKey'] = formData['2capctha-api-key'];
    }


    if (errorsFound) {
        throw new Error(JSON.stringify(controls));
    }


    return result;
};

contHelpers.copyServicesParamsFromOriginToTarget = function (targetedObject, originObject, copyFromSavedParams = true) {

    for (let serviceName in allServicesDetails) {
        const name = allServicesDetails[serviceName].name;
        const serviceDomain = `${name}Domain`;
        const serviceUsername = `${name}Username`;
        const servicePassword = `${name}Password`;

        if (copyFromSavedParams) {
            if (typeof originObject[serviceDomain] === 'string' && originObject[serviceDomain].length > 0) {
                targetedObject[serviceDomain] = originObject[serviceDomain];
            } else {
                targetedObject[serviceDomain] = NOT_AVAILABLE;
            }

            if (typeof originObject[serviceUsername] === 'string' && originObject[serviceUsername].length > 0) {
                targetedObject[serviceUsername] = originObject[serviceUsername];
            } else {
                targetedObject[serviceUsername] = NOT_AVAILABLE;
            }

            if (typeof originObject[servicePassword] === 'string' && originObject[servicePassword].length > 0) {
                targetedObject[servicePassword] = originObject[servicePassword];
            } else {
                targetedObject[servicePassword] = NOT_AVAILABLE;
            }
        } else {
            const domainFieldName = `${name}-domain`;
            const usernameFieldName = `${name}-username`;
            const passwordFieldName = `${name}-pwrd`;

            if (typeof originObject[domainFieldName] === 'string' && originObject[domainFieldName].length > 0) {
                targetedObject[serviceDomain] = originObject[domainFieldName];
            } else {
                targetedObject[serviceDomain] = NOT_AVAILABLE;
            }

            if (typeof originObject[usernameFieldName] === 'string' && originObject[usernameFieldName].length > 0) {
                targetedObject[serviceUsername] = originObject[usernameFieldName];
            } else {
                targetedObject[serviceUsername] = NOT_AVAILABLE;
            }

            if (typeof originObject[passwordFieldName] === 'string' && originObject[passwordFieldName].length > 0) {
                targetedObject[servicePassword] = originObject[passwordFieldName];
            } else {
                targetedObject[servicePassword] = NOT_AVAILABLE;
            }
        }
    }
    return targetedObject;
};


contHelpers.injectMenuUrls = function (thisCont, params, targetedObjt) {
    const redirectUrl = 'https://' + thisCont.request.seocromom.adminDomain + adminUrls.REDIRECT_TO_SUB_DOMAINS_URL + '?endpoint=';
    targetedObjt['crunchbaseUrl'] = redirectUrl + querystring.escape('https://' + params.crunchbaseDomain + allServicesDetails.crunchbase.homeUrl);
    targetedObjt['spyfuUrl'] = redirectUrl + querystring.escape('https://' + params.spyfuDomain + allServicesDetails.spyfu.homeUrl);
    targetedObjt['onehourindexingUrl'] = redirectUrl + querystring.escape('https://' + params.onehourindexingDomain + allServicesDetails.onehourindexing.homeUrl);
    targetedObjt['yourtextUrl'] = redirectUrl + querystring.escape('https://' + params.yourtextDomain + allServicesDetails.yourtext.homeUrl);
    targetedObjt['semrushUrl'] = redirectUrl + querystring.escape('https://' + params.semrushDomain + allServicesDetails.semrush.homeUrl);
    targetedObjt['sistrixUrl'] = redirectUrl + querystring.escape('https://' + params.sistrixDomain + allServicesDetails.sistrix.homeUrl);
    targetedObjt['majesticUrl'] = redirectUrl + querystring.escape('https://' + params.majesticDomain + allServicesDetails.majestic.homeUrl);
    targetedObjt['babbarUrl'] = redirectUrl + querystring.escape('https://' + params.babbarDomain + allServicesDetails.babbar.homeUrl);
    targetedObjt['spinrewriterUrl'] = redirectUrl + querystring.escape('https://' + params.spinrewriterDomain + allServicesDetails.spinrewriter.homeUrl);
    targetedObjt['smodinUrl'] = redirectUrl + querystring.escape('https://' + params.smodinDomain + allServicesDetails.smodin.homeUrl);
    targetedObjt['iconscoutUrl'] = redirectUrl + querystring.escape('https://' + params.iconscoutDomain + allServicesDetails.iconscout.homeUrl);
    targetedObjt['espinnerUrl'] = redirectUrl + querystring.escape('https://' + params.espinnerDomain + allServicesDetails.espinner.homeUrl);
    targetedObjt['seolyzeUrl'] = redirectUrl + querystring.escape('https://' + params.seolyzeDomain + allServicesDetails.seolyze.homeUrl);
    targetedObjt['dinorankUrl'] = redirectUrl + querystring.escape('https://' + params.dinorankDomain + allServicesDetails.dinorank.homeUrl);
    targetedObjt['wordheroUrl'] = redirectUrl + querystring.escape('https://' + params.wordheroDomain + allServicesDetails.wordhero.homeUrl);
    targetedObjt['lowfruitsUrl'] = redirectUrl + querystring.escape('https://' + params.lowfruitsDomain + allServicesDetails.lowfruits.homeUrl);
    targetedObjt['answerthepublicUrl'] = redirectUrl + querystring.escape('https://' + params.answerthepublicDomain + allServicesDetails.answerthepublic.homeUrl);
    targetedObjt['pbnpremiumUrl'] = redirectUrl + querystring.escape('https://' + params.pbnpremiumDomain + allServicesDetails.pbnpremium.homeUrl);
    targetedObjt['closerscopyUrl'] = redirectUrl + querystring.escape('https://' + params.closerscopyDomain + allServicesDetails.closerscopy.homeUrl);
    targetedObjt['domcopUrl'] = redirectUrl + querystring.escape('https://' + params.domcopDomain + allServicesDetails.domcop.homeUrl);
    targetedObjt['neilpatelUrl'] = redirectUrl + querystring.escape('https://' + params.neilpatelDomain + allServicesDetails.neilpatel.homeUrl);
    targetedObjt['envatoUrl'] = redirectUrl + querystring.escape('https://' + params.envatoDomain + allServicesDetails.envato.homeUrl);
    targetedObjt['freepikUrl'] = redirectUrl + querystring.escape('https://' + params.freepikDomain + allServicesDetails.freepik.homeUrl);
    targetedObjt['rytrUrl'] = redirectUrl + querystring.escape('https://' + params.rytrDomain + allServicesDetails.rytr.homeUrl);
    targetedObjt['keysearchUrl'] = redirectUrl + querystring.escape('https://' + params.keysearchDomain + allServicesDetails.keysearch.homeUrl);
    targetedObjt['paraphraserUrl'] = redirectUrl + querystring.escape('https://' + params.paraphraserDomain + allServicesDetails.paraphraser.homeUrl);
    targetedObjt['bigspyUrl'] = redirectUrl + querystring.escape('https://' + params.bigspyDomain + allServicesDetails.bigspy.homeUrl);
    targetedObjt['quetextUrl'] = redirectUrl + querystring.escape('https://' + params.quetextDomain + allServicesDetails.quetext.homeUrl);
    targetedObjt['ranktrackerUrl'] = redirectUrl + querystring.escape('https://' + params.ranktrackerDomain + allServicesDetails.ranktracker.homeUrl);
    targetedObjt['ahrefsUrl'] = redirectUrl + querystring.escape('https://' + params.ahrefsDomain + allServicesDetails.ahrefs.homeUrl);
    targetedObjt['spamzillaUrl'] = redirectUrl + querystring.escape('https://' + params.spamzillaDomain + allServicesDetails.spamzilla.homeUrl);
    targetedObjt['seomonitorUrl'] = redirectUrl + querystring.escape('https://' + params.seomonitorDomain + allServicesDetails.seomonitor.homeUrl);
    targetedObjt['colinkriUrl'] = redirectUrl + querystring.escape('https://' + params.colinkriDomain + allServicesDetails.colinkri.homeUrl);
    targetedObjt['keywordspeopleuseUrl'] = redirectUrl + querystring.escape('https://' + params.keywordspeopleuseDomain + allServicesDetails.keywordspeopleuse.homeUrl);
    targetedObjt['serpstatUrl'] = redirectUrl + querystring.escape('https://' + params.serpstatDomain + allServicesDetails.serpstat.homeUrl);
    targetedObjt['haloscanUrl'] = redirectUrl + querystring.escape('https://' + params.haloscanDomain + allServicesDetails.haloscan.homeUrl);
    targetedObjt['copyfyUrl'] = redirectUrl + querystring.escape('https://' + params.copyfyDomain + allServicesDetails.copyfy.homeUrl);
    targetedObjt['languagetoolUrl'] = redirectUrl + querystring.escape('https://' + params.languagetoolDomain + allServicesDetails.languagetool.homeUrl);
    targetedObjt['xoviUrl'] = redirectUrl + querystring.escape('https://' + params.xoviDomain + allServicesDetails.xovi.homeUrl);
    targetedObjt['seoptimerUrl'] = redirectUrl + querystring.escape('https://' + params.seoptimerDomain + allServicesDetails.seoptimer.homeUrl);
    targetedObjt['placeitUrl'] = redirectUrl + querystring.escape('https://' + params.placeitDomain + allServicesDetails.placeit.homeUrl);

    return targetedObjt;
};


