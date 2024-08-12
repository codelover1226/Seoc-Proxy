"use strict";

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const utils = require("../Utils");


module.exports.create = function () {
    return new Db();
};


/**
 * This class represents the underlying MongoDb database used to store the app's data.
 * It assumes db credentials (username, password and dbName) are kept in the params/params.json file.
 * @class Db
 * @namespace app.db
 * @constructor
 * @since 1.0.0
 */
function Db() {
    this.username = 'seo_cromom_user';
    this.password = 'SOh3TbYhx8ypJPxmt1oOfLUjkoipuy88999978Gty';
    this.dbname = 'seo_cromom_db';
}

/**
 * Returns a Promise that is resolved to true or throws
 * an exception with a message corresponding to the underlying error message.
 * In reality a mongoose <a href="https://mongoosejs.com/docs/api/connection.html" target="_blank">Connection</a> is created
 * under the hood.
 * ###### Note: the database parameters (username, password, domain name, database name) are store in the ./params/params.json
 * @method connect
 * @return {Promise<Object>}
 * @since 1.0.0
 */
Db.prototype.connect = async function () {
     //const options = {useNewUrlParser: true, useUnifiedTopology: true, poolSize: 50};
    const options = {useNewUrlParser: true, useUnifiedTopology: true};
    const url = `mongodb://${this.username}:${this.password}@127.0.0.1:27017/${this.dbname}`;
    let db = undefined;

    await mongoose.connect(url, options).then(async function () {
        db = mongoose.connection;
    }).catch(function (error) {
        throw error;
    });

    this.db = db;

    return true;
};

Db.prototype.getConnection = async function () {
    if (typeof this.db !== "undefined" && typeof this.db === "object" && this.db.readyState === 1) {
        return this.db;
    }

    return null;
};

Db.prototype.isConnected = function () {
    return typeof this.db === 'object';
};

/**
 * Returns a promise that resolves to true in case the db was closed and false otherwise.
 * @method close
 * @return {Promise<boolean>}
 */
Db.prototype.close = function () {
    const thisDb = this;
    let failed = false;
    if (typeof this.db !== "undefined" && typeof this.db === "object" && this.db.readyState === 1) {
        this.db.close()
            .then(function () {
                thisDb.db = undefined;
            }).catch(function (error) {
                failed = true;
                utils.writeToLog(error);
            });
    }

    return failed === false;
};