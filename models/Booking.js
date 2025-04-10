const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    unique: true,
    index: true
  },
  car: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Car',
    required: [true, 'Car reference is required'],
    validate: {
      validator: async function(value) {
        const car = await mongoose.model('Car').findById(value);
        return car !== null && car.available === true;
      },
      message: 'Car is not available or does not exist'
    }
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required']
  },
  pickupDate: {
    type: Date,
    required: [true, 'Pickup date is required'],
    validate: {
      validator: function(value) {
        return value >= new Date();
      },
      message: 'Pickup date must be in the future'
    }
  },
  returnDate: {
    type: Date,
    required: [true, 'Return date is required'],
    validate: {
      validator: function(value) {
        return value > this.pickupDate;
      },
      message: 'Return date must be after pickup date'
    }
  },
  // pickupLocation: {
  //   type: String,
  //   required: [true, 'Pickup location is required'],
  //   trim: true,
  //   maxlength: [100, 'Pickup location cannot exceed 100 characters']
  // },
  // dropLocation: {
  //   type: String,
  //   required: [true, 'Drop location is required'],
  //   trim: true,
  //   maxlength: [100, 'Drop location cannot exceed 100 characters']
  // },
  totalDays: {
    type: Number,
    min: [1, 'Minimum booking duration is 1 day'],
    default: 1
  },
  totalPrice: {
    type: Number,
    required: true,
    min: [0, 'Total price cannot be negative'],
    default: 0
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'confirmed', 'cancelled', 'completed'],
      message: 'Invalid booking status'
    },
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded', 'failed'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'netbanking'],
    default: 'card'
  },
  cancellationReason: {
    type: String,
    trim: true,
    maxlength: [200, 'Cancellation reason cannot exceed 200 characters']
  },
  additionalRequests: {
    type: String,
    trim: true,
    maxlength: [500, 'Additional requests cannot exceed 500 characters']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate unique booking ID before saving
bookingSchema.pre('save', async function(next) {
  if (!this.isNew || this.bookingId) return next();
  
  try {
    const timestamp = Date.now().toString().slice(-5);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.bookingId = `BOOK${timestamp}${random}`;
    
    // Calculate total days if not set
    if (this.pickupDate && this.returnDate) {
      const diffTime = Math.abs(this.returnDate - this.pickupDate);
      this.totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    }
    
    next();
  } catch (err) {
    next(err);
  }
});

// Update car availability when booking is confirmed/completed/cancelled
bookingSchema.post('save', async function(doc, next) {
  try {
    if (['confirmed', 'completed', 'cancelled'].includes(doc.status)) {
      await mongoose.model('Car').findByIdAndUpdate(
        doc.car,
        { available: doc.status !== 'confirmed' },
        { new: true }
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Virtual for formatted booking dates
bookingSchema.virtual('formattedDates').get(function() {
  return {
    pickup: this.pickupDate.toLocaleDateString('en-IN'),
    return: this.returnDate.toLocaleDateString('en-IN')
  };
});

// Static method to check availability
bookingSchema.statics.checkAvailability = async function(carId, pickupDate, returnDate) {
  const overlappingBookings = await this.find({
    car: carId,
    status: { $in: ['confirmed', 'pending'] },
    $or: [
      { pickupDate: { $lte: returnDate }, returnDate: { $gte: pickupDate } },
      { pickupDate: { $gte: pickupDate, $lte: returnDate } }
    ]
  });
  
  return overlappingBookings.length === 0;
};

// Query helper for active bookings
bookingSchema.query.active = function() {
  return this.where({ status: { $in: ['pending', 'confirmed'] } });
};

// Instance method for cancellation
bookingSchema.methods.cancelBooking = async function(reason) {
  this.status = 'cancelled';
  this.cancellationReason = reason;
  return this.save();
};

module.exports = mongoose.model('Booking', bookingSchema);