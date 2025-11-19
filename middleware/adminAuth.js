/**
 * Temporary admin guard for development/demo.
 * Always injects an admin identity so the UI works without authentication.
 */
const adminAuth = (req, res, next) => {
    req.user = req.user || {
        id: 'demo-admin',
        role: 'admin',
        efootballId: 'ADMIN',
        isDemo: true
    };
    next();
};

module.exports = adminAuth;