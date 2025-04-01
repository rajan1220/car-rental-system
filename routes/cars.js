const express = require('express');
const router = express.Router();
const Car = require('../models/Car');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const upload = require('../config/multer'); // Import the upload middleware

// Get all cars
router.get('/', async (req, res) => {
  try {
    const cars = await Car.find().sort({ createdAt: -1 });
    res.render('cars/list', {
      title: 'All Cars',
      cars,
      user: req.user || null
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error fetching cars');
    res.redirect('/');
  }
});

// Show add car form (Admin only)
router.get('/add', ensureAuthenticated, ensureAdmin, (req, res) => {
  res.render('cars/add', {
    title: 'Add New Car',
    user: req.user || null
  });
});

// Handle new car submission (Admin only)
router.post('/', ensureAuthenticated, ensureAdmin, upload.single('image'), async (req, res) => {
  try {
    const { make, model, type, dailyRate, seats, doors, transmission, aircon, features } = req.body;
    
    const newCar = new Car({
      make,
      model,
      type,
      dailyRate: parseFloat(dailyRate),
      seats: parseInt(seats),
      doors: parseInt(doors),
      transmission,
      aircon: aircon === 'on',
      features: features.split(',').map(f => f.trim()),
      image: req.file ? req.file.filename : 'default-car.jpg',
      available: true
    });

    await newCar.save();
    req.flash('success_msg', 'Car added successfully');
    res.redirect('/cars');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error adding car');
    res.redirect('/cars/add');
  }
});

// Show single car
router.get('/:id', async (req, res) => {
  try {
    const car = await Car.findById(req.params.id);
    if (!car) {
      req.flash('error_msg', 'Car not found');
      return res.redirect('/cars');
    }
    res.render('cars/single', {
      title: `${car.make} ${car.model}`,
      car,
      user: req.user || null
    });
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error fetching car details');
    res.redirect('/cars');
  }
});

module.exports = router;