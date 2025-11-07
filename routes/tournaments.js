const express = require('express');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const router = express.Router();

// @route   GET /api/tournaments
// @desc    Get all tournaments (with filtering)
// @access  Public
router.get('/', async (req, res) => {
    try {
        const { 
            status, 
            format, 
            page = 1, 
            limit = 10,
            sort = '-createdAt'
        } = req.query;

        const query = {};
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (format) {
            query.format = format;
        }

        // Only show public tournaments to non-admins
        if (!req.user || req.user.role !== 'admin') {
            query.isPublic = true;
        }

        const tournaments = await Tournament.find(query)
            .populate('organizer', 'efootballId profile')
            .populate('participants.player', 'efootballId profile')
            .sort(sort)
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Tournament.countDocuments(query);

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
        console.error('Get tournaments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tournaments',
            error: error.message
        });
    }
});

// @route   GET /api/tournaments/active
// @desc    Get active tournaments
// @access  Public
router.get('/active', async (req, res) => {
    try {
        const tournaments = await Tournament.find({
            status: { $in: ['upcoming', 'active'] },
            isPublic: true
        })
        .populate('organizer', 'efootballId profile')
        .populate('participants.player', 'efootballId profile')
        .sort({ 'schedule.tournamentStart': 1 })
        .limit(20);

        res.json({
            success: true,
            tournaments
        });

    } catch (error) {
        console.error('Get active tournaments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active tournaments',
            error: error.message
        });
    }
});

// @route   GET /api/tournaments/:id
// @desc    Get single tournament
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id)
            .populate('organizer', 'efootballId profile')
            .populate('participants.player', 'efootballId profile stats')
            .populate('winners.player', 'efootballId profile');

        if (!tournament) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found'
            });
        }

        // Get tournament matches
        const matches = await Match.find({ tournament: tournament._id })
            .populate('player1.user player2.user', 'efootballId profile')
            .sort({ matchNumber: 1 });

        res.json({
            success: true,
            tournament: {
                ...tournament.toObject(),
                matches
            }
        });

    } catch (error) {
        console.error('Get tournament error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tournament',
            error: error.message
        });
    }
});

// @route   POST /api/tournaments
// @desc    Create new tournament (Admin only)
// @access  Private (Admin)
router.post('/', adminAuth, async (req, res) => {
    try {
        const tournamentData = {
            ...req.body,
            organizer: req.user.id
        };

        const tournament = new Tournament(tournamentData);
        await tournament.save();

        await tournament.populate('organizer', 'efootballId profile');

        res.status(201).json({
            success: true,
            message: 'Tournament created successfully',
            tournament
        });

    } catch (error) {
        console.error('Create tournament error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create tournament',
            error: error.message
        });
    }
});

// @route   PUT /api/tournaments/:id
// @desc    Update tournament (Admin only)
// @access  Private (Admin)
router.put('/:id', adminAuth, async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id);
        
        if (!tournament) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found'
            });
        }

        // Update tournament fields
        Object.keys(req.body).forEach(key => {
            if (key !== 'organizer') { // Prevent changing organizer
                tournament[key] = req.body[key];
            }
        });

        await tournament.save();
        await tournament.populate('organizer', 'efootballId profile');

        res.json({
            success: true,
            message: 'Tournament updated successfully',
            tournament
        });

    } catch (error) {
        console.error('Update tournament error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update tournament',
            error: error.message
        });
    }
});

// @route   POST /api/tournaments/:id/join
// @desc    Join a tournament
// @access  Private
router.post('/:id/join', auth, async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id);
        
        if (!tournament) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found'
            });
        }

        if (tournament.status !== 'upcoming') {
            return res.status(400).json({
                success: false,
                message: 'Cannot join tournament - registration closed'
            });
        }

        // Check registration period
        const now = new Date();
        if (tournament.schedule.registrationStart && now < tournament.schedule.registrationStart) {
            return res.status(400).json({
                success: false,
                message: 'Registration has not started yet'
            });
        }

        if (tournament.schedule.registrationEnd && now > tournament.schedule.registrationEnd) {
            return res.status(400).json({
                success: false,
                message: 'Registration has ended'
            });
        }

        // Add participant
        await tournament.addParticipant(req.user.id);
        await tournament.populate('participants.player', 'efootballId profile');

        res.json({
            success: true,
            message: 'Successfully joined tournament',
            tournament
        });

    } catch (error) {
        console.error('Join tournament error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to join tournament',
            error: error.message
        });
    }
});

// @route   POST /api/tournaments/:id/leave
// @desc    Leave a tournament
// @access  Private
router.post('/:id/leave', auth, async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id);
        
        if (!tournament) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found'
            });
        }

        if (tournament.status === 'active' || tournament.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot leave active or completed tournament'
            });
        }

        // Remove participant
        await tournament.removeParticipant(req.user.id);
        await tournament.populate('participants.player', 'efootballId profile');

        res.json({
            success: true,
            message: 'Successfully left tournament',
            tournament
        });

    } catch (error) {
        console.error('Leave tournament error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to leave tournament',
            error: error.message
        });
    }
});

// @route   GET /api/tournaments/:id/standings
// @desc    Get tournament standings/leaderboard
// @access  Public
router.get('/:id/standings', async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id)
            .populate('participants.player', 'efootballId profile stats');

        if (!tournament) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found'
            });
        }

        // Calculate standings based on matches
        const matches = await Match.find({
            tournament: tournament._id,
            status: 'completed'
        });

        // Simple standings calculation (in real app, this would be more complex)
        const standings = tournament.participants.map(participant => {
            const playerMatches = matches.filter(match => 
                match.player1.user.toString() === participant.player._id.toString() ||
                match.player2.user.toString() === participant.player._id.toString()
            );

            const wins = playerMatches.filter(match => 
                match.result.winner?.toString() === participant.player._id.toString()
            ).length;

            const losses = playerMatches.filter(match => 
                match.result.loser?.toString() === participant.player._id.toString()
            ).length;

            const draws = playerMatches.filter(match => 
                match.result.isDraw
            ).length;

            return {
                player: participant.player,
                matches: playerMatches.length,
                wins,
                losses,
                draws,
                points: wins * 3 + draws
            };
        }).sort((a, b) => b.points - a.points);

        res.json({
            success: true,
            standings
        });

    } catch (error) {
        console.error('Get standings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch standings',
            error: error.message
        });
    }
});

module.exports = router;