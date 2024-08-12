"use strict";

const mongoose = require('mongoose');
const moment = require('moment');
const { Schema } = mongoose;


const SemrushDomainSchema = new Schema({
    userId: Number,
    siteId: String,
    domain: String,
    time: {
        type: Date,
        default: Date.now,
        required: true,
    },
});

const SemrushDomain = mongoose.model('SemrushDomain', SemrushDomainSchema);

const domainsCounter = async function (userId, siteId){
    const startTime = moment().startOf('d').utc();
    const endTime = moment().endOf('d').utc();

    return SemrushDomain.count({
        userId: userId,
        siteId: siteId,
        time: {
            $gte: startTime,
            $lte: endTime
        },
    });
};


module.exports = {SemrushDomain, domainsCounter: domainsCounter};