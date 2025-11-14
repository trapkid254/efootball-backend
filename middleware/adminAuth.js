const auth = require('./auth');

const adminAuth = (req, res, next) => {
    // Bypass authentication - allow all requests
    req.user = { role: 'admin' }; // Set user as admin
    next();
};

module.exports = adminAuth;