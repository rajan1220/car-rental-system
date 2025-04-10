const express = require('express');
const router = express.Router();
const Car = require('../models/Car');
const Booking = require('../models/Booking');
const { ensureAuthenticated } = require('../config/auth');
const moment = require('moment');

// Helper functions
const validateDates = (pickupDate, returnDate) => {
  const today = moment().startOf('day');
  const pickup = moment(pickupDate);
  const returnMoment = moment(returnDate);

  if (!pickup.isValid() || !returnMoment.isValid()) {
    return { valid: false, message: 'Invalid date format' };
  }

  if (pickup.isBefore(today)) {
    return { valid: false, message: 'Pickup date cannot be in the past' };
  }

  if (returnMoment.isBefore(pickup)) {
    return { valid: false, message: 'Return date must be after pickup date' };
  }

  if (pickup.diff(today, 'days') > 90) {
    return { valid: false, message: 'Pickup date cannot be more than 3 months in advance' };
  }

  return { valid: true };
};

const checkCarAvailability = async (carId, pickupDate, returnDate) => {
  const existingBookings = await Booking.find({
    car: carId,
    status: { $nin: ['cancelled', 'completed'] },
    $or: [
      { pickupDate: { $lte: new Date(returnDate) }, returnDate: { $gte: new Date(pickupDate) } },
      { pickupDate: { $gte: new Date(pickupDate), $lte: new Date(returnDate) } }
    ]
  });

  return existingBookings.length === 0;
};

// GET booking form
router.get('/new/:carId', ensureAuthenticated, async (req, res) => {
  try {
    const car = await Car.findById(req.params.carId);
    if (!car || !car.available) {
      req.flash('error_msg', 'This car is not available for booking');
      return res.redirect('/cars');
    }

    const defaultPickup = moment().add(1, 'days').format('YYYY-MM-DD');
    const defaultReturn = moment().add(3, 'days').format('YYYY-MM-DD');

    res.render('bookings/new', {
      car,
      defaultPickup,
      defaultReturn,
      title: `Book ${car.make} ${car.model}`,
      user: req.user
    });
  } catch (err) {
    console.error('Booking form error:', err);
    req.flash('error_msg', 'Server error');
    res.redirect('/cars');
  }
});

// POST create booking
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const { carId, pickupDate, returnDate } = req.body;
    const user = req.user;

    // Validate input
    if (!carId || !pickupDate || !returnDate) {
      req.flash('error_msg', 'Please fill all required fields');
      return res.redirect(`/bookings/new/${carId}`);
    }

    // Validate dates
    const dateValidation = validateDates(pickupDate, returnDate);
    if (!dateValidation.valid) {
      req.flash('error_msg', dateValidation.message);
      return res.redirect(`/bookings/new/${carId}`);
    }

    // Check car availability
    const car = await Car.findById(carId);
    if (!car || !car.available) {
      req.flash('error_msg', 'This car is not available for booking');
      return res.redirect('/cars');
    }

    const isAvailable = await checkCarAvailability(carId, pickupDate, returnDate);
    if (!isAvailable) {
      req.flash('error_msg', 'Car not available for selected dates');
      return res.redirect(`/cars/${carId}`);
    }

    // Calculate pricing
    const totalDays = moment(returnDate).diff(moment(pickupDate), 'days') + 1;
    const basePrice = car.dailyRate * totalDays;
    const taxes = Math.round(basePrice * 0.18); // 18% GST
    const insurance = req.body.insurance ? 500 * totalDays : 0;
    const gps = req.body.gps ? 300 * totalDays : 0;
    const childSeat = req.body.childSeat ? 200 * totalDays : 0;
    const totalPrice = basePrice + taxes + insurance + gps + childSeat;

    // Create booking
    const booking = new Booking({
      car: carId,
      user: user._id,
      pickupDate: new Date(pickupDate),
      returnDate: new Date(returnDate),
      totalDays,
      totalPrice,
      customerInfo: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone || req.body.phone,
        address: user.address || req.body.address
      },
      additionalOptions: {
        insurance: !!req.body.insurance,
        gps: !!req.body.gps,
        childSeat: !!req.body.childSeat
      },
      status: 'confirmed'
    });

    await booking.save();

    // Update car availability
    await Car.findByIdAndUpdate(carId, { available: false });

    req.flash('success_msg', 'Booking confirmed successfully!');
    res.redirect(`/bookings/${booking._id}/confirmation`);

  } catch (err) {
    console.error('Create booking error:', err);
    req.flash('error_msg', 'Failed to create booking');
    res.redirect('/cars');
  }
});

// GET booking confirmation
router.get('/:id/confirmation', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('car')
      .populate('user', 'firstName lastName email phone');

    if (!booking) {
      req.flash('error_msg', 'Booking not found');
      return res.redirect('/users/dashboard');
    }

    // Authorization check
    if (booking.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      req.flash('error_msg', 'Unauthorized access');
      return res.redirect('/users/dashboard');
    }

    res.render('bookings/confirmation', {
      booking,
      moment,
      title: 'Booking Confirmation',
      user: req.user
    });

  } catch (err) {
    console.error('Confirmation error:', err);
    req.flash('error_msg', 'Failed to load booking confirmation');
    res.redirect('/users/dashboard');
  }
});

// POST cancel booking
router.post('/:id/cancel', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      req.flash('error_msg', 'Booking not found');
      return res.redirect('/users/dashboard');
    }

    // Authorization check
    if (booking.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      req.flash('error_msg', 'Unauthorized access');
      return res.redirect('/users/dashboard');
    }

    // Check cancellation policy (24 hours before pickup)
    const hoursUntilPickup = moment(booking.pickupDate).diff(moment(), 'hours');
    if (hoursUntilPickup < 24) {
      req.flash('error_msg', 'Cancellation must be made at least 24 hours before pickup');
      return res.redirect(`/bookings/${booking._id}/confirmation`);
    }

    // Update booking status
    booking.status = 'cancelled';
    booking.cancellationReason = req.body.reason || 'Cancelled by customer';
    await booking.save();

    // Update car availability
    await Car.findByIdAndUpdate(booking.car, { available: true });

    req.flash('success_msg', 'Booking cancelled successfully');
    res.redirect('/users/dashboard');

  } catch (err) {
    console.error('Cancellation error:', err);
    req.flash('error_msg', 'Failed to cancel booking');
    res.redirect('/users/dashboard');
  }
});
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const { carId, pickupDate, returnDate, pickupLocation, dropLocation } = req.body;

    // Basic validation
    if (!pickupLocation || !dropLocation) {
      req.flash('error_msg', 'Please provide both pickup and drop locations');
      return res.redirect(`/cars/${carId}`);
    }

    // Get the car
    const car = await Car.findById(carId);
    if (!car) {
      req.flash('error_msg', 'Car not found');
      return res.redirect('/cars');
    }

    // Calculate total price (example calculation)
    const diffTime = Math.abs(new Date(returnDate) - new Date(pickupDate));
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const totalPrice = totalDays * car.dailyRate;

    // Create new booking
    const booking = new Booking({
      car: carId,
      user: req.user._id,
      pickupDate,
      returnDate,
      pickupLocation,
      dropLocation,
      totalDays,
      totalPrice,
      status: 'pending'
    });

    await booking.save();

    // Update car availability
    car.available = false;
    await car.save();

    req.flash('success_msg', 'Booking created successfully!');
    res.redirect(`/bookings/${booking._id}`);
  } catch (err) {
    console.error('Booking error:', err);
    
    // Handle validation errors specifically
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      req.flash('error_msg', messages.join(', '));
      return res.redirect(`/cars/${req.body.carId}`);
    }
    
    req.flash('error_msg', 'Error creating booking');
    res.redirect(`/cars/${req.body.carId}`);
  }
});
module.exports = router;