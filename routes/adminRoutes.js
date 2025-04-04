const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');


router.get('/dashboard', ensureAuthenticated, (req, res) => {
  try{
  res.render('admin/dashboard', {
    title: 'Dashboard',
    user: req.user
  });}
  catch(err){
    console.log(err.message);
  }
});

module.exports = router;