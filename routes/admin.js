const express = require('express');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const User = require('../models/Users');
const Payment = require('../models/Payment');
const Leaderboard = require('../models/Leaderboard');
const adminAuth = require('../middleware/adminAuth');
const router = express.Router();

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Public (Temporary - Remove in production)
router.get('/dashboard', async (req, res) => {
    try {
        // Get total counts
        const totalPlayers = await User.countDocuments({ role: 'player' });
        const totalTournaments = await Tournament.countDocuments();
        const activeTournaments = await Tournament.countDocuments({ status: 'active' });
        const totalMatches = await Match.countDocuments();
        
        // Get pending actions
        const pendingMatches = await Match.countDocuments({ 
            status: { $in: ['disputed', 'completed'] },
            'result.confirmedBy': null
        });
        
        const pendingPayments = await Payment.countDocuments({ status: 'pending' });
        
        // Get revenue statistics
        const revenueResult = await Payment.aggregate([
            { $match: { status: 'completed', type: 'entry_fee' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

        // Get recent activity
        const recentTournaments = await Tournament.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('organizer', 'efootballId');
            
        const recentMatches = await Match.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('player1.user player2.user', 'efootballId')
            .populate('tournament', 'name');

        const recentRegistrations = await User.find({ role: 'player' })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('efootballId createdAt');

        res.json({
            success: true,
            stats: {
                totalPlayers,
                totalTournaments,
                activeTournaments,
                totalMatches,
                pendingMatches,
                pendingPayments,
                totalRevenue
            },
            recentActivity: {
                tournaments: recentTournaments,
                matches: recentMatches,
                registrations: recentRegistrations
            }
        });

    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load dashboard data',
            error: error.message
        });
    }
});

// @route   GET /api/admin/tournaments
// @desc    Get all tournaments for admin
// @access  Public (Temporary - Remove in production)
router.get('/tournaments', async (req, res) => {
    try {
        console.log('🔍 Admin tournaments endpoint called');
        console.log('Request headers:', {
            origin: req.headers.origin,
            userAgent: req.headers['user-agent']?.substring(0, 50)
        });
        const { page = 1, limit = 10, status } = req.query;
        console.log('Query params:', { page, limit, status });

        const skip = (page - 1) * limit;

        const query = {};
        if (status && status !== 'all') {
            query.status = status;
        }
        console.log('MongoDB query:', query);

        // First, let's count all tournaments without any filter to debug
        const totalTournaments = await Tournament.countDocuments();
        console.log('Total tournaments in database:', totalTournaments);

        const tournaments = await Tournament.find(query)
            .populate('organizer', 'efootballId profile')
            .populate('participants.player', 'efootballId profile')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        console.log('Found tournaments:', tournaments.length);
        console.log('Tournament IDs:', tournaments.map(t => ({ id: t._id, name: t.name, status: t.status })));

        const total = await Tournament.countDocuments(query);
        console.log('Filtered total:', total);

        res.json({
            success: true,
            tournaments,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Admin tournaments error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tournaments',
            error: error.message
        });
    }
});

// @route   GET /api/admin/tournaments/:id
// @desc    Get single tournament with participants and matches
// @access  Private (Admin)
router.get('/tournaments/:id', adminAuth, async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id)
            .populate('organizer', 'efootballId profile')
            .populate('participants.player', 'efootballId profile stats');

        if (!tournament) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found'
            });
        }

        const matches = await Match.find({ tournament: tournament._id })
            .populate('player1.user player2.user', 'efootballId profile')
            .sort({ matchNumber: 1, createdAt: 1 });

        res.json({
            success: true,
            tournament,
            matches
        });
    } catch (error) {
        console.error('Admin get tournament error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tournament details',
            error: error.message
        });
    }
});

// @route   DELETE /api/admin/tournaments/:id/participants/:participantId
// @desc    Remove participant from tournament
// @access  Private (Admin)
router.delete('/tournaments/:id/participants/:participantId', adminAuth, async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id)
            .populate('participants.player', 'efootballId profile stats');

        if (!tournament) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found'
            });
        }

        const { participantId } = req.params;
        const participantIndex = tournament.participants.findIndex(p =>
            p._id?.toString() === participantId ||
            p.player?.toString() === participantId
        );

        if (participantIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Participant not found in this tournament'
            });
        }

        const removed = tournament.participants.splice(participantIndex, 1)[0];
        await tournament.save();
        await tournament.populate('participants.player', 'efootballId profile stats');

        res.json({
            success: true,
            message: `${removed.player?.efootballId || 'Participant'} removed successfully`,
            tournament
        });
    } catch (error) {
        console.error('Remove participant error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove participant',
            error: error.message
        });
    }
});

// @route   POST /api/admin/matches/:id/result
// @desc    Manually record/override a match result
// @access  Private (Admin)
router.post('/matches/:id/result', adminAuth, async (req, res) => {
    try {
        const match = await Match.findById(req.params.id)
            .populate('player1.user player2.user', 'efootballId profile');

        if (!match) {
            return res.status(404).json({
                success: false,
                message: 'Match not found'
            });
        }

        const { player1Score, player2Score, notes } = req.body;

        if (player1Score === undefined || player2Score === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Both player scores are required'
            });
        }

        match.player1.score = parseInt(player1Score, 10);
        match.player2.score = parseInt(player2Score, 10);
        match.player1.confirmed = true;
        match.player2.confirmed = true;

        match.result.isDraw = match.player1.score === match.player2.score;
        match.result.winner = null;
        match.result.loser = null;

        if (!match.result.isDraw) {
            const player1Wins = match.player1.score > match.player2.score;
            match.result.winner = player1Wins ? match.player1.user : match.player2.user;
            match.result.loser = player1Wins ? match.player2.user : match.player1.user;
        }

        match.result.winnerScore = Math.max(match.player1.score, match.player2.score);
        match.result.loserScore = Math.min(match.player1.score, match.player2.score);
        match.result.confirmedBy = req.user?.id || null;
        match.result.confirmedAt = new Date();
        match.adminNotes = notes || match.adminNotes;
        match.status = 'completed';

        await match.save();
        await match.populate('player1.user player2.user', 'efootballId profile');

        res.json({
            success: true,
            message: 'Match result recorded successfully',
            match
        });
    } catch (error) {
        console.error('Admin record result error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to record match result',
            error: error.message
        });
    }
});

// @route   GET /api/admin/matches/pending
// @desc    Get pending matches for verification
// @access  Public (Temporary - Remove in production)
router.get('/matches/pending', async (req, res) => {
    try {
        const matches = await Match.find({
            status: { $in: ['disputed', 'completed'] },
            'result.confirmedBy': null
        })
        .populate('tournament', 'name')
        .populate('player1.user player2.user', 'efootballId profile')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            matches
        });

    } catch (error) {
        console.error('Admin pending matches error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending matches',
            error: error.message
        });
    }
});

// @route   POST /api/admin/matches/:id/verify
// @desc    Verify match result
// @access  Public (Temporary - Remove in production)
router.post('/matches/:id/verify', async (req, res) => {
    try {
        const match = await Match.findById(req.params.id);
        
        if (!match) {
            return res.status(404).json({
                success: false,
                message: 'Match not found'
            });
        }

        await match.verifyResult(req.user.id);
        
        // Update player stats
        if (match.result.winner && !match.result.isDraw) {
            const winner = await User.findById(match.result.winner);
            const loser = await User.findById(match.result.loser);
            
            if (winner) await winner.updateStats('win');
            if (loser) await loser.updateStats('loss');
            
            // Update leaderboard
            await Leaderboard.updatePlayerStats(match.result.winner, 'win');
            await Leaderboard.updatePlayerStats(match.result.loser, 'loss');
        } else if (match.result.isDraw) {
            const player1 = await User.findById(match.player1.user);
            const player2 = await User.findById(match.player2.user);
            
            if (player1) await player1.updateStats('draw');
            if (player2) await player2.updateStats('draw');
            
            await Leaderboard.updatePlayerStats(match.player1.user, 'draw');
            await Leaderboard.updatePlayerStats(match.player2.user, 'draw');
        }

        await match.populate('player1.user player2.user', 'efootballId profile');

        res.json({
            success: true,
            message: 'Match result verified successfully',
            match
        });

    } catch (error) {
        console.error('Verify match error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify match result',
            error: error.message
        });
    }
});

// @route   GET /api/admin/payments
// @desc    Get all payments
// @access  Public (Temporary - Remove in production)
router.get('/payments', async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const skip = (page - 1) * limit;

        const query = {};
        if (status && status !== 'all') {
            query.status = status;
        }

        const payments = await Payment.find(query)
            .populate('user', 'efootballId whatsapp')
            .populate('tournament', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Payment.countDocuments(query);

        // Get payment statistics
        const stats = await Payment.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' }
                }
            }
        ]);

        res.json({
            success: true,
            payments,
            stats,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Admin payments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payments',
            error: error.message
        });
    }
});

// @route   POST /api/admin/payments/:id/process
// @desc    Manually process payment
// @access  Public (Temporary - Remove in production)
router.post('/payments/:id/process', async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        const { action } = req.body; // 'approve' or 'reject'

        if (action === 'approve') {
            await payment.markAsCompleted();
            
            // If this is a tournament entry fee, register the player
            if (payment.type === 'entry_fee' && payment.tournament) {
                const tournament = await Tournament.findById(payment.tournament);
                if (tournament) {
                    await tournament.addParticipant(payment.user);
                }
            }
        } else if (action === 'reject') {
            await payment.markAsFailed('Manually rejected by admin');
        }

        res.json({
            success: true,
            message: `Payment ${action}d successfully`,
            payment
        });

    } catch (error) {
        console.error('Process payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process payment',
            error: error.message
        });
    }
});

// @route   GET /api/admin/analytics
// @desc    Get analytics data
// @access  Public (Temporary - Remove in production)
router.get('/analytics', async (req, res) => {
    try {
        // User growth over time
        const userGrowth = await User.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
            { $limit: 12 }
        ]);

        // Tournament statistics
        const tournamentStats = await Tournament.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalPrize: { $sum: '$settings.prizePool' },
                    avgParticipants: { $avg: { $size: '$participants' } }
                }
            }
        ]);

        // Revenue by month
        const revenueByMonth = await Payment.aggregate([
            {
                $match: {
                    status: 'completed',
                    createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    revenue: { $sum: '$amount' }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Platform usage
        const platformStats = await Tournament.aggregate([
            {
                $group: {
                    _id: { $arrayElemAt: ['$settings.platforms', 0] },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            analytics: {
                userGrowth,
                tournamentStats,
                revenueByMonth,
                platformStats
            }
        });

    } catch (error) {
        console.error('Admin analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics',
            error: error.message
        });
    }
});

// @route   POST /api/admin/system/maintenance
// @desc    Toggle maintenance mode
// @access  Public (Temporary - Remove in production)
router.post('/system/maintenance', async (req, res) => {
    try {
        const { enabled, message } = req.body;
        
        // In a real application, you would store this in database or cache
        // For now, we'll just return success
        res.json({
            success: true,
            message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
            maintenance: {
                enabled: enabled || false,
                message: message || 'System is under maintenance. Please check back later.',
                timestamp: new Date()
            }
        });

    } catch (error) {
        console.error('Maintenance mode error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update maintenance mode',
            error: error.message
        });
    }
});

module.exports = router;
