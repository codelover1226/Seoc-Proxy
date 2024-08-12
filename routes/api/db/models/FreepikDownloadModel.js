"use strict";

const mongoose = require('mongoose');
const moment = require('moment');
const { Schema } = mongoose;


const FreepikDownloadModel = new Schema({
    userId: Number,
    siteId: String,
    url: String,
    time: {
        type: Date,
        default: Date.now,
        required: true,
    },
});

const FreepikDownload = mongoose.model('FreepikDownload', FreepikDownloadModel);

const downloadsCounter = async function (userId, siteId){
    const startTime = moment().startOf('d').utc();
    const endTime = moment().endOf('d').utc();

    return FreepikDownload.count({
        userId: userId,
        siteId: siteId,
        time: {
            $gte: startTime,
            $lte: endTime
        },
    });
};


module.exports = {FreepikDownload, downloadsCounter};