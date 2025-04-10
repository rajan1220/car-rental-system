const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const Car = require('../models/Car');
const Booking = require('../models/Booking');
const User = require('../models/User');
const moment = require('moment');

// Admin Home Route
router.get('/', ensureAuthenticated, ensureAdmin, (req, res) => {
  res.redirect('/admin/dashboard');
});

// Admin Dashboard
router.get('/dashboard', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const [totalVehicles, activeBookings, registeredUsers] = await Promise.all([
      Car.countDocuments(),
      Booking.countDocuments({ status: { $in: ['confirmed', 'in-progress'] } }),
      User.countDocuments()
    ]);

    const today = moment().startOf('day');
    const todaysBookings = await Booking.find({
      createdAt: { $gte: today.toDate() },
      status: 'completed'
    }).lean();

    const todaysRevenue = todaysBookings.reduce((total, booking) => total + (booking.totalAmount || 0), 0);

    const [recentBookings, recentVehicles] = await Promise.all([
      Booking.find().sort({ createdAt: -1 }).limit(5).populate('user car'),
      Car.find().sort({ createdAt: -1 }).limit(5)
    ]);

    res.render('admin/dashboard', {
      title: 'Dashboard',
      user: req.user,
      moment,
      dashboardStats: { totalVehicles, activeBookings, registeredUsers, todaysRevenue },
      recentBookings,
      recentVehicles,
      activePage: 'dashboard'
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    req.flash('error_msg', 'Server Error');
    res.redirect('/admin');
  }
});

// Vehicle Management Routes
router.get('/vehicles', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const vehicles = await Car.find().sort({ createdAt: -1 });
    res.render('admin/vehicles', {
      title: 'Vehicle Management',
      user: req.user,
      vehicles,
      activePage: 'vehicles'
    });
  } catch (err) {
    console.error('Vehicles error:', err);
    req.flash('error_msg', 'Error loading vehicles');
    res.redirect('/admin/dashboard');
  }
});

// Add Vehicle - GET (show form)
router.get('/vehicles/add', ensureAuthenticated, ensureAdmin, (req, res) => {
  res.render('admin/add-vehicle', {
    title: 'Add Vehicle',
    user: req.user,
    activePage: 'vehicles'
  });
});

// Add Vehicle - POST (process form)
router.post('/vehicles', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const { make, model, year, type, dailyRate, seats, transmission, fuelType } = req.body;
    
    const newCar = new Car({
      make,
      model,
      year: parseInt(year),
      type,
      dailyRate: parseFloat(dailyRate),
      seats: parseInt(seats),
      transmission,
      fuelType,
      available: true
    });

    await newCar.save();
    req.flash('success_msg', 'Vehicle added successfully');
    res.redirect('/admin/vehicles');
  } catch (err) {
    console.error('Add vehicle error:', err);
    req.flash('error_msg', err.message.includes('validation failed') ? 
      'Please fill all required fields correctly' : 'Error adding vehicle');
    res.redirect('/admin/vehicles/add');
  }
});

// Edit Vehicle - GET (show form)
router.get('/vehicles/edit/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const vehicle = await Car.findById(req.params.id);
    if (!vehicle) {
      req.flash('error_msg', 'Vehicle not found');
      return res.redirect('/admin/vehicles');
    }
    
    res.render('admin/edit-vehicle', {
      title: 'Edit Vehicle',
      user: req.user,
      vehicle,
      activePage: 'vehicles'
    });
  } catch (err) {
    console.error('Edit vehicle error:', err);
    req.flash('error_msg', 'Error loading vehicle');
    res.redirect('/admin/vehicles');
  }
});

// Edit Vehicle - PUT (process form)
router.put('/vehicles/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const { make, model, year, type, dailyRate, seats, transmission, fuelType, available } = req.body;
    
    await Car.findByIdAndUpdate(req.params.id, {
      make,
      model,
      year: parseInt(year),
      type,
      dailyRate: parseFloat(dailyRate),
      seats: parseInt(seats),
      transmission,
      fuelType,
      available: available === 'on'
    }, { runValidators: true });

    req.flash('success_msg', 'Vehicle updated successfully');
    res.redirect('/admin/vehicles');
  } catch (err) {
    console.error('Update vehicle error:', err);
    req.flash('error_msg', err.message.includes('validation failed') ? 
      'Please fill all required fields correctly' : 'Error updating vehicle');
    res.redirect(`/admin/vehicles/edit/${req.params.id}`);
  }
});

// Delete Vehicle
router.delete('/vehicles/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    // Check if vehicle has active bookings
    const activeBooking = await Booking.findOne({ 
      car: req.params.id,
      status: { $in: ['confirmed', 'in-progress'] }
    });

    if (activeBooking) {
      req.flash('error_msg', 'Cannot delete vehicle with active bookings');
      return res.redirect('/admin/vehicles');
    }

    await Car.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Vehicle deleted successfully');
    res.redirect('/admin/vehicles');
  } catch (err) {
    console.error('Delete vehicle error:', err);
    req.flash('error_msg', 'Error deleting vehicle');
    res.redirect('/admin/vehicles');
  }
});

// Booking Management Routes
router.get('/bookings', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query based on filters
    const query = {};
    
    // Status filter
    const statusFilter = req.query.status || '';
    if (statusFilter) {
      query.status = statusFilter;
    }
    
    // Payment status filter
    const paymentStatusFilter = req.query.paymentStatus || '';
    if (paymentStatusFilter) {
      query.paymentStatus = paymentStatusFilter;
    }
    
    // Date range filter
    const startDateFilter = req.query.startDate || '';
    const endDateFilter = req.query.endDate || '';
    if (startDateFilter && endDateFilter) {
      query.startDate = {
        $gte: new Date(startDateFilter),
        $lte: new Date(endDateFilter)
      };
    }
    
    // Text search filters
    const customerFilter = req.query.customer || '';
    if (customerFilter) {
      query['user.name'] = { $regex: customerFilter, $options: 'i' };
    }
    
    const vehicleFilter = req.query.vehicle || '';
    if (vehicleFilter) {
      query['$or'] = [
        { 'car.make': { $regex: vehicleFilter, $options: 'i' } },
        { 'car.model': { $regex: vehicleFilter, $options: 'i' } }
      ];
    }
    
    const bookingIdFilter = req.query.bookingId || '';
    if (bookingIdFilter) {
      query._id = bookingIdFilter;
    }

    // Get counts for status tabs
    const statusCounts = {
      all: await Booking.countDocuments(),
      confirmed: await Booking.countDocuments({ status: 'confirmed' }),
      pending: await Booking.countDocuments({ status: 'pending' }),
      cancelled: await Booking.countDocuments({ status: 'cancelled' }),
      completed: await Booking.countDocuments({ status: 'completed' })
    };

    // Get paginated results
    const totalBookings = await Booking.countDocuments(query);
    const totalPages = Math.ceil(totalBookings / limit);
    
    const bookings = await Booking.find(query)
      .skip(skip)
      .limit(limit)
      .populate('user car')
      .sort({ createdAt: -1 });

    res.render('admin/bookings', {
      title: 'Booking Management',
      user: req.user,
      moment,
      bookings,
      currentPage: page,
      totalPages,
      limit,
      totalBookings,
      statusFilter,
      paymentStatusFilter,
      startDateFilter,
      endDateFilter,
      customerFilter,
      vehicleFilter,
      bookingIdFilter,
      statusCounts,
      hasFilters: !!Object.keys(req.query).length,
      activePage: 'bookings'
    });
  } catch (err) {
    console.error('Bookings error:', err);
    req.flash('error_msg', 'Error loading bookings');
    res.redirect('/admin/dashboard');
  }
});

// View Single Booking Details
router.get('/bookings/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('car')
      .populate('user');

    if (!booking) {
      req.flash('error_msg', 'Booking not found');
      return res.redirect('/admin/bookings');
    }

    // Ensure totalPrice has a default value if undefined
    booking.totalPrice = booking.totalPrice || 0;

    res.render('admin/booking-details', {
      title: 'Booking Details',
      user: req.user,
      booking,
      moment,
      activePage: 'bookings'
    });
  } catch (err) {
    console.error('Booking details error:', err);
    req.flash('error_msg', 'Error loading booking details');
    res.redirect('/admin/bookings');
  }
});

// Update Booking Status (API endpoint)
router.put('/bookings/:id/status', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.id, 
      { status },
      { new: true }
    ).populate('car');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Update vehicle availability if booking is completed or cancelled
    if (status === 'completed' || status === 'cancelled') {
      await Car.findByIdAndUpdate(
        booking.car._id, 
        { available: true }
      );
    }

    res.json({ 
      success: true, 
      booking,
      message: `Booking status updated to ${status}`
    });
  } catch (err) {
    console.error('Update booking status error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating booking status' 
    });
  }
});

// Cancel Booking with Reason
router.post('/bookings/:id/cancel', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const { refund, reason } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'cancelled',
        cancellationReason: reason,
        cancellationDate: new Date()
      },
      { new: true }
    ).populate('car');

    if (!booking) {
      req.flash('error_msg', 'Booking not found');
      return res.redirect('/admin/bookings');
    }

    // Update vehicle availability
    await Car.findByIdAndUpdate(
      booking.car._id,
      { available: true }
    );

    // Process refund if selected
    if (refund === 'true') {
      // Implement your refund logic here
      // This would typically involve calling your payment provider's API
      booking.refundProcessed = true;
      await booking.save();
    }

    req.flash('success_msg', 'Booking cancelled successfully');
    res.redirect(`/admin/bookings/${req.params.id}`);
  } catch (err) {
    console.error('Cancel booking error:', err);
    req.flash('error_msg', 'Error cancelling booking');
    res.redirect('/admin/bookings');
  }
});

// User Management
router.get('/users', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.render('admin/users', {
      title: 'User Management',
      user: req.user,
      users,
      activePage: 'users'
    });
  } catch (err) {
    console.error('Users error:', err);
    req.flash('error_msg', 'Error loading users');
    res.redirect('/admin/dashboard');
  }
});

// Toggle User Status
router.put('/users/:id/status', ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/users');
    }

    user.active = !user.active;
    await user.save();
    
    req.flash('success_msg', `User ${user.active ? 'activated' : 'deactivated'}`);
    res.redirect('/admin/users');
  } catch (err) {
    console.error('Toggle user status error:', err);
    req.flash('error_msg', 'Error updating user status');
    res.redirect('/admin/users');
  }
});

// Profile Routes
router.get('/profile', ensureAuthenticated, (req, res) => {
  res.render('user/profile', {
    title: 'My Profile',
    user: req.user,
    activePage: 'profile'
  });
});

router.put('/profile/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { name, email, mobile, address } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, mobile, address },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/profile');
    }

    req.flash('success_msg', 'Profile updated successfully');
    res.render('user/profile', {
      title: 'My Profile',
      user: updatedUser
    });
  } catch (err) {
    console.error('Profile update error:', err);
    req.flash('error_msg', 'Error updating profile');
    res.redirect('/admin/profile');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.logout(() => {
    req.flash('success_msg', 'You have been logged out');
    res.redirect('/auth/login');
  });
});

module.exports = router;