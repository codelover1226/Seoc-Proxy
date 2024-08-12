const ws = require('ws');
const utils = require('../../api/Utils');
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const servicesDetails = require("../../api/ServicesDetails");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");


const SERVICE_MAIN_DOMAIN = 'pbnpremium.com';
const SERVICE_ROOT_DOMAIN = 'pbnpremium.com';
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};

module.exports = async function (connection, request) {
    try {

        let targetedUrl = request.url;

        if (handlerHelpers.urlContainsOriginalHost(request.url)) {
            targetedUrl = handlerHelpers.removeOriginalHost(request.url);
        }

        const finalFullUrl = `wss://${SERVICE_MAIN_DOMAIN}${targetedUrl}`;

        const excludedHeaders = [
            'host','x-real-ip','x-forwarded-for','user-agent','accept-language','sec-websocket-extensions',
        ];

        const someHeadersValue = {
            'origin': "https://" + SERVICE_MAIN_DOMAIN,
        };

        const allowedRequestHeaders = handlerHelpers.filterRequestHeaders(request.headers, excludedHeaders, someHeadersValue);
        if (typeof request.headers['origin'] !== "undefined") {
            allowedRequestHeaders['origin'] = "https://" + SERVICE_MAIN_DOMAIN;
        }

       const  appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.answerthepublic.name}).exec();
        if (appCookiesModel)
            cookiesManager.setOldCookies(appCookiesModel.cookies);

        const allCookies = cookiesManager.getAsString(SERVICE_MAIN_DOMAIN);
        if (allCookies.length > 0) {
            allowedRequestHeaders["cookie"] = allCookies;
        }


        allowedRequestHeaders["user-agent"] = utils.randomUserAgent(0);
        allowedRequestHeaders.perMessageDeflate = true;
        allowedRequestHeaders.protocolVersion = 13;


        const ansThePubWebsocket = new ws.WebSocket(finalFullUrl, allowedRequestHeaders);
        ansThePubWebsocket.on('open', async function open() {
            //await utils.writeToLog("websocket connection open...");
        });

        ansThePubWebsocket.on('message', async function (data) {
            if (connection.socket.readyState === ws.OPEN) {
                connection.write(data);
            } else if (connection.socket.readyState === ws.CLOSING ||
                connection.socket.readyState === ws.CLOSED) {
                connection.destroy();
            }
        });

        ansThePubWebsocket.on('close', async function (data) {
            await utils.writeToLog(`websocket connection closed ${data}...`);
            connection.destroy(true);
        });
    } catch (err) {
        await utils.writeToLog(err);
        connection.write('Internal error');
        connection.destroy(true);
    }
};

internals.urlIsAllowed = function (url) {
    return /^\/cable/.test(url + '');
};