const fs = require('fs');
const ws = require('ws');
const utils = require('../../api/Utils');
const handlerHelpers = require("../../api/HandlerHelpers");
const cookiesManagerCreator = require("../../api/CookiesManager");
const servicesDetails = require("../../api/ServicesDetails");
const AppCookiesListModel = require("../../api/db/models/AppCookiesListModel");
const cookiesManager = cookiesManagerCreator.create({});
const internals = {};

const SESSION_FILE_FULL_PATH = `${__dirname}/shared-session-file.json`;

const MESSAGES = {
    SAVE_SESSION_INFOS: 'SAVE_SESSION_INFOS',
    GET_SESSION_INFOS: 'GET_SESSION_INFOS',
    ERROR: 'error',
};

module.exports = async function (connection, request) {
    try {

        if (typeof request.seocromom !== 'object' ||
            typeof request.seocromom.currentUser !== 'object') {
            utils.writeToLog("User not connected in webSocket");
            return connection.destroy();
        }

        let targetedUrl = request.url + "";

        if (targetedUrl.includes('mcop-rytr/w-worker')) {
            connection.socket.on('message', async function (message) {
                let resp = {};
                try {
                    await utils.sleep(1000);

                    if (message.type === MESSAGES.SAVE_SESSION_INFOS) {
                        if (request.seocromom.currentUser.role === 'admin') {
                            if (internals.sessionFileExists()) {
                                resp.type = MESSAGES.SAVE_SESSION_INFOS;
                                resp.details = {
                                    msg: "session already exists",
                                    saved: false,
                                    exists: true
                                };
                            } else {
                                await internals.saveSession(message.session);
                                resp.type = MESSAGES.SAVE_SESSION_INFOS;
                                resp.details = {
                                    msg: "session saved",
                                    saved: true,
                                    exists: false
                                };
                            }
                        } else {
                            resp.type = MESSAGES.ERROR;
                            resp.details = {msg: "Not allowed."};
                        }
                    } else if (message.type === MESSAGES.GET_SESSION_INFOS) {
                        if (internals.sessionFileExists()) {
                            resp.type = MESSAGES.GET_SESSION_INFOS;
                            resp.details = {
                                session: internals.getSessionDetails()
                            };
                        } else {
                            resp.type = MESSAGES.GET_SESSION_INFOS;
                            resp.details = {};
                        }
                    }

                    connection.socket.send(JSON.stringify(resp));
                } catch (e) {
                    await utils.writeToLog(e);
                    resp.msg = MESSAGES.ERROR;
                    resp.details = {msg: "An error occurred while extracting data."};
                    connection.socket.send(JSON.stringify(resp));
                }
            });
        } else {
            return connection.destroy();
        }
    } catch (err) {
        await utils.writeToLog(err);
        connection.write('Internal error');
        connection.destroy(true);
    }
};

internals.saveSession = async function(details) {
    return await utils.writeFile(SESSION_FILE_FULL_PATH, details);
};

internals.sessionFileExists = function() {
    return fs.existsSync(SESSION_FILE_FULL_PATH);
};

internals.deleteSessionFile = function() {
    return fs.unlinkSync(SESSION_FILE_FULL_PATH);
};

internals.getSessionDetails = function() {
    return fs.readFileSync(SESSION_FILE_FULL_PATH).toString();
};
