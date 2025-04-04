// config/auth.js
module.exports = {
    ensureAuthenticated: function(req, res, next) {
      if (req.isAuthenticated()) {
        return next();
      }
      req.flash('error_msg', 'Please log in to view this resource');
      res.redirect('/auth/login');
    },
    
    ensureAdmin: function(req, res, next) {
      if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
      }
      req.flash('error_msg', 'Unauthorized access');
      res.redirect('/');
    }
  };