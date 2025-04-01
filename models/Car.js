const mongoose = require('mongoose');

const CarSchema = new mongoose.Schema({
  make: {
    type: String,
    required: [true, 'Please enter car make']
  },
  model: {
    type: String,
    required: [true, 'Please enter car model']
  },
  type: {
    type: String,
    enum: ['Sedan', 'SUV', 'Truck', 'Van', 'Sports', 'Luxury'],
    required: [true, 'Please select car type']
  },
  dailyRate: {
    type: Number,
    required: [true, 'Please enter daily rate']
  },
  seats: {
    type: Number,
    required: [true, 'Please enter number of seats']
  },
  doors: {
    type: Number,
    required: [true, 'Please enter number of doors']
  },
  transmission: {
    type: String,
    enum: ['Automatic', 'Manual'],
    default: 'Automatic'
  },
  aircon: {
    type: Boolean,
    default: true
  },
  luggage: {
    type: Number,
    required: [true, 'Please enter luggage capacity']
  },
  available: {
    type: Boolean,
    default: true
  },
  image: {
    type: String,
    default: 'default-car.jpg'
  },
  features: [String],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Car', CarSchema);