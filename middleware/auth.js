function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    if (!roles.includes(req.session.user.role)) {
      return res.redirect('/unauthorized');
    }

    return next();
  };
}

module.exports = {
  requireLogin,
  requireRole
};
