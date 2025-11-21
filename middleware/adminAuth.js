/**
 * Temporary admin guard for development/demo.
 * Always injects an admin identity so the UI works without authentication.
 */
const adminAuth = async (req, res, next) => {
    // For demo purposes, try to find the actual admin user
    try {
        const User = require('../models/Users');
        const adminUser = await User.findOne({ role: 'admin' });

        if (adminUser) {
            req.user = {
                id: adminUser._id,
                role: 'admin',
                efootballId: adminUser.efootballId,
                isDemo: true
            };
        } else {
            // Fallback to demo user if no admin exists
            req.user = req.user || {
                id: 'demo-admin',
                role: 'admin',
                efootballId: 'ADMIN',
                isDemo: true
            };
        }
    } catch (error) {
        console.error('Error finding admin user:', error);
        // Fallback to demo user
        req.user = req.user || {
            id: 'demo-admin',
            role: 'admin',
            efootballId: 'ADMIN',
            isDemo: true
        };
    }

    next();
};

module.exports = adminAuth;