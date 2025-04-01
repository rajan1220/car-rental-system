const express = require('express');
const router = express.Router();
const Car = require('../models/Car');

// Home page
router.get('/', async (req, res) => {
  // res.status(200).json("Data ok")
  try {
    const cars = await Car.find().limit(3);
    res.render('index', { 
      title: 'Home',
      cars,
      user: req.user || null
    });
  } catch (err) {
    console.error(err);
    res.render('index', { 
      title: 'Home',
      cars: [],
      user: req.user || null
    });
  }
});

// About page
router.get('/about', (req, res) => {
  res.render('about', { 
    title: 'About Us',
    user: req.user || null
  });
});

// Contact page
router.get('/contact', (req, res) => {
  res.render('contact', { 
    title: 'Contact Us',
    user: req.user || null
  });
});


module.exports = router;