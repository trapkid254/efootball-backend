const express = require('express');
const auth = require('../middleware/auth');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const router = express.Router();

// @route   GET /api/user/tournaments
// @desc    Get tournaments that the current user is participating in
// @access  Private
router.get('/my-tournaments', auth, async (req, res) => {
    try {
        const tournaments = await Tournament.find({
            'participants.player': req.user.id,
            status: { $in: ['upcoming', 'active'] }
        })
        .populate('organizer', 'efootballId profile')
        .sort({ 'schedule.tournamentStart': 1 });

        res.json({
            success: true,
            tournaments
        });
    } catch (error) {
        console.error('Get user tournaments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch your tournaments',
            error: error.message
        });
    }
});

// @route   GET /api/user/available-tournaments
// @desc    Get tournaments that the user can join
// @access  Private
router.get('/available-tournaments', auth, async (req, res) => {
    try {
        // Find tournaments that are open for registration and the user hasn't joined yet
        const tournaments = await Tournament.find({
            'registration.status': 'open',
            'participants.player': { $ne: req.user.id },
            'participants': { $not: { $elemMatch: { player: req.user.id } } },
            status: 'upcoming'
        })
        .populate('organizer', 'efootballId profile')
        .sort({ 'schedule.registrationDeadline': 1 });

        res.json({
            success: true,
            tournaments
        });
    } catch (error) {
        console.error('Get available tournaments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available tournaments',
            error: error.message
        });
    }
});

// @route   POST /api/user/join-tournament/:tournamentId
// @desc    Join a tournament
// @access  Private
router.post('/join-tournament/:tournamentId', auth, async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.tournamentId);
        
        if (!tournament) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found'
            });
        }

        // Check if registration is open
        if (tournament.registration.status !== 'open') {
            return res.status(400).json({
                success: false,
                message: 'Registration for this tournament is not currently open'
            });
        }

        // Check if tournament is full
        if (tournament.participants.length >= tournament.settings.capacity) {
            return res.status(400).json({
                success: false,
                message: 'This tournament is already full'
            });
        }

        // Check if user is already registered
        const isRegistered = tournament.participants.some(
            p => p.player.toString() === req.user.id
        );

        if (isRegistered) {
            return res.status(400).json({
                success: false,
                message: 'You are already registered for this tournament'
            });
        }

        // Add user to participants
        tournament.participants.push({
            player: req.user.id,
            status: 'registered',
            joinedAt: new Date()
        });

        await tournament.save();

        res.json({
            success: true,
            message: 'Successfully joined the tournament',
            tournament
        });

    } catch (error) {
        console.error('Join tournament error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to join tournament',
            error: error.message
        });
    }
});

// @route   GET /api/user/upcoming-matches
// @desc    Get user's upcoming matches
// @access  Private
router.get('/upcoming-matches', auth, async (req, res) => {
    try {
        const matches = await Match.find({
            $or: [
                { 'player1.user': req.user.id },
                { 'player2.user': req.user.id }
            ],
            status: 'scheduled'
        })
        .populate('tournament', 'name')
        .populate('player1.user', 'efootballId profile')
        .populate('player2.user', 'efootballId profile')
        .sort({ 'schedule': 1 });

        res.json({
            success: true,
            matches
        });
    } catch (error) {
        console.error('Get upcoming matches error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch upcoming matches',
            error: error.message
        });
    }
});

module.exports = router;
