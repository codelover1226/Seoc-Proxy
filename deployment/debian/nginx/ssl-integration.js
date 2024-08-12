const fs = require('fs');
const utils = require('../../../routes/api/Utils');
const mongoDb = require("../../../routes/api/db/Db").create();
const ParamModel = require("../../../routes/api/db/models/ParamModel");
const paramNames = require("../../../routes/api/ParamNames");
const seocConfig = require('../../../routes/sites/sec/config');

(async function () {
    try {
        const NGINX_CONFIG_FILE_PATH = '/etc/nginx/nginx.conf';
        const NGINX_VIRTUAL_HOSTS_FOLDER = '/etc/nginx/sites-enabled';
        const genericHostFilePath = __dirname + '/generic-virtual-host.conf';
        const configStr = await utils.readFile(genericHostFilePath) + '';
        const adminVirtualHostConfigFilePath = `${NGINX_VIRTUAL_HOSTS_FOLDER}/${seocConfig.domain}.conf`;
        const result = await mongoDb.connect();
        const modelFound = await ParamModel.findOne({name: paramNames.GLOBAL_PARAMS_NAME}).exec();
        await mongoDb.close();
        let counter = 0;
        
        let nginxConfig = fs.readFileSync(NGINX_CONFIG_FILE_PATH).toString('utf8');
        
        if (! /seocromom_cache:/m.test(nginxConfig)) {
            nginxConfig = nginxConfig.replace(/http\s{/, "http {\nproxy_cache_path /var/www/cache keys_zone=seocromom_cache:32m; #By Seocromom");
            fs.writeFileSync(NGINX_CONFIG_FILE_PATH, nginxConfig);
        }

        if (seocConfig.domain !== 'seo.localhost.cm' &&
            ! fs.existsSync(adminVirtualHostConfigFilePath)) {
            console.log("Integrating seocromom subdomain to nginx... \n");
            const newConfigStr = configStr.replace(/GENERIC-SUB-DOMAIN/mg, seocConfig.domain);
            await utils.writeFile(adminVirtualHostConfigFilePath, newConfigStr).then(function (result) {
                counter++;
            });
        } else if (seocConfig.domain === 'seoc.localhost.cm') {
            console.log(`Please don't forget to replace 'seo.localhost.cm' in 'seo-cromom-proxy/routes/sec/config.js'`);
            console.log(`\n`);
        }


        const globalParams = (typeof modelFound === 'object' && modelFound !== null) ? modelFound.value : null;
        if (globalParams !== null) {
            const allDomains = [globalParams.spyfuDomain, globalParams.yourtextDomain,
                globalParams.onehourindexingDomain, globalParams.semrushDomain,
                globalParams.sistrixDomain, globalParams.majesticDomain,
                globalParams.babbarDomain, globalParams.spinrewriterDomain,
                globalParams.smodinDomain, globalParams.iconscoutDomain,
                globalParams.espinnerDomain, globalParams.seolyzeDomain,
                globalParams.dinorankDomain, globalParams.wordheroDomain,
                globalParams.lowfruitsDomain, globalParams.answerthepublicDomain,
                globalParams.pbnpremiumDomain, globalParams.closerscopyDomain,
                globalParams.domcopDomain, globalParams.neilpatelDomain,
                globalParams.envatoDomain, globalParams.freepikDomain,
                globalParams.rytrDomain, globalParams.keysearchDomain,
                globalParams.paraphraserDomain, globalParams.bigspyDomain,
                globalParams.quetextDomain, globalParams.ranktrackerDomain,
                globalParams.ahrefsDomain, globalParams.spamzillaDomain,
                globalParams.seomonitorDomain, globalParams.colinkriDomain,
                globalParams.keywordspeopleuseDomain,globalParams.serpstatDomain,
                globalParams.haloscanDomain, globalParams.copyfyDomain,
                globalParams.languagetoolDomain, globalParams.xoviDomain,
                globalParams.seoptimerDomain];

            for (let i = 0; i < allDomains.length; i++) {
                const newVirtualHostConfigFilePath = `${NGINX_VIRTUAL_HOSTS_FOLDER}/${allDomains[i]}.conf`;
                if (!/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]/.test(allDomains[i])) {
                    if (fs.existsSync(newVirtualHostConfigFilePath)) {
                        console.log(`Removing ${allDomains[i]} from nginx...`);
                        fs.unlinkSync(newVirtualHostConfigFilePath);
                    }
                    continue;
                }

                if (! fs.existsSync(newVirtualHostConfigFilePath)) {
                    console.log(`Integrating ${allDomains[i]} to nginx...`);
                    const newConfigStr = configStr.replace(/GENERIC-SUB-DOMAIN/mg, allDomains[i]);
                    await utils.writeFile(newVirtualHostConfigFilePath, newConfigStr).then(function (result) {
                        counter++;
                    });
                }
            }
        }

        if (counter > 0) {
            console.log(`Integration completed. ${counter} new domain(s) were integrated to nginx. \n`);
        } else {
            console.log(`No new domain was integrated to nginx. \n`);
        }
    } catch (e) {
        await utils.writeToLog(e);
        console.log("An error occurred while integrating sub domains to nginx. Check the log file for more.")
    }
})();