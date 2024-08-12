"use strict";

const mongoose = require('mongoose');
const { Schema } = mongoose;
const ParamSchema = new Schema({
    name: String,
    value: Object,
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


module.exports = mongoose.model('Param', ParamSchema);