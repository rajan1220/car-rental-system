const express = require('express');
const router = express.Router();
const Car = require('../models/Car');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const upload = require('../config/multer'); // Import the upload middleware

// Get all cars
router.get('/', async (req, res) => {
  try {
    const cars = await Car.find().sort({ createdAt: -1 });
    // console.log(cars);
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
    const { make, model, type, dailyRate, seats, doors, transmission, aircon, features,fuelType } = req.body;
    
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
      available: true,
      fuelType
    });

    await newCar.save();
    req.flash('success_msg', 'Car added successfully');
    res.redirect('/cars');
  } catch (err) {
    // console.error(err);
    req.flash('error_msg', 'Error adding car');
    res.redirect('/cars/add');
  }
});

// Show single car
router.get('/:id', async (req, res) => {
  try {
    const car = await Car.findById(req.params.id);
    // console.log(car);
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
    // console.error(err);
    req.flash('error_msg', 'Error fetching car details');
    res.redirect('/cars');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const car = await Car.findById(req.params.id);
    
    if (!car) {
      return res.status(404).render('error404'); // No leading slash
    }

    // Get similar cars (same type, excluding current car)
    const similarCars = await Car.find({
      type: car.type,
      _id: { $ne: car._id },
      available: true
    }).limit(4);

    console.log('Rendering car:', car._id, 'with', similarCars.length, 'similar cars');
    
    res.render('cars/single', {
      title: `${car.make} ${car.model}`,
      car: car,
      similarCars: similarCars || [] // Ensure array exists
    });

  } catch (err) {
    console.error('Error in car route:', err);
    res.status(500).render('error500');
  }
});

// Route to handle booking page
router.get('/bookings/new/:carId', async (req, res) => {
  try {
    const car = await Car.findById(req.params.carId);
    if (!car) {
      return res.status(404).send('Car not found');
    }
    res.render('bookings/new', { car });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.get('/similar/:id',async(req,res) =>{
  try {
      const car = await Car.find({_id:req.params.id});
      // console.log("Type: ",car[0].type);
      const cars = await Car.find({type:car[0].type});
      res.status(200).json(cars);
  } catch (error) {
    res.status(500).json("Error in finding similar cars");
  }
})
module.exports = router;