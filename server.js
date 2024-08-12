const pug = require('pug');
const multer = require('fastify-multer');
const utils = require('./routes/api/Utils');
const fastify = require('fastify')({ logger: true });
const multerUpload = multer();


//fastify.register(require('@fastify/formbody'));

fastify.register(require('@fastify/cookie'));

fastify.register(multer.contentParser);

fastify.register(require('@fastify/websocket'), {
    options: {
        maxPayload: 1048576, // we set the maximum allowed messages size to 1 MiB (1024 bytes * 1024 bytes)
    }
});



fastify.register(require("@fastify/view"), {
    engine: {pug: pug},
    root: './templates'
});

fastify.addContentTypeParser('application/grpc-web-text', { parseAs: 'string'}, function (request, body, done) {
    done(null, body.toString());
});

fastify.addContentTypeParser('application/x-protobuffer', { parseAs: 'buffer'}, function (request, body, done) {
    done(null, body);
});

fastify.addContentTypeParser('text/plain', { parseAs: 'buffer'}, function (request, body, done) {
    done(null, body);
});

fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string'}, function (request, body, done) {
    done(null, body.toString());
});

fastify.addContentTypeParser('application/grpc-web+proto', { parseAs: 'buffer'}, function (request, body, done) {
    done(null, body);
});


fastify.register(async function () {
    // Declare a route
    fastify.get('/*', {
        preHandler: multerUpload.any(),
        handler: require('./routes/dispatcher'),
        //wsHandler: require('./routes/wsDispatcher')
    });
    fastify.post('/*', {
        preHandler: multerUpload.any(),
        handler: require('./routes/dispatcher'),
    });
    fastify.put('/*', {
        preHandler: multerUpload.any(),
        handler: require('./routes/dispatcher'),
    });
    fastify.delete('/*', {
        preHandler: multerUpload.any(),
        handler: require('./routes/dispatcher'),
    });
});



// Run the server!
(async function () {
    try {
        await fastify.listen({ port: 9500 });
    } catch (err) {
        await utils.writeToLog(err);
        fastify.log.error('Internal server error.');
        process.exit(1);
    }
})();