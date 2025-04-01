const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { check, validationResult } = require('express-validator');
const Booking = require('../../models/Booking');
const Car = require('../../models/Car');

// @route   GET api/bookings
// @desc    Get all bookings (admin) or user's bookings
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    let bookings;
    if (req.user.role === 'admin') {
      bookings = await Booking.find().populate('user', ['name', 'email']).populate('car');
    } else {
      bookings = await Booking.find({ user: req.user.id }).populate('car');
    }
    res.json(bookings);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/bookings
// @desc    Create a booking
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('car', 'Car is required').not().isEmpty(),
      check('startDate', 'Start date is required').not().isEmpty(),
      check('endDate', 'End date is required').not().isEmpty()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { car, startDate, endDate } = req.body;

    try {
      // Check if car exists and is available
      const carToBook = await Car.findById(car);
      if (!carToBook) {
        return res.status(404).json({ msg: 'Car not found' });
      }
      if (!carToBook.available) {
        return res.status(400).json({ msg: 'Car is not available for booking' });
      }

      // Check for overlapping bookings
      const existingBookings = await Booking.find({
        car,
        $or: [
          { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } },
          { startDate: { $gte: new Date(startDate) }, endDate: { $lte: new Date(endDate) } }
        ]
      });

      if (existingBookings.length > 0) {
        return res.status(400).json({ msg: 'Car is already booked for the selected dates' });
      }

      // Calculate total price
      const days = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
      const totalPrice = days * carToBook.dailyRate;

      const newBooking = new Booking({
        user: req.user.id,
        car,
        startDate,
        endDate,
        totalPrice,
        status: 'confirmed'
      });

      const booking = await newBooking.save();
      res.json(booking);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Car not found' });
      }
      res.status(500).send('Server Error');
    }
  }
);

// @route   PUT api/bookings/:id/cancel
// @desc    Cancel a booking
// @access  Private
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('car');
    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    // Check user owns booking or is admin
    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    // Check booking isn't already cancelled or completed
    if (booking.status === 'cancelled') {
      return res.status(400).json({ msg: 'Booking is already cancelled' });
    }
    if (booking.status === 'completed') {
      return res.status(400).json({ msg: 'Completed bookings cannot be cancelled' });
    }

    booking.status = 'cancelled';
    await booking.save();

    res.json(booking);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Booking not found' });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router;