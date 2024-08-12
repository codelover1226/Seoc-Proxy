"use strict";

const mongoose = require('mongoose');
const moment = require('moment');
const { Schema } = mongoose;


const DinorankKeywordSchema = new Schema({
    userId: Number,
    siteId: String,
    phase: String,
    time: {
        type: Date,
        default: Date.now,
        required: true,
    },
});

const DinorankKeyword = mongoose.model('DinorankKeyword', DinorankKeywordSchema);

const keywordsCounter = async function (userId, siteId){
    const startTime = moment().startOf('d').utc();
    const endTime = moment().endOf('d').utc();

    return aDinorankKeyword.count({
        userId: userId,
        siteId: siteId,
        time: {
            $gte: startTime,
            $lte: endTime
        },
    });
};


module.exports = {DinorankKeyword, keywordsCounter};