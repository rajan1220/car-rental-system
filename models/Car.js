const mongoose = require('mongoose');
const path = require('path');

const carSchema = new mongoose.Schema({
  make: {
    type: String,
    required: [true, 'Make is required'],
    trim: true,
    maxlength: [50, 'Make cannot exceed 50 characters']
  },
  model: {
    type: String,
    required: [true, 'Model is required'],
    trim: true,
    maxlength: [50, 'Model cannot exceed 50 characters']
  },
  year: {
    type: Number,
    required: [true, 'Year is required'],
    min: [2000, 'Year must be 2000 or later'],
    max: [new Date().getFullYear() + 1, 'Year cannot be in the future']
  },
  type: {
    type: String,
    required: [true, 'Type is required'],
    enum: {
      values: ['Sedan', 'SUV', 'Truck', 'Van/Minivan', 'Coupe', 'Hatchback', 'Convertible', 'Wagon', 'Electric', 'Hybrid', 'Luxury', 'Sports'],
      message: 'Invalid vehicle type'
    }
  },
  seats: {
    type: Number,
    required: [true, 'Seats are required'],
    min: [1, 'Minimum 1 seat'],
    max: [15, 'Maximum 15 seats']
  },
  dailyRate: {
    type: Number,
    required: [true, 'Daily rate is required'],
    min: [0, 'Daily rate cannot be negative']
  },
  transmission: {
    type: String,
    required: [true, 'Transmission is required'],
    enum: {
      values: ['Automatic', 'Manual', 'CVT', 'Semi-Automatic', 'Dual-Clutch'],
      message: 'Invalid transmission type'
    }
  },
  fuelType: {
    type: String,
    required: [true, 'Fuel type is required'],
    enum: {
      values: ['Gasoline', 'Diesel', 'Hybrid', 'Electric', 'CNG', 'LPG'],
      message: 'Invalid fuel type'
    }
  },
  image: {
    type: String,
    default: 'default-car.jpg'
  },
  available: {
    type: Boolean,
    default: true
  },
  features: {
    type: [String],
    default: []
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator user reference is required']
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,  // Adds createdAt and updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for image URL
carSchema.virtual('imageUrl').get(function() {
  if (this.image && !this.image.includes('http')) {
    return `/uploads/cars/${this.image}`;
  }
  return this.image || '/uploads/cars/default-car.jpg';
});

// Virtual for full car name
carSchema.virtual('fullName').get(function() {
  return `${this.year} ${this.make} ${this.model}`;
});

// Middleware to update lastUpdatedBy before saving
carSchema.pre('save', function(next) {
  if (this.isModified()) {
    this.lastUpdatedBy = this._update?.lastUpdatedBy || this.constructor.lastUpdatedBy;
  }
  next();
});

// Static method to get available cars
carSchema.statics.getAvailableCars = function() {
  return this.find({ available: true }).sort({ dailyRate: 1 });
};

// Instance method to toggle availability
carSchema.methods.toggleAvailability = async function() {
  this.available = !this.available;
  return this.save();
};

module.exports = mongoose.model('Car', carSchema);