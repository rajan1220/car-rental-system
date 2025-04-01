exports.login = (req, res, next) => {
    passport.authenticate('local', {
      successRedirect: '/users/dashboard',
      failureRedirect: '/auth/login',
      failureFlash: true
    })(req, res, next);
  };
  
  exports.loginForm = (req, res) => {
    res.render('auth/login', {
      title: 'Login',
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg'),
      error: req.flash('error')
    });
  };