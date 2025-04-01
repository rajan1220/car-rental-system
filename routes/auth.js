const express = require('express');
const router = express.Router();
const passport = require('passport');
const { check, validationResult } = require('express-validator');
const User = require('../models/User');

// Login Page
router.get('/login', (req, res) => {
  // res.status(200).json("Login received");
  res.render('auth/login', { 
    title: 'Login',
    success_msg: req.flash('success_msg'),
    error_msg: req.flash('error_msg'),
    error: req.flash('error')
  });
});

// Login Handle
router.post('/login', [
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password is required').exists()
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/login', {
      title: 'Login',
      error_msg: errors.array()[0].msg,
      email: req.body.email
    });
  }

  passport.authenticate('local', {
    successRedirect: '/users/dashboard',
    failureRedirect: '/auth/login',
    failureFlash: true
  })(req, res, next);
});

// Register Page
router.get('/register', (req, res) => {
  res.render('auth/register', { 
    title: 'Register',
    body:'<%- include("../partials/layout") %>',
    success_msg: req.flash('success_msg'),
    error_msg: req.flash('error_msg')
  });
});

// Register Handle
router.post('/register', [
  check('name', 'Name is required').not().isEmpty(),
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
  check('password2', 'Passwords do not match').custom((value, { req }) => value === req.body.password)
], async (req, res) => {
  // console.log("Register ok");
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/register', {
      title: 'Register',
      error_msg: errors.array()[0].msg,
      name: req.body.name,
      email: req.body.email
    });
  }

  try {
    const { name, email, password } = req.body;
    
    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      req.flash('error_msg', 'Email already registered');
      return res.redirect('/auth/register');
    }

    // Create user
    user = new User({ name, email, password });
    await user.save();
    
    req.flash('success_msg', 'You are now registered and can log in');
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server error');
    res.redirect('/auth/register');
  }
});

// Logout Handle
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) { 
      console.error(err);
      return next(err); 
    }
    req.flash('success_msg', 'You are logged out');
    res.redirect('/auth/login');
  });
});

module.exports = router;