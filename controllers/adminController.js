const Car = require('../models/Car');
const Booking = require('../models/Booking');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const moment = require('moment');

// Helper function to calculate today's revenue
const calculateTodaysRevenue = async () => {
  const startOfDay = moment().startOf('day');
  const endOfDay = moment().endOf('day');
  
  const todaysBookings = await Booking.find({
    status: 'completed',
    updatedAt: {
      $gte: startOfDay.toDate(),
      $lte: endOfDay.toDate()
    }
  });

  return todaysBookings.reduce((total, booking) => total + (booking.totalAmount || 0), 0);
};

// Dashboard Controller
exports.getDashboard = async (req, res) => {
  try {
    // Parallel database queries for better performance
    const [totalVehicles, activeBookings, registeredUsers, todaysRevenue] = await Promise.all([
      Car.countDocuments(),
      Booking.countDocuments({ 
        status: { $in: ['confirmed', 'in-progress'] } 
      }),
      User.countDocuments(),
      calculateTodaysRevenue()
    ]);

    // Get recent data with population
    const [recentBookings, recentVehicles, activityLog] = await Promise.all([
      Booking.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user car'),
      Car.find()
        .sort({ createdAt: -1 })
        .limit(5),
      ActivityLog.find()
        .sort({ date: -1 })
        .limit(5)
        .lean() || [{
          type: 'system',
          message: 'Dashboard initialized',
          icon: 'fa-info-circle',
          date: new Date()
        }]
    ]);

    // Log dashboard access
    await new ActivityLog({
      type: 'admin',
      message: 'Admin dashboard accessed',
      user: req.user._id
    }).save();

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      user: req.user,
      moment,
      dashboardStats: {
        totalVehicles,
        activeBookings,
        registeredUsers,
        todaysRevenue: todaysRevenue.toFixed(2)
      },
      recentBookings,
      recentVehicles,
      activityLog,
      activePage: 'dashboard'
    });

  } catch (err) {
    console.error('Dashboard Error:', err);
    
    // Log the error
    await new ActivityLog({
      type: 'error',
      message: 'Dashboard load failed',
      details: err.message,
      user: req.user?._id
    }).save();

    req.flash('error_msg', 'Failed to load dashboard data');
    res.redirect('/admin');
  }
};

// Vehicle Management Controllers
exports.listVehicles = async (req, res) => {
  try {
    const vehicles = await Car.find().sort({ createdAt: -1 });
    
    res.render('admin/vehicles', {
      title: 'Vehicle Management',
      user: req.user,
      vehicles,
      activePage: 'vehicles'
    });
  } catch (err) {
    console.error('Vehicle List Error:', err);
    req.flash('error_msg', 'Failed to load vehicles');
    res.redirect('/admin/dashboard');
  }
};

exports.showAddVehicleForm = (req, res) => {
  res.render('admin/add-vehicle', {
    title: 'Add New Vehicle',
    user: req.user,
    activePage: 'vehicles'
  });
};

exports.addVehicle = async (req, res) => {
  try {
    const { make, model, year, type, dailyRate, seats, transmission, fuelType } = req.body;
    
    const newVehicle = new Car({
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

    await newVehicle.save();

    // Log activity
    await new ActivityLog({
      type: 'vehicle',
      message: `New vehicle added: ${make} ${model}`,
      user: req.user._id
    }).save();

    req.flash('success_msg', 'Vehicle added successfully');
    res.redirect('/admin/vehicles');
  } catch (err) {
    console.error('Add Vehicle Error:', err);
    
    let errorMessage = 'Error adding vehicle';
    if (err.name === 'ValidationError') {
      errorMessage = Object.values(err.errors).map(val => val.message).join(', ');
    }

    req.flash('error_msg', errorMessage);
    res.redirect('/admin/vehicles/add');
  }
};

exports.showEditVehicleForm = async (req, res) => {
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
    console.error('Edit Vehicle Form Error:', err);
    req.flash('error_msg', 'Error loading vehicle');
    res.redirect('/admin/vehicles');
  }
};

exports.updateVehicle = async (req, res) => {
  try {
    const { make, model, year, type, dailyRate, seats, transmission, fuelType, available } = req.body;
    
    const updatedVehicle = await Car.findByIdAndUpdate(
      req.params.id,
      {
        make,
        model,
        year: parseInt(year),
        type,
        dailyRate: parseFloat(dailyRate),
        seats: parseInt(seats),
        transmission,
        fuelType,
        available: available === 'on'
      },
      { new: true, runValidators: true }
    );

    if (!updatedVehicle) {
      req.flash('error_msg', 'Vehicle not found');
      return res.redirect('/admin/vehicles');
    }

    // Log activity
    await new ActivityLog({
      type: 'vehicle',
      message: `Vehicle updated: ${make} ${model}`,
      user: req.user._id
    }).save();

    req.flash('success_msg', 'Vehicle updated successfully');
    res.redirect('/admin/vehicles');
  } catch (err) {
    console.error('Update Vehicle Error:', err);
    
    let errorMessage = 'Error updating vehicle';
    if (err.name === 'ValidationError') {
      errorMessage = Object.values(err.errors).map(val => val.message).join(', ');
    }

    req.flash('error_msg', errorMessage);
    res.redirect(`/admin/vehicles/edit/${req.params.id}`);
  }
};

exports.deleteVehicle = async (req, res) => {
  try {
    // Check for active bookings
    const hasActiveBookings = await Booking.exists({
      car: req.params.id,
      status: { $in: ['confirmed', 'in-progress'] }
    });

    if (hasActiveBookings) {
      req.flash('error_msg', 'Cannot delete vehicle with active bookings');
      return res.redirect('/admin/vehicles');
    }

    const deletedVehicle = await Car.findByIdAndDelete(req.params.id);
    if (!deletedVehicle) {
      req.flash('error_msg', 'Vehicle not found');
      return res.redirect('/admin/vehicles');
    }

    // Log activity
    await new ActivityLog({
      type: 'vehicle',
      message: `Vehicle deleted: ${deletedVehicle.make} ${deletedVehicle.model}`,
      user: req.user._id
    }).save();

    req.flash('success_msg', 'Vehicle deleted successfully');
    res.redirect('/admin/vehicles');
  } catch (err) {
    console.error('Delete Vehicle Error:', err);
    req.flash('error_msg', 'Error deleting vehicle');
    res.redirect('/admin/vehicles');
  }
};

// Booking Management Controllers
exports.listBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .sort({ createdAt: -1 })
      .populate('user car');

    res.render('admin/bookings', {
      title: 'Booking Management',
      user: req.user,
      moment,
      bookings,
      activePage: 'bookings'
    });
  } catch (err) {
    console.error('Booking List Error:', err);
    req.flash('error_msg', 'Failed to load bookings');
    res.redirect('/admin/dashboard');
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('car');

    if (!booking) {
      req.flash('error_msg', 'Booking not found');
      return res.redirect('/admin/bookings');
    }

    // Update vehicle availability if needed
    if (status === 'completed' || status === 'cancelled') {
      await Car.findByIdAndUpdate(
        booking.car._id,
        { available: true }
      );
    }

    // Log activity
    await new ActivityLog({
      type: 'booking',
      message: `Booking ${booking._id} status updated to ${status}`,
      user: req.user._id
    }).save();

    req.flash('success_msg', `Booking status updated to ${status}`);
    res.redirect('/admin/bookings');
  } catch (err) {
    console.error('Update Booking Error:', err);
    req.flash('error_msg', 'Failed to update booking status');
    res.redirect('/admin/bookings');
  }
};

// User Management Controllers
exports.listUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });

    res.render('admin/users', {
      title: 'User Management',
      user: req.user,
      users,
      activePage: 'users'
    });
  } catch (err) {
    console.error('User List Error:', err);
    req.flash('error_msg', 'Failed to load users');
    res.redirect('/admin/dashboard');
  }
};

exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/admin/users');
    }

    user.active = !user.active;
    await user.save();

    // Log activity
    await new ActivityLog({
      type: 'user',
      message: `User ${user.email} ${user.active ? 'activated' : 'deactivated'}`,
      user: req.user._id
    }).save();

    req.flash('success_msg', `User ${user.active ? 'activated' : 'deactivated'} successfully`);
    res.redirect('/admin/users');
  } catch (err) {
    console.error('Toggle User Status Error:', err);
    req.flash('error_msg', 'Failed to update user status');
    res.redirect('/admin/users');
  }
};

// Profile Controllers
exports.showProfile = (req, res) => {
  res.render('user/profile', {
    title: 'My Profile',
    user: req.user,
    activePage: 'profile'
  });
};

exports.updateProfile = async (req, res) => {
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

    // Log activity
    await new ActivityLog({
      type: 'profile',
      message: 'Profile updated',
      user: req.user._id
    }).save();

    req.flash('success_msg', 'Profile updated successfully');
    res.render('user/profile', {
      title: 'My Profile',
      user: updatedUser
    });
  } catch (err) {
    console.error('Profile Update Error:', err);
    
    let errorMessage = 'Error updating profile';
    if (err.name === 'ValidationError') {
      errorMessage = Object.values(err.errors).map(val => val.message).join(', ');
    }

    req.flash('error_msg', errorMessage);
    res.redirect('/admin/profile');
  }
};

// Booking 

// In your admin controller
exports.listBookings = async (req, res) => {
  try {
    const bookings = await Booking.find().populate('user car');
    res.render('admin/bookings', {
      title: 'Booking Management',
      bookings,
      activePage: 'bookings' // This is important for sidebar highlighting
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
};