"use strict";

const mongoose = require('mongoose');
const moment = require('moment');
const { Schema } = mongoose;


const LowfruitsCreditModel = new Schema({
    userId: Number,
    siteId: String,
    time: {
        type: Date,
        default: Date.now,
        required: true,
    },
});

const LowfruitsCredit = mongoose.model('LowfruitsCredit', LowfruitsCreditModel);

const creditCounter = async function (userId, siteId){
    const startTime = moment().startOf('d').utc();
    const endTime = moment().endOf('d').utc();

    return LowfruitsCredit.count({
        userId: userId,
        siteId: siteId,
        time: {
            $gte: startTime,
            $lte: endTime
        },
    });
};


module.exports = {LowfruitsCredit, creditCounter};