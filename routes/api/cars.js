const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const adminAuth = require('../../middleware/adminAuth');
const Car = require('../../models/Car');
const { check, validationResult } = require('express-validator');

// @route   GET api/cars
// @desc    Get all cars
// @access  Public
router.get('/', async (req, res) => {
  try {
    const cars = await Car.find().sort({ make: 1 });
    res.json(cars);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/cars/:id
// @desc    Get car by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const car = await Car.findById(req.params.id);
    if (!car) {
      return res.status(404).json({ msg: 'Car not found' });
    }
    res.json(car);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Car not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   POST api/cars
// @desc    Create a car
// @access  Private/Admin
router.post(
  '/',
  [
    auth,
    adminAuth,
    [
      check('make', 'Make is required').not().isEmpty(),
      check('model', 'Model is required').not().isEmpty(),
      check('dailyRate', 'Daily rate is required').isNumeric()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { make, model, type, dailyRate, seats, doors, transmission, aircon, available } = req.body;

    try {
      const newCar = new Car({
        make,
        model,
        type,
        dailyRate,
        seats,
        doors,
        transmission,
        aircon,
        available
      });

      const car = await newCar.save();
      res.json(car);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   PUT api/cars/:id
// @desc    Update car
// @access  Private/Admin
router.put('/:id', [auth, adminAuth], async (req, res) => {
  const { make, model, type, dailyRate, seats, doors, transmission, aircon, luggage, available } = req.body;

  // Build car object
  const carFields = {};
  if (make) carFields.make = make;
  if (model) carFields.model = model;
  if (type) carFields.type = type;
  if (dailyRate) carFields.dailyRate = dailyRate;
  if (seats) carFields.seats = seats;
  if (doors) carFields.doors = doors;
  if (transmission) carFields.transmission = transmission;
  if (aircon) carFields.aircon = aircon;
  if (luggage) carFields.luggage = luggage;
  if (available !== undefined) carFields.available = available;

  try {
    let car = await Car.findById(req.params.id);
    if (!car) {
      return res.status(404).json({ msg: 'Car not found' });
    }

    car = await Car.findByIdAndUpdate(
      req.params.id,
      { $set: carFields },
      { new: true }
    );

    res.json(car);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/cars/:id
// @desc    Delete car
// @access  Private/Admin
router.delete('/:id', [auth, adminAuth], async (req, res) => {
  try {
    const car = await Car.findById(req.params.id);
    if (!car) {
      return res.status(404).json({ msg: 'Car not found' });
    }

    await car.remove();
    res.json({ msg: 'Car removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Car not found' });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router;