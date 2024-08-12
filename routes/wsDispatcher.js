const utils = require('./api/Utils');
const mongoDb = require("./api/db/Db").create();
const ParamModel = require("./api/db/models/ParamModel");
const paramNames = require("./api/ParamNames");
const servicesDetails = require('./api/ServicesDetails');
const seocConfig = require('./sites/sec/config');
const dispatcherUtils = require('./dispatcherUtils');




module.exports = async function (connection, request) {
    try {
        const currentDomain = request.headers['host'];

        let globalParams = false;
        request.seocromom = {
            globalParams : globalParams,
            currentDomain : currentDomain,
            adminDomain : seocConfig.domain,
        };

        const result = await mongoDb.connect();
        const modelFound = await ParamModel.findOne({name: paramNames.GLOBAL_PARAMS_NAME}).exec();
        globalParams = (typeof modelFound === 'object' && modelFound !== null) ? modelFound.value : null;
        request.seocromom['globalParams'] = globalParams;

        const pickedHandler = dispatcherUtils.pickHandler(currentDomain, globalParams);

        if (! pickedHandler || ! pickedHandler.wsHandler) {
            connection.write('Host not found');
            connection.destroy(true);
            return;
        }

        const sessionDetails = await dispatcherUtils.getUserSessionDetails(request);

        if (typeof sessionDetails === 'object') {
            request.seocromom['currentUser'] = sessionDetails.user;
            request.seocromom['siteId'] = sessionDetails.siteId;
            request.seocromom['cookieName'] = sessionDetails.cookieName;
            request.seocromom['cookieValue'] = sessionDetails.cookieValue;
        } else {
            connection.write('Not allowed');
            connection.destroy(true);
            return;
        }

        await pickedHandler.wsHandler(connection, request);
    } catch (e) {
        await utils.writeToLog(e);
        connection.write('Internal error');
        connection.destroy(true);
    }
};