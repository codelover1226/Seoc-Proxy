"use strict";

const mongoose = require('mongoose');
const moment = require('moment');
const { Schema } = mongoose;


const MajestickBacklinkSchema = new Schema({
    userId: Number,
    siteId: String,
    total: Number,
    time: {
        type: Date,
        default: Date.now,
        required: true,
    },
});

const MajestickBacklinkModel = mongoose.model('MajestickBacklink', MajestickBacklinkSchema);

const countBacklinks = async function (userId, siteId){
    const startTime = moment().startOf('d').utc();
    const endTime = moment().endOf('d').utc();
    let total = 0;
    const backLinkModel = await MajestickBacklinkModel.findOne({
        userId: userId,
        siteId: siteId,
        time: {
            $gte: startTime,
            $lte: endTime
        }
    });

    if (backLinkModel)
        total = backLinkModel.total;

    return total;
};

const addToCurrentTotal = async function (userId, siteId, nbOfBacklinks){
    if (/[^0-9]/.test(nbOfBacklinks + '') || typeof nbOfBacklinks !== 'number')
        return false;
    const startTime = moment().startOf('d').utc();
    const endTime = moment().endOf('d').utc();
    let total = nbOfBacklinks;
    let exits = false;

    const backLinkModel = await MajestickBacklinkModel.findOne({
        userId: userId,
        siteId: siteId,
        time: {
            $gte: startTime,
            $lte: endTime
        }
    });

    if (backLinkModel) {
        total += backLinkModel.total;
        exits = true;
    }

    if (exits) {
        await MajestickBacklinkModel.updateOne({
            userId: userId,
            siteId: siteId,
            time: {
                $gte: startTime,
                $lte: endTime
            }
        }, {total: total});
    } else {
        await MajestickBacklinkModel.create({
            userId: userId,
            siteId: siteId,
            total: total
        });
    }

    return true;
};


module.exports = {MajestickBacklinkModel: MajestickBacklinkModel, addToCurrentTotal: addToCurrentTotal, countBacklinks: countBacklinks};