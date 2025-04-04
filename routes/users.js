const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');

// User dashboard
router.get('/dashboard', ensureAuthenticated, (req, res) => {
  console.log(req.user)
  res.render('user/dashboard', {
    title: 'Dashboard',
    user: req.user
  });
});

// User profile
router.get('/profile', ensureAuthenticated, (req, res) => {
  res.render('user/profile', {
    title: 'My Profile',
    user: req.user
  });
});

module.exports = router;