"use strict";

const mongoose = require('mongoose');
const moment = require('moment');
const { Schema } = mongoose;
const utils = require('../../Utils');


const ahrefsModuleNames = Object.create(Object.prototype, {
    siteExplorer: {
        value: 'site-explorer',
        writable: false
    },
    keywordsExplorer: {
        value: 'keywords-explorer',
        writable: false
    },
    keywordsExport: {
        value: 'keywords-export',
        writable: false
    },
    batchAnalysis: {
        value: 'batch-analysis',
        writable: false
    },
    batchAnalysisExport: {
        value: 'batch-analysis-export',
        writable: false
    }
});

const AhrefsModuleLimitSchema = new Schema({
    userId: Number,
    visitedUrl: String,
    moduleUsed: String,
    time: {
        type: Date,
        default: Date.now,
        required: true,
    },
});

const AhrefsModuleLimitModel = mongoose.model('AhrefsModuleLimit', AhrefsModuleLimitSchema);

const countDailyUsage = async function(givenModule, userId) {
    const startTime = moment().startOf('d').utc();
    const endTime = moment().endOf('d').utc();

    return AhrefsModuleLimitModel.countDocuments({
        userId: userId,
        moduleUsed: givenModule,
        time: {
            $gte: startTime,
            $lte: endTime
        }
    });
}

const incrementDailyCounter = async function(givenModule, userId, visitedUrl, request = null) {
    //if (! moduleIsValid(givenModule)) return false;

    await AhrefsModuleLimitModel.create({
        userId: userId,
        visitedUrl: visitedUrl,
        moduleUsed: givenModule
    });

    return true;
}

const isDailyLimitReached = async function(userId, moduleName, globalParams, paramName) {
    const dailyLimit = Number.parseInt(globalParams[paramName]);
    const dailyCounter = await countDailyUsage(moduleName, userId);

    return dailyCounter >= dailyLimit;
}

const moduleIsValid = function (selectedModule) {
    let exists = false;
    for (const curModule in ahrefsModuleNames) {
        if (selectedModule === curModule) {
            exists = true;
            break;
        }
    }

    return exists;
}

const siteExplorer = {
    urlIsRelated: function (url) {
        return /\/v[0-9]\/se[a-zA-Z]+\?/.test(url + '') ||
            (url + '').includes('site-explorer');
    },
    isNewUsage: function (url) {
        return /\/v[0-9]\/seGetOverviewSettings/.test(url + '');
    },
    incrementDailyCounter: async function (userId, visitedUrl) {
        await incrementDailyCounter(ahrefsModuleNames.siteExplorer, userId, visitedUrl);
    },
    isLimitReached: async function (userId, globalParams) {
        return isDailyLimitReached(userId, ahrefsModuleNames.siteExplorer, globalParams, 'ahrefsSiteExplorerLimit');
    }
}

const keywordsExplorer = {
    usage: {
        urlIsRelated: function (url) {
            return /\/v[0-9]\/ke[a-zA-Z]+\?/.test(url + '') ||
                (url + '').includes('keywords-explorer');
        },
        isNew: function (url) {
            return /\/v[0-9]\/keKeywordOverview/.test(url + '');
        },
        incrementDailyCounter: async function (userId, visitedUrl) {
            await incrementDailyCounter(ahrefsModuleNames.keywordsExplorer, userId, visitedUrl);
        },
        isLimitReached: async function (userId, globalParams) {
            return isDailyLimitReached(userId, ahrefsModuleNames.keywordsExplorer, globalParams,
                'ahrefsKeywordsExplorerLimit');
        }
    },
    export: {
        isNew: function (url) {
            return /\/matomo\.php\?download=blob%3/.test(url + '');
        },
        incrementDailyCounter: async function (userId, visitedUrl) {
            await incrementDailyCounter(ahrefsModuleNames.keywordsExport, userId, visitedUrl);
        },
        isLimitReached: async function (userId, globalParams) {
            return isDailyLimitReached(userId, ahrefsModuleNames.keywordsExport, globalParams,
                'ahrefsKeywordsExportLimit');
        }
    }
}

const batchAnalysis = {
    usage: {
        urlIsRelated: function (url) {
            return /\/v[0-9]\/ke[a-zA-Z]+\?/.test(url + '') ||
                /\/batch-analysis/.test(url + '');
        },
        isNew: function (url, requestMethod) {
            return /\/batch-analysis/.test(url + '') && /post/.test(url + '');
        },
        incrementDailyCounter: async function (userId, visitedUrl) {
            await incrementDailyCounter(ahrefsModuleNames.batchAnalysis, userId, visitedUrl);
        },
        isLimitReached: async function (userId, globalParams) {
            return isDailyLimitReached(userId, ahrefsModuleNames.batchAnalysis, globalParams,
                'batchAnalysisLimit');
        }
    },
    export: {
        isNew: function (url) {
            return /\/batch-analysis\?export=1/.test(url + '');
        },
        incrementDailyCounter: async function (userId, visitedUrl) {
            await incrementDailyCounter(ahrefsModuleNames.batchAnalysisExport, userId, visitedUrl);
        },
        isLimitReached: async function (userId, globalParams) {
            return isDailyLimitReached(userId, ahrefsModuleNames.batchAnalysis, globalParams,
                'ahrefsBatchAnalysisExportLimit');
        }
    }
}


module.exports = {
    ahrefsModuleNames,
    siteExplorer, keywordsExplorer, batchAnalysis
}