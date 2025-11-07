const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const Leaderboard = require('../models/Leaderboard');

class MatchController {
    // Get user's matches
    static async getUserMatches(req, res) {
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
            console.error('Get user matches error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch matches',
                error: error.message
            });
        }
    }

    // Submit match score
    static async submitScore(req, res) {
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
    }

    // Verify match result (Admin)
    static async verifyResult(req, res) {
        try {
            const match = await Match.findById(req.params.id);
            
            if (!match) {
                return res.status(404).json({
                    success: false,
                    message: 'Match not found'
                });
            }

            await match.verifyResult(req.user.id);
            
            // Update player stats and leaderboard
            await this.updatePlayerStats(match);

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
    }

    // Update player stats after match verification
    static async updatePlayerStats(match) {
        try {
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
        } catch (error) {
            console.error('Update player stats error:', error);
            throw error;
        }
    }

    // Reschedule match
    static async rescheduleMatch(req, res) {
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
    }

    // Get matches for tournament
    static async getTournamentMatches(req, res) {
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
    }

    // Get pending matches for admin review
    static async getPendingMatches(req, res) {
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
    }

    // Create match (Admin)
    static async createMatch(req, res) {
        try {
            const { tournamentId, player1, player2, scheduledTime, round } = req.body;

            const tournament = await Tournament.findById(tournamentId);
            if (!tournament) {
                return res.status(404).json({
                    success: false,
                    message: 'Tournament not found'
                });
            }

            // Get next match number
            const lastMatch = await Match.findOne({ tournament: tournamentId })
                .sort({ matchNumber: -1 });
            const matchNumber = lastMatch ? lastMatch.matchNumber + 1 : 1;

            const match = new Match({
                tournament: tournamentId,
                round: round || 'Group Stage',
                matchNumber,
                player1: { user: player1 },
                player2: { user: player2 },
                scheduledTime: new Date(scheduledTime)
            });

            await match.save();
            await match.populate('player1.user player2.user', 'efootballId profile');

            res.status(201).json({
                success: true,
                message: 'Match created successfully',
                match
            });

        } catch (error) {
            console.error('Create match error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create match',
                error: error.message
            });
        }
    }

    // Update match (Admin)
    static async updateMatch(req, res) {
        try {
            const match = await Match.findById(req.params.id);
            
            if (!match) {
                return res.status(404).json({
                    success: false,
                    message: 'Match not found'
                });
            }

            // Update match fields
            Object.keys(req.body).forEach(key => {
                if (['scheduledTime', 'round', 'adminNotes'].includes(key)) {
                    match[key] = req.body[key];
                }
            });

            await match.save();
            await match.populate('player1.user player2.user', 'efootballId profile');

            res.json({
                success: true,
                message: 'Match updated successfully',
                match
            });

        } catch (error) {
            console.error('Update match error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update match',
                error: error.message
            });
        }
    }
}

module.exports = MatchController;