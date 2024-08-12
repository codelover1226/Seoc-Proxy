"use strict";

const mongoose = require('mongoose');
const schema = require('../schemas/SemrushLimitsSchema');


module.exports = mongoose.model('SemrushLimits', schema);