const querystring = require('querystring');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const utils = require('./api/Utils');
const adminUrls = require('./api/AdminUrls');
const handlerHelpers = require('./api/HandlerHelpers');
const servicesDetails = require('./api/ServicesDetails');
const seocHandler = require('./sites/sec/handler');
const seocConfig = require('./sites/sec/config');
const mongoDb = require("./api/db/Db").create();
const SessionModel = require("./api/db/models/SessionModel");
const ParamModel = require("./api/db/models/ParamModel");
const paramNames = require("./api/ParamNames");
const sharedControllerCreator = require('./sites/sec/controllers/SharedController');

const SW_LOADED_COOKIE_NAME = "MCOP-SWREADY-rWetvGHi";
const dispatcherUtils = require('./dispatcherUtils');

/**
 * This handler dispatches incoming requests to the appropriate handler based on the host header.
 * @param request
 * @param reply
 * @returns {Promise<module:fastify.FastifyReply | *>}
 */
module.exports = async function (request, reply) {
    try {
        if (request.headers['upgrade'] && request.headers['upgrade'] === 'websocket') {
            return reply.code(403).send('Not allowed');
        }
        const currentDomain = request.headers['host'];

        let globalParams = false;
        
        request.seocromom = {
            requestUrl : (request.url + '').replace('__mcopLocation', 'location'),
            globalParams : globalParams,
            currentDomain : currentDomain,
            serverOrigin : `https://${currentDomain}`,
            adminDomain : seocConfig.domain,
            MCOP_COMPONENTS_JS_FULL_PATH : __dirname + `${path.sep}api${path.sep}frontend-compos${path.sep}mcop-components-ab$012345.js`,
            MCOP_SERVICE_WORKER_JS_FULL_PATH : __dirname + `${path.sep}api${path.sep}frontend-compos${path.sep}mcop-sw-ab$012345.js`,
        };
        await utils.writeToLog(request.seocromom);

        //On non-static content, non-temporary endpoints:
        if (! (request.url === adminUrls.TEMPORARY_ACCESS_URL ||
            request.url === adminUrls.SAVE_FIRST_PARAMETERS_URL) ||
            ! utils.isStaticRes(request.url)) {
            //we load parameters from the MongoDb database
            const result = await mongoDb.connect();
            const modelFound = await ParamModel.findOne({name: paramNames.GLOBAL_PARAMS_NAME}).exec();
            globalParams = (typeof modelFound === 'object' && modelFound !== null) ? modelFound.value : null;
            request.seocromom['globalParams'] = globalParams;

            const sessionDetails = await dispatcherUtils.getUserSessionDetails(request);

            if (typeof sessionDetails === 'object') {
                request.seocromom['currentUser'] = sessionDetails.user;
                request.seocromom['siteId'] = sessionDetails.siteId;
                request.seocromom['cookieName'] = sessionDetails.cookieName;
                request.seocromom['cookieValue'] = sessionDetails.cookieValue;
            }

            if (/post|put|patch/i.test(request.method) && request.body) {
                if (/multipart\/form-data/i.test(request.headers['content-type'])) {
                    const parts = (request.headers['content-type'] + '').split(/boundary=/);
                    const boundary = parts[1];

                    const form = new FormData();
                    form.setBoundary(boundary);


                    const data = request.body;
                    for (let name in data) {
                        form.append(name, data[name]);
                    }

                    request.seocromom['requestBody'] = form.getBuffer().toString('utf8');
                } else if (/application\/json/i.test(request.headers['content-type'])) {
                    request.seocromom['requestBody'] = JSON.stringify(request.body);
                } else if (/application\/x-www-form-urlencoded/i.test(request.headers['content-type'])) {
                    //is seocromom admin domain
                    if (currentDomain === seocConfig.domain) {
                        request.seocromom['requestBody'] = request.body = querystring.parse(request.body);
                    } else {
                        request.seocromom['requestBody'] = request.body;
                        request.body = querystring.parse(request.body);
                    }
                } else {
                    request.seocromom['requestBody'] = request.body;
                }
            }
        }


        //is seocromom admin domain
        if (currentDomain === seocConfig.domain) {
            await seocHandler(request, reply);
        } else {
            if (globalParams === null) {
                await utils.writeToLog("Invalid global parameters..");
                await utils.writeToLog(`seocrom domain is : ${seocConfig.domain} and host header is ${currentDomain}`);
                reply.code(500);
                return reply.view("error.pug",
                    { title: "Internal error", msg: "Oops! Invalid parameters were loaded.",currentDomain: currentDomain });
            }

            if (request.url === adminUrls.CONNECTION_URL &&
                request.method.toLowerCase() === 'post') {
                const sharedController = sharedControllerCreator.create(request, reply);
                await sharedController.connect();
            } else {
                const pickedHandler = dispatcherUtils.pickHandler(currentDomain, globalParams);
                if (! pickedHandler) {
                    reply.code(404);
                    return reply.view("error.pug",
                        { title: "Host not found", msg: "Oops! No host matching your request was found.." });
                }

                if (request.cookies.length> 0 &&
                    typeof request.cookies[SW_LOADED_COOKIE_NAME] === 'undefined' &&
                    ! utils.isStaticRes(request.url)) {
                    reply.header('set-cookie', SW_LOADED_COOKIE_NAME + '=' + utils.randCode(30, 35) + ";");
                    return reply.view('sw-loader.pug', {cookieName: SW_LOADED_COOKIE_NAME});
                }

                if (handlerHelpers.isMcoProxyPart(request.url)) {
                    const jsCodeStream = await dispatcherUtils
                        .getMcopProxyJsFileContent(request.url, pickedHandler.jsFileType, true);
                    reply.header('content-type', 'application/javascript');
                    return reply.send(jsCodeStream);
                } else {
                    return await pickedHandler.handler(request, reply);
                }
            }
        }
    } catch (err) {
        await utils.writeToLog(err);
        //reply.code(500);
        return reply.code(500).view("error.pug",
            { title: "Internal error", msg: "Oops! we're sorry but an error occurred on the server. Please contact the administrator." });
    }
};