"use strict";

const mongoose = require('mongoose');
const { Schema } = mongoose;
const AppCookiesListSchema = new Schema({
    name: String,
    cookies: Object,
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


module.exports = mongoose.model('AppCookiesList', AppCookiesListSchema);