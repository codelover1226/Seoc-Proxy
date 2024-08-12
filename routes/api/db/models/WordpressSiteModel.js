"use strict";

const mongoose = require('mongoose');
const { Schema } = mongoose;


const  WordpressSiteSchema = new Schema({
    rootUrl : String,
    appSecretKey : String,
    restMeApiPath : String,
    membershipProApiPath : String,
    membershipProApiKey : String,
    creationDate: {
        type: Date,
        default: Date.now,
        required: true,
    },
    changeDate: {
        type: Date,
        default: Date.now,
        required: true,
    },
});



module.exports = mongoose.model('WordpressSite', WordpressSiteSchema);