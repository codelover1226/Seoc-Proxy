const adminControllerCreator = require('./controllers/AdminController');
const sharedControllerCreator = require('./controllers/SharedController');
const adminUrls = require('../../api/AdminUrls');
const utils = require('../../api/Utils');
const seocConfig = require('./config');
const handlerHelpers = {};
const titlePrefix = "Seoc - ";

module.exports = async function (request, reply) {
    const adminController = adminControllerCreator.create(request, reply);
    const sharedController = sharedControllerCreator.create(request, reply);

    switch (request.url) {
        case '/' :
            await adminController.serveParamsPage();
            break;
        case adminUrls.CONNECTION_URL :
            if (request.method.toLowerCase() === 'post') {
                await sharedController.connect();
            }
            break;
        case adminUrls.TEMPORARY_ACCESS_URL :
            await adminController.serveFirstSetupPage();
            break;
        case adminUrls.DASHBOARD_URL :
            await adminController.serveParamsPage();
            break;
        case adminUrls.SAVE_FIRST_PARAMETERS_URL :
            if (request.method.toLowerCase() === 'post') {
                await adminController.saveParamsFirstTime();
            }

            break;
        case adminUrls.SAVE_PARAMETERS_URL :
            if (request.method.toLowerCase() === 'post') {
                await adminController.saveParams();
            }

            break;
        case adminUrls.WORDPRESS_SITES_URL :
            await adminController.serveWordpressSitesList();
            break;
        case adminUrls.ADD_WORDPRESS_SITE_URL :
            if (request.method.toLowerCase() === 'post') {
                await adminController.saveWordpressSite();
            } else {
                await adminController.serveAddWordpressSiteForm();
            }
            break;
        case adminUrls.LOGOUT_URL :
            await adminController.logout();
            break;
        default :

            if ((new RegExp(adminUrls.PHP_SCRIPTS_URL)).test(request.url)) {
                await adminController.servePhpScriptsPage(request.query.id, true);
            } else if ((new RegExp(adminUrls.DELETE_WORDPRESS_SITE_URL)).test(request.url)) {
                await adminController.deleteWordpressSite();
            } else if ((new RegExp(adminUrls.REDIRECT_TO_SUB_DOMAINS_URL)).test(request.url)) {
                return adminController.redirectTo();
            } else {
                reply.code(404);
                return reply.view("error.pug",
                    { title: "Not found", msg: "Oops! we could not find what you are looking for." });
            }

            break;
    }
};