function requireAdmin(req, res, next) {
  if (req.session && req.session.adminUserId) {
    return next();
  }
  res.redirect('/admin/login');
}

function optionalAdmin(req, res, next) {
  req.isAdmin = !!(req.session && req.session.adminUserId);
  next();
}

module.exports = { requireAdmin, optionalAdmin };
