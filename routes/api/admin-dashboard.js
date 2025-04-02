// routes/admin.js
const express = require('express');
const router = express.Router();
const Car = require('../models/Car');
const Booking = require('../models/Booking');
const User = require('../models/User');

// Admin Dashboard Stats
router.get('/dashboard/stats', async (req, res) => {
  try {
    const totalVehicles = await Car.countDocuments();
    const activeBookings = await Booking.countDocuments({ status: 'confirmed' });
    const registeredUsers = await User.countDocuments({ role: 'user' });
    
    // Calculate today's revenue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayBookings = await Booking.find({ 
      status: 'confirmed',
      createdAt: { $gte: today }
    });
    const todaysRevenue = todayBookings.reduce((sum, booking) => sum + booking.totalAmount, 0);

    res.json({
      totalVehicles,
      activeBookings,
      registeredUsers,
      todaysRevenue
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Recent Bookings
router.get('/dashboard/recent-bookings', async (req, res) => {
  try {
    const bookings = await Booking.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name email')
      .populate('car', 'make model');

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Recent Vehicles
router.get('/dashboard/recent-cars', async (req, res) => {
  try {
    const cars = await Car.find()
      .sort({ createdAt: -1 })
      .limit(5);

    res.json(cars);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Activity Log
router.get('/dashboard/activities', async (req, res) => {
  try {
    // Combine activities from different models
    const recentBookings = await Booking.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('user', 'name');

    const recentCars = await Car.find()
      .sort({ createdAt: -1 })
      .limit(2);

    const recentUsers = await User.find({ role: 'user' })
      .sort({ createdAt: -1 })
      .limit(2);

    const activities = [
      ...recentBookings.map(booking => ({
        type: 'booking',
        message: `New booking #${booking.bookingId} for ${booking.car.make} ${booking.car.model}`,
        createdAt: booking.createdAt,
        user: booking.user.name
      })),
      ...recentCars.map(car => ({
        type: 'car',
        message: `New vehicle added - ${car.make} ${car.model}`,
        createdAt: car.createdAt
      })),
      ...recentUsers.map(user => ({
        type: 'user',
        message: `New user registered - ${user.name}`,
        createdAt: user.createdAt
      }))
    ].sort((a, b) => b.createdAt - a.createdAt)
     .slice(0, 5);

    res.json(activities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;