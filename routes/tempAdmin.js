const express = require('express');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const User = require('../models/Users');
const Payment = require('../models/Payment');
const Leaderboard = require('../models/Leaderboard');
const router = express.Router();

// Temporary admin dashboard - no authentication required
router.get('/temp-dashboard', async (req, res) => {
    try {
        console.log('Temporary admin dashboard accessed');
        
        // Get admin user (or create one if doesn't exist)
        let admin = await User.findOne({ role: 'admin' });
        
        if (!admin) {
            console.log('No admin found, creating temporary admin...');
            admin = new User({
                whatsapp: '254714003218',
                efootballId: 'ADMIN123',
                role: 'admin',
                isVerified: true,
                isActive: true,
                password: 'temporary_password_123' // This will be hashed by the pre-save hook
            });
            await admin.save();
            console.log('Temporary admin created:', admin);
        }

        // Get dashboard statistics
        const [
            totalPlayers,
            totalTournaments,
            activeTournaments,
            totalMatches,
            pendingMatches,
            pendingPayments
        ] = await Promise.all([
            User.countDocuments({ role: 'player' }),
            Tournament.countDocuments(),
            Tournament.countDocuments({ status: 'active' }),
            Match.countDocuments(),
            Match.countDocuments({ 
                status: { $in: ['disputed', 'completed'] },
                'result.confirmedBy': null
            }),
            Payment.countDocuments({ status: 'pending' })
        ]);

        // Get recent activity
        const [recentTournaments, recentMatches, recentRegistrations] = await Promise.all([
            Tournament.find().sort({ createdAt: -1 }).limit(5).populate('organizer', 'efootballId'),
            Match.find().sort({ createdAt: -1 }).limit(5)
                .populate('player1.user player2.user', 'efootballId')
                .populate('tournament', 'name'),
            User.find({ role: 'player' }).sort({ createdAt: -1 }).limit(5).select('efootballId createdAt')
        ]);

        res.json({
            success: true,
            stats: {
                totalPlayers,
                totalTournaments,
                activeTournaments,
                totalMatches,
                pendingMatches,
                pendingPayments
            },
            recentActivity: {
                tournaments: recentTournaments,
                matches: recentMatches,
                registrations: recentRegistrations
            },
            message: 'Temporary admin access - please secure this endpoint in production!'
        });

    } catch (error) {
        console.error('Error in temp admin dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error accessing admin dashboard',
            error: error.message
        });
    }
});

module.exports = router;
