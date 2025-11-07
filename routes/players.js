const express = require('express');
const User = require('../models/Users');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const Leaderboard = require('../models/Leaderboard');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const router = express.Router();

// @route   GET /api/players/profile
// @desc    Get player profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Player not found'
            });
        }

        res.json({
            success: true,
            profile: {
                id: user._id,
                whatsapp: user.whatsapp,
                efootballId: user.efootballId,
                profile: user.profile,
                stats: user.stats,
                isVerified: user.isVerified,
                joinedAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile',
            error: error.message
        });
    }
});

// @route   PUT /api/players/profile
// @desc    Update player profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
    try {
        const { displayName, location, bio } = req.body;
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Player not found'
            });
        }

        // Update profile fields
        if (displayName !== undefined) user.profile.displayName = displayName;
        if (location !== undefined) user.profile.location = location;
        if (bio !== undefined) user.profile.bio = bio;

        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            profile: {
                id: user._id,
                whatsapp: user.whatsapp,
                efootballId: user.efootballId,
                profile: user.profile,
                stats: user.stats
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: error.message
        });
    }
});

// @route   GET /api/players/stats
// @desc    Get player statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Player not found'
            });
        }

        // Get recent matches
        const recentMatches = await Match.find({
            $or: [
                { 'player1.user': req.user.id },
                { 'player2.user': req.user.id }
            ],
            status: 'completed'
        })
        .populate('tournament', 'name')
        .populate('player1.user player2.user', 'efootballId profile')
        .sort({ createdAt: -1 })
        .limit(10);

        // Get tournament participations
        const tournaments = await Tournament.find({
            'participants.player': req.user.id
        })
        .select('name status schedule settings.prizePool winners')
        .sort({ 'schedule.tournamentStart': -1 });

        // Get leaderboard position
        const leaderboard = await Leaderboard.getPlayerPosition(req.user.id);

        res.json({
            success: true,
            stats: {
                basic: user.stats,
                recentMatches,
                tournaments: tournaments.length,
                leaderboardPosition: leaderboard ? leaderboard.rank : null,
                achievements: [] // Could be expanded with an achievements system
            }
        });

    } catch (error) {
        console.error('Get player stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch player statistics',
            error: error.message
        });
    }
});

// @route   GET /api/players/:id
// @desc    Get player public profile
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('efootballId profile stats createdAt');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Player not found'
            });
        }

        // Get recent public matches
        const recentMatches = await Match.find({
            $or: [
                { 'player1.user': req.params.id },
                { 'player2.user': req.params.id }
            ],
            status: 'completed'
        })
        .populate('tournament', 'name')
        .populate('player1.user player2.user', 'efootballId profile')
        .sort({ createdAt: -1 })
        .limit(5);

        res.json({
            success: true,
            player: {
                id: user._id,
                efootballId: user.efootballId,
                profile: user.profile,
                stats: user.stats,
                joinedAt: user.createdAt,
                recentMatches
            }
        });

    } catch (error) {
        console.error('Get player error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch player information',
            error: error.message
        });
    }
});

// @route   GET /api/players/:id/matches
// @desc    Get player match history
// @access  Public
router.get('/:id/matches', async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        const matches = await Match.find({
            $or: [
                { 'player1.user': req.params.id },
                { 'player2.user': req.params.id }
            ]
        })
        .populate('tournament', 'name format')
        .populate('player1.user player2.user', 'efootballId profile')
        .sort({ scheduledTime: -1 })
        .skip(skip)
        .limit(parseInt(limit));

        const total = await Match.countDocuments({
            $or: [
                { 'player1.user': req.params.id },
                { 'player2.user': req.params.id }
            ]
        });

        res.json({
            success: true,
            matches,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get player matches error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch player matches',
            error: error.message
        });
    }
});

// @route   GET /api/players/:id/tournaments
// @desc    Get player tournament history
// @access  Public
router.get('/:id/tournaments', async (req, res) => {
    try {
        const tournaments = await Tournament.find({
            'participants.player': req.params.id
        })
        .select('name status schedule settings.prizePool winners participants')
        .populate('winners.player', 'efootballId profile')
        .sort({ 'schedule.tournamentStart': -1 });

        // Enhance with player-specific data
        const enhancedTournaments = tournaments.map(tournament => {
            const participant = tournament.participants.find(
                p => p.player.toString() === req.params.id
            );
            
            return {
                ...tournament.toObject(),
                playerStatus: participant ? participant.status : 'unknown',
                playerSeed: participant ? participant.seed : null
            };
        });

        res.json({
            success: true,
            tournaments: enhancedTournaments
        });

    } catch (error) {
        console.error('Get player tournaments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch player tournaments',
            error: error.message
        });
    }
});

// @route   GET /api/admin/players
// @desc    Get all players (Admin only)
// @access  Private (Admin)
router.get('/admin/players', adminAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;
        const skip = (page - 1) * limit;

        const query = {};
        if (search) {
            query.$or = [
                { efootballId: { $regex: search, $options: 'i' } },
                { 'profile.displayName': { $regex: search, $options: 'i' } },
                { whatsapp: { $regex: search, $options: 'i' } }
            ];
        }

        const players = await User.find(query)
            .select('whatsapp efootballId profile stats role isVerified isActive createdAt lastLogin')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            players,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get players admin error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch players',
            error: error.message
        });
    }
});

// @route   PUT /api/admin/players/:id
// @desc    Update player (Admin only)
// @access  Private (Admin)
router.put('/admin/players/:id', adminAuth, async (req, res) => {
    try {
        const { role, isVerified, isActive } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Player not found'
            });
        }

        // Update fields
        if (role !== undefined) user.role = role;
        if (isVerified !== undefined) user.isVerified = isVerified;
        if (isActive !== undefined) user.isActive = isActive;

        await user.save();

        res.json({
            success: true,
            message: 'Player updated successfully',
            player: {
                id: user._id,
                whatsapp: user.whatsapp,
                efootballId: user.efootballId,
                profile: user.profile,
                role: user.role,
                isVerified: user.isVerified,
                isActive: user.isActive
            }
        });

    } catch (error) {
        console.error('Update player admin error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update player',
            error: error.message
        });
    }
});

module.exports = router;