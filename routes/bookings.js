const express = require('express');
const router = express.Router();
const Car = require('../models/Car');
const Booking = require('../models/Booking');
const { ensureAuthenticated } = require('../config/auth');
const moment = require('moment');

// Helper function to validate dates
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

// GET booking form for a specific car
router.get('/new/:carId', ensureAuthenticated, async (req, res) => {
  try {
    const car = await Car.findById(req.params.carId);
    if (!car) {
      req.flash('error_msg', 'Car not found');
      return res.redirect('/cars');
    }

    // Set default dates (tomorrow for pickup, 2 days later for return)
    const defaultPickup = moment().add(1, 'days').format('YYYY-MM-DD');
    const defaultReturn = moment().add(3, 'days').format('YYYY-MM-DD');

    res.render('bookings/new', { 
      car,
      defaultPickup,
      defaultReturn,
      title: `Book ${car.make} ${car.model}`
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server Error');
    res.redirect('/cars');
  }
});

// POST create a new booking
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const { carId, pickupDate, returnDate } = req.body;
    
    // Validate dates
    const dateValidation = validateDates(pickupDate, returnDate);
    if (!dateValidation.valid) {
      req.flash('error_msg', dateValidation.message);
      return res.redirect(`/bookings/new/${carId}`);
    }

    const totalDays = moment(returnDate).diff(moment(pickupDate), 'days') + 1;
    
    const car = await Car.findById(carId);
    if (!car) {
      req.flash('error_msg', 'Car not found');
      return res.redirect('/cars');
    }

    // Check if car is available for the selected dates
    const conflictingBooking = await Booking.findOne({
      car: carId,
      $or: [
        { 
          pickupDate: { $lte: new Date(returnDate) },
          returnDate: { $gte: new Date(pickupDate) }
        },
        {
          status: { $ne: 'cancelled' }
        }
      ]
    });

    if (conflictingBooking) {
      req.flash('error_msg', 'This car is not available for the selected dates');
      return res.redirect(`/cars/${carId}`);
    }
    
    // Calculate total price
    const basePrice = car.dailyRate * totalDays;
    const taxes = 15 * totalDays;
    const insurance = req.body.insurance ? 15 * totalDays : 0;
    const gps = req.body.gps ? 10 * totalDays : 0;
    const childSeat = req.body.childSeat ? 7 * totalDays : 0;
    const totalPrice = basePrice + taxes + insurance + gps + childSeat;
    
    // Create new booking
    const booking = new Booking({
      car: carId,
      user: req.user._id,
      pickupDate: new Date(pickupDate),
      returnDate: new Date(returnDate),
      totalDays,
      totalPrice,
      customerInfo: {
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        phone: req.user.phone || req.body.phone,
        address: req.user.address || req.body.address
      },
      additionalOptions: {
        insurance: !!req.body.insurance,
        gps: !!req.body.gps,
        childSeat: !!req.body.childSeat
      },
      status: 'confirmed'
    });

    await booking.save();
    
    req.flash('success_msg', 'Booking confirmed successfully!');
    res.redirect(`/bookings/${booking._id}/confirmation`);
    
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server Error');
    res.redirect('/cars');
  }
});

// GET booking confirmation page
router.get('/:id/confirmation', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('car')
      .populate('user', 'firstName lastName email phone');
    
    if (!booking) {
      req.flash('error_msg', 'Booking not found');
      return res.redirect('/users/dashboard');
    }

    // Ensure the booking belongs to the logged-in user
    if (booking.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      req.flash('error_msg', 'Unauthorized access');
      return res.redirect('/users/dashboard');
    }
    
    res.render('bookings/confirmation', { 
      booking,
      moment, // Pass moment.js to view for date formatting
      title: 'Booking Confirmation'
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server Error');
    res.redirect('/users/dashboard');
  }
});

// GET cancel booking
router.get('/:id/cancel', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      req.flash('error_msg', 'Booking not found');
      return res.redirect('/users/dashboard');
    }

    // Check if user owns the booking or is admin
    if (booking.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      req.flash('error_msg', 'Unauthorized access');
      return res.redirect('/users/dashboard');
    }

    // Check if booking can be cancelled (more than 24 hours before pickup)
    const hoursUntilPickup = moment(booking.pickupDate).diff(moment(), 'hours');
    
    if (hoursUntilPickup < 24) {
      req.flash('error_msg', 'Bookings can only be cancelled at least 24 hours before pickup');
      return res.redirect(`/bookings/${booking._id}/confirmation`);
    }

    booking.status = 'cancelled';
    await booking.save();

    // Update car availability
    await Car.findByIdAndUpdate(booking.car, { available: true });

    req.flash('success_msg', 'Booking cancelled successfully');
    res.redirect('/users/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server Error');
    res.redirect('/users/dashboard');
  }
});

module.exports = router;