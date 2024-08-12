"use strict";

const mongoose = require('mongoose');
const moment = require('moment');
const { Schema } = mongoose;


const PbnpremiumViewsSchema = new Schema({
    userId: Number,
    siteId: String,
    time: {
        type: Date,
        default: Date.now,
        required: true,
    },
});

const PbnpremiumViews = mongoose.model('PbnpremiumViews', PbnpremiumViewsSchema);

const viewsCounter = async function (userId, siteId){
    const startTime = moment().startOf('d').utc();
    const endTime = moment().endOf('d').utc();

    return PbnpremiumViews.count({
        userId: userId,
        siteId: siteId,
        time: {
            $gte: startTime,
            $lte: endTime
        },
    });
};


module.exports = {PbnpremiumViews, viewsCounter: viewsCounter};