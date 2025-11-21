const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const User = require('../models/Users');

// @route   GET /api/leaderboard
// @desc    Get leaderboard data
// @access  Public/Private (depending on tournament)
router.get('/', async (req, res) => {
    try {
        const { tournamentId, page = 1, limit = 20 } = req.query;

        let leaderboard = [];

        if (tournamentId && tournamentId !== 'global') {
            // Tournament-specific leaderboard
            const tournament = await Tournament.findById(tournamentId)
                .populate('participants.player', 'efootballId profile');

            if (!tournament) {
                return res.status(404).json({
                    success: false,
                    message: 'Tournament not found'
                });
            }

            // Get all completed matches for this tournament
            const matches = await Match.find({
                tournament: tournamentId,
                status: 'completed'
            }).populate('player1.user player2.user', 'efootballId profile');

            // Calculate stats for each participant
            const participantStats = {};

            tournament.participants.forEach(participant => {
                if (participant.status === 'registered') {
                    participantStats[participant.player._id.toString()] = {
                        _id: participant.player._id,
                        efootballId: participant.player.efootballId,
                        matchesPlayed: 0,
                        wins: 0,
                        draws: 0,
                        losses: 0,
                        goalsFor: 0,
                        goalsAgainst: 0,
                        points: 0
                    };
                }
            });

            // Process matches
            matches.forEach(match => {
                const player1Id = match.player1.user._id.toString();
                const player2Id = match.player2.user._id.toString();

                if (participantStats[player1Id] && participantStats[player2Id]) {
                    participantStats[player1Id].matchesPlayed++;
                    participantStats[player2Id].matchesPlayed++;

                    participantStats[player1Id].goalsFor += match.player1.score || 0;
                    participantStats[player1Id].goalsAgainst += match.player2.score || 0;
                    participantStats[player2Id].goalsFor += match.player2.score || 0;
                    participantStats[player2Id].goalsAgainst += match.player1.score || 0;

                    if (match.result.isDraw) {
                        participantStats[player1Id].draws++;
                        participantStats[player2Id].draws++;
                        participantStats[player1Id].points += 1;
                        participantStats[player2Id].points += 1;
                    } else if (match.result.winner.toString() === player1Id) {
                        participantStats[player1Id].wins++;
                        participantStats[player2Id].losses++;
                        participantStats[player1Id].points += 3;
                    } else {
                        participantStats[player2Id].wins++;
                        participantStats[player1Id].losses++;
                        participantStats[player2Id].points += 3;
                    }
                }
            });

            leaderboard = Object.values(participantStats);

        } else {
            // Global leaderboard - aggregate all tournaments
            const allMatches = await Match.find({
                status: 'completed'
            }).populate('player1.user player2.user', 'efootballId profile');

            const globalStats = {};

            allMatches.forEach(match => {
                const player1Id = match.player1.user._id.toString();
                const player2Id = match.player2.user._id.toString();

                // Initialize players if not exists
                if (!globalStats[player1Id]) {
                    globalStats[player1Id] = {
                        _id: match.player1.user._id,
                        efootballId: match.player1.user.efootballId,
                        matchesPlayed: 0,
                        wins: 0,
                        draws: 0,
                        losses: 0,
                        goalsFor: 0,
                        goalsAgainst: 0,
                        points: 0
                    };
                }
                if (!globalStats[player2Id]) {
                    globalStats[player2Id] = {
                        _id: match.player2.user._id,
                        efootballId: match.player2.user.efootballId,
                        matchesPlayed: 0,
                        wins: 0,
                        draws: 0,
                        losses: 0,
                        goalsFor: 0,
                        goalsAgainst: 0,
                        points: 0
                    };
                }

                globalStats[player1Id].matchesPlayed++;
                globalStats[player2Id].matchesPlayed++;

                globalStats[player1Id].goalsFor += match.player1.score || 0;
                globalStats[player1Id].goalsAgainst += match.player2.score || 0;
                globalStats[player2Id].goalsFor += match.player2.score || 0;
                globalStats[player2Id].goalsAgainst += match.player1.score || 0;

                if (match.result.isDraw) {
                    globalStats[player1Id].draws++;
                    globalStats[player2Id].draws++;
                    globalStats[player1Id].points += 1;
                    globalStats[player2Id].points += 1;
                } else if (match.result.winner.toString() === player1Id) {
                    globalStats[player1Id].wins++;
                    globalStats[player2Id].losses++;
                    globalStats[player1Id].points += 3;
                } else {
                    globalStats[player2Id].wins++;
                    globalStats[player1Id].losses++;
                    globalStats[player2Id].points += 3;
                }
            });

            leaderboard = Object.values(globalStats);
        }

        // Sort leaderboard: points (desc), then goal difference (desc), then goals for (desc)
        leaderboard.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;

            const goalDiffA = a.goalsFor - a.goalsAgainst;
            const goalDiffB = b.goalsFor - b.goalsAgainst;
            if (goalDiffB !== goalDiffA) return goalDiffB - goalDiffA;

            return b.goalsFor - a.goalsFor;
        });

        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedLeaderboard = leaderboard.slice(startIndex, endIndex);

        res.json({
            success: true,
            leaderboard: paginatedLeaderboard,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: leaderboard.length,
                pages: Math.ceil(leaderboard.length / limit)
            }
        });

    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch leaderboard',
            error: error.message
        });
    }
});

// @route   GET /api/leaderboard/position
// @desc    Get user's position in leaderboard
// @access  Private
router.get('/position', auth, async (req, res) => {
    try {
        const { userId } = req.query;
        const targetUserId = userId || req.user.id;

        // Get all completed matches
        const allMatches = await Match.find({
            status: 'completed'
        }).populate('player1.user player2.user', 'efootballId profile');

        const globalStats = {};

        allMatches.forEach(match => {
            const player1Id = match.player1.user._id.toString();
            const player2Id = match.player2.user._id.toString();

            if (!globalStats[player1Id]) {
                globalStats[player1Id] = {
                    _id: match.player1.user._id,
                    efootballId: match.player1.user.efootballId,
                    matchesPlayed: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                    goalsFor: 0,
                    goalsAgainst: 0,
                    points: 0
                };
            }
            if (!globalStats[player2Id]) {
                globalStats[player2Id] = {
                    _id: match.player2.user._id,
                    efootballId: match.player2.user.efootballId,
                    matchesPlayed: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                    goalsFor: 0,
                    goalsAgainst: 0,
                    points: 0
                };
            }

            globalStats[player1Id].matchesPlayed++;
            globalStats[player2Id].matchesPlayed++;

            globalStats[player1Id].goalsFor += match.player1.score || 0;
            globalStats[player1Id].goalsAgainst += match.player2.score || 0;
            globalStats[player2Id].goalsFor += match.player2.score || 0;
            globalStats[player2Id].goalsAgainst += match.player1.score || 0;

            if (match.result.isDraw) {
                globalStats[player1Id].draws++;
                globalStats[player2Id].draws++;
                globalStats[player1Id].points += 1;
                globalStats[player2Id].points += 1;
            } else if (match.result.winner.toString() === player1Id) {
                globalStats[player1Id].wins++;
                globalStats[player2Id].losses++;
                globalStats[player1Id].points += 3;
            } else {
                globalStats[player2Id].wins++;
                globalStats[player1Id].losses++;
                globalStats[player2Id].points += 3;
            }
        });

        const leaderboard = Object.values(globalStats);

        // Sort leaderboard
        leaderboard.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;

            const goalDiffA = a.goalsFor - a.goalsAgainst;
            const goalDiffB = b.goalsFor - b.goalsAgainst;
            if (goalDiffB !== goalDiffA) return goalDiffB - goalDiffA;

            return b.goalsFor - a.goalsFor;
        });

        const userPosition = leaderboard.findIndex(player => player._id.toString() === targetUserId);
        const userStats = leaderboard[userPosition];

        if (!userStats) {
            return res.json({
                success: true,
                position: null
            });
        }

        res.json({
            success: true,
            position: {
                rank: userPosition + 1,
                ...userStats
            }
        });

    } catch (error) {
        console.error('User position error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user position',
            error: error.message
        });
    }
});

module.exports = router;