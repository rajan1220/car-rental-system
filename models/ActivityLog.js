// models/ActivityLog.js
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['booking', 'car', 'user', 'system', 'payment'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    default: 'fa-info-circle'
  },
  date: {
    type: Date,
    default: Date.now
  },
  relatedId: mongoose.Schema.Types.ObjectId
});

module.exports = mongoose.model('ActivityLog', activityLogSchema);