const express = require('express');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const upload = require('../middleware/upload');
const router = express.Router();

// @route   GET /api/matches/my-matches
// @desc    Get current user's matches
// @access  Private
router.get('/my-matches', auth, async (req, res) => {
    try {
        const matches = await Match.find({
            $or: [
                { 'player1.user': req.user.id },
                { 'player2.user': req.user.id }
            ]
        })
        .populate('tournament', 'name format')
        .populate('player1.user player2.user', 'efootballId profile')
        .sort({ scheduledTime: 1 });

        res.json({
            success: true,
            matches
        });

    } catch (error) {
        console.error('Get matches error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch matches',
            error: error.message
        });
    }
});

// @route   GET /api/matches/tournament/:tournamentId
// @desc    Get matches for a specific tournament
// @access  Public
router.get('/tournament/:tournamentId', async (req, res) => {
    try {
        const matches = await Match.find({
            tournament: req.params.tournamentId
        })
        .populate('player1.user player2.user', 'efootballId profile')
        .sort({ matchNumber: 1 });

        res.json({
            success: true,
            matches
        });

    } catch (error) {
        console.error('Get tournament matches error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tournament matches',
            error: error.message
        });
    }
});

// @route   POST /api/matches/:id/submit-score
// @desc    Submit match score
// @access  Private
router.post('/:id/submit-score', auth, upload.single('screenshot'), async (req, res) => {
    try {
        const match = await Match.findById(req.params.id)
            .populate('player1.user player2.user', 'efootballId');
        
        if (!match) {
            return res.status(404).json({
                success: false,
                message: 'Match not found'
            });
        }

        const { score } = req.body;
        const screenshot = req.file ? req.file.path : null;

        // Check if user is a player in this match
        const isPlayer1 = match.player1.user._id.toString() === req.user.id;
        const isPlayer2 = match.player2.user._id.toString() === req.user.id;

        if (!isPlayer1 && !isPlayer2) {
            return res.status(403).json({
                success: false,
                message: 'You are not a player in this match'
            });
        }

        // Submit score
        await match.submitScore(req.user.id, parseInt(score), screenshot);

        await match.populate('player1.user player2.user', 'efootballId profile');

        res.json({
            success: true,
            message: 'Score submitted successfully',
            match
        });

    } catch (error) {
        console.error('Submit score error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit score',
            error: error.message
        });
    }
});

// @route   POST /api/matches/:id/verify
// @desc    Verify match result (Admin only)
// @access  Private (Admin)
router.post('/:id/verify', adminAuth, async (req, res) => {
    try {
        const match = await Match.findById(req.params.id);
        
        if (!match) {
            return res.status(404).json({
                success: false,
                message: 'Match not found'
            });
        }

        await match.verifyResult(req.user.id);
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

// @route   PUT /api/matches/:id/reschedule
// @desc    Reschedule match
// @access  Private
router.put('/:id/reschedule', auth, async (req, res) => {
    try {
        const { newTime } = req.body;
        const match = await Match.findById(req.params.id);
        
        if (!match) {
            return res.status(404).json({
                success: false,
                message: 'Match not found'
            });
        }

        // Check if user is a player in this match
        const isPlayer = match.player1.user.toString() === req.user.id || 
                         match.player2.user.toString() === req.user.id;

        if (!isPlayer) {
            return res.status(403).json({
                success: false,
                message: 'You are not a player in this match'
            });
        }

        match.scheduledTime = new Date(newTime);
        await match.save();

        await match.populate('player1.user player2.user', 'efootballId profile');

        res.json({
            success: true,
            message: 'Match rescheduled successfully',
            match
        });

    } catch (error) {
        console.error('Reschedule match error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reschedule match',
            error: error.message
        });
    }
});

// @route   GET /api/matches/pending
// @desc    Get pending matches for admin review
// @access  Private (Admin)
router.get('/admin/pending', adminAuth, async (req, res) => {
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
        console.error('Get pending matches error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending matches',
            error: error.message
        });
    }
});

module.exports = router;