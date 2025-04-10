const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const Booking = require('../models/Booking');
const Car = require('../models/Car');
const User = require('../models/User')

// User dashboard
router.get('/dashboard', ensureAuthenticated, async (req, res) => {
  try {
    // Get user stats
    const totalBookings = await Booking.countDocuments({ user: req.user._id });
    // console.log('totalBookings : ',totalBookings);
    const activeBookings = await Booking.countDocuments({ 
      user: req.user._id,
      status: 'confirmed'
    });
    // console.log('user ',req.user);
    // Get current bookings (confirmed status)
    const bookings = await Booking.find({ 
      user: req.user._id,
      status: 'confirmed'
    }).populate('car');

    // Get favorite cars
    const favorites = await Car.find({ 
      _id: { $in: req.user.favorites || [] } 
    });

    // Get booking history (completed or cancelled)
    const history = await Booking.find({
      user: req.user._id,
      status: { $in: ['completed', 'cancelled'] }
    }).populate('car');

    res.render('user/dashboard', {
      title: 'Dashboard',
      user: req.user,
      userStats: {
        totalBookings,
        activeBookings
      },
      bookings,
      favorites,
      history
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    req.flash('error_msg', 'Could not load dashboard');
    res.redirect('/');
  }
});

router.put('/profile/:id', async (req, res) => {
  const userId = req.params.id;
  const { name, email, mobile, address } = req.body;
  console.log('req accepted');  
  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, email, mobile, address },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.render('user/profile',{
      title:'My Profile',
      user:updatedUser
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// User profile
router.get('/profile', ensureAuthenticated, (req, res) => {
  res.render('user/profile', {
    title: 'My Profile',
    user: req.user
  });
});

module.exports = router;