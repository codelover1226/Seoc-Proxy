"use strict";

const mongoose = require('mongoose');
const { Schema } = mongoose;


const SessionSchema = new Schema({
    token: String,
    ipAddress: String,
    userAgent: String,
    service: String,
    user: Object,
    siteId: String,
    userId: String,
    creationDate: Date,
    lastRequestDate: Date,
});


module.exports = mongoose.model('Session', SessionSchema);