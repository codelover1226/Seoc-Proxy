const ws = require('ws');
const utils = require('../../api/Utils');
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const servicesDetails = require("../../api/ServicesDetails");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");


const SERVICE_MAIN_DOMAIN = 'app.wordhero.co';
const SERVICE_ROOT_DOMAIN = 'wordhero.co';
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};

module.exports = async function (connectionToBrowser, request) {
    try {

        let targetedUrl = request.url;
        let targetedHost = SERVICE_MAIN_DOMAIN;
        let refererUrl = "";

        if (handlerHelpers.urlContainsOriginalHost(request.url)) {
            targetedUrl = handlerHelpers.removeOriginalHost(request.url);
            targetedUrl = handlerHelpers.removeVarFromUrl(targetedUrl, "_mcop-scope");
            targetedHost = handlerHelpers.extractOriginalHost(request.url);
            if (handlerHelpers.containsPortNumber(targetedHost)) {
                targetedHost = handlerHelpers.stripPortNumber(targetedHost);
            }
        } else {
            if (handlerHelpers.urlContainsOriginalHost(request.headers['referer'] + "")) {
                targetedHost = handlerHelpers.extractOriginalHost(request.headers['referer'] + "");
            }
        }

        const finalFullUrl = `wss://${targetedHost}${targetedUrl}`;

        const excludedHeaders = [
            'host','x-real-ip','x-forwarded-for','user-agent','accept-language','sec-websocket-extensions',
            'cookie', 'referer', 'accept-encoding', 'Sec-WebSocket-Version', 'Sec-WebSocket-Key'
        ];

        const someHeadersValue = {
            'origin': "https://" + SERVICE_MAIN_DOMAIN,
        };

        //const allowedRequestHeaders = handlerHelpers.filterRequestHeaders(request.headers, excludedHeaders, someHeadersValue);
        const allowedRequestHeaders = {};
        if (typeof request.headers['origin'] !== "undefined") {
            allowedRequestHeaders['origin'] = "https://" + SERVICE_MAIN_DOMAIN;
        }

       /*const  appCookiesModel = await AppCookiesListModel.findOne({name: servicesDetails.answerthepublic.name}).exec();
        if (appCookiesModel)
            cookiesManager.setOldCookies(appCookiesModel.cookies);*/

        /*const allCookies = cookiesManager.getAsString(SERVICE_MAIN_DOMAIN);
        if (allCookies.length > 0) {
            allowedRequestHeaders["cookie"] = allCookies;
        }*/


        allowedRequestHeaders["user-agent"] = utils.randomUserAgent(0);
        allowedRequestHeaders.perMessageDeflate = true;
        allowedRequestHeaders.protocolVersion = 13;


        await utils.writeToLog(finalFullUrl);
        await utils.writeToLog(JSON.stringify(allowedRequestHeaders));
        await utils.writeToLog(JSON.stringify(request.headers));
        //await utils.writeToLog('\n');

        const wordheroWebsocket = new ws.WebSocket(finalFullUrl, allowedRequestHeaders);
        wordheroWebsocket.on('open', async function open() {
            await utils.writeToLog(`websocket connection open... on ${finalFullUrl}`);
        });

        connectionToBrowser.socket.on('message', async function (data) {
            await internals.writeTolog(`Data received from browser} ${data} is binary: ${internals.isBinary(data)}\n`);
            wordheroWebsocket.send(data, {binary: internals.isBinary(data)})
        });

        wordheroWebsocket.on('message', async function (data) {
            try {
                if (connectionToBrowser.socket.readyState === ws.OPEN) {
                    await internals.writeTolog(`Data received from ${finalFullUrl} ${data}`);
                    connectionToBrowser.socket.send(data, {binary: internals.isBinary(data)});
                } else if (connectionToBrowser.socket.readyState === ws.CLOSING ||
                    connectionToBrowser.socket.readyState === ws.CLOSED) {
                    //connectionToBrowser.destroy();
                }
            } catch (e) {
                await utils.writeToLog(e);
            }
        });

        wordheroWebsocket.on('close', async function (data) {
            await internals.writeTolog(`websocket connection closed ${data}... on ${finalFullUrl}\n`);
            connectionToBrowser.destroy();
        });
    } catch (err) {
        await utils.writeToLog(err);
        connectionToBrowser.socket.send('Internal error');
        connectionToBrowser.destroy();
    }
};

internals.urlIsAllowed = function (url) {
    return /^\/cable/.test(url + '');
};

internals.writeTolog = async function (data) {
    await utils.writeToLog(data)
};

internals.isBinary = function (data) {
    return ! (typeof data === 'string' || typeof data.toString === 'function');
};