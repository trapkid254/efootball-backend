const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const User = require('../models/Users');
const Leaderboard = require('../models/Leaderboard');
const { generateFixtures, updateTournamentLeaderboard } = require('../utils/fixtureGenerator');

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

    // Submit match score with detailed match data
    static async submitScore(req, res) {
        try {
            const match = await Match.findById(req.params.id)
                .populate('player1.user player2.user', 'efootballId profile')
                .populate('tournament');
            
            if (!match) {
                return res.status(404).json({
                    success: false,
                    message: 'Match not found'
                });
            }

            const { 
                score, 
                goals = [], 
                yellowCards = [], 
                redCards = [], 
                substitutions = [] 
            } = req.body;
            
            const screenshot = req.file ? req.file.path : null;

            // Check if user is a player in this match
            const isPlayer1 = match.player1.user._id.toString() === req.user.id;
            const isPlayer2 = match.player2.user._id.toString() === req.user.id;
            const playerField = isPlayer1 ? 'player1' : (isPlayer2 ? 'player2' : null);

            if (!playerField) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a player in this match'
                });
            }

            // Update match data
            match[playerField].score = parseInt(score);
            match[playerField].confirmed = true;
            if (screenshot) match[playerField].screenshot = screenshot;
            
            // Update detailed match stats if provided
            if (goals.length > 0) match[playerField].goals = goals;
            if (yellowCards.length > 0) match[playerField].yellowCards = yellowCards;
            if (redCards.length > 0) match[playerField].redCards = redCards;
            if (substitutions.length > 0) match[playerField].substitutions = substitutions;

            // Check if both players have submitted scores
            if (match.player1.confirmed && match.player2.confirmed) {
                // Auto-verify if scores match, otherwise mark as disputed
                if (match.player1.score === match.player2.score) {
                    await match.verifyResult(req.user.id);
                    await this.updateTournamentLeaderboard(match.tournament._id);
                } else {
                    match.status = 'disputed';
                }
            }

            await match.save();
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
            const match = await Match.findById(req.params.id)
                .populate('tournament');
            
            if (!match) {
                return res.status(404).json({
                    success: false,
                    message: 'Match not found'
                });
            }

            // If this is a tournament match, verify the result through the tournament
            if (match.tournament) {
                const tournament = await Tournament.findById(match.tournament._id);
                await tournament.updateLeaderboard();
                
                // If this is a knockout match and it's completed, generate next round
                if ((tournament.format === 'knockout' || tournament.format === 'group+knockout') && 
                    match.status === 'completed') {
                    await tournament.generateNextKnockoutRound();
                }
            }

            // Update the match status and result
            await match.verifyResult(req.user.id);
            
            // Update player stats and leaderboard
            await this.updatePlayerStats(match);
            
            // Update tournament leaderboard if this is a tournament match
            if (match.tournament) {
                await updateTournamentLeaderboard(match.tournament._id);
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
    }

    // Update player stats after match
    static async updatePlayerStats(match) {
        try {
            if (match.status !== 'completed' || !match.result) return;

            const { player1, player2, result } = match;
            
            // Update player 1 stats
            if (player1.user) {
                const user = await User.findById(player1.user._id);
                if (user) {
                    user.stats.matchesPlayed++;
                    
                    if (result.isDraw) {
                        user.stats.draws++;
                    } else if (result.winner && result.winner.equals(user._id)) {
                        user.stats.wins++;
                    } else {
                        user.stats.losses++;
                    }
                    
                    // Update goals
                    user.stats.goalsFor += player1.score || 0;
                    user.stats.goalsAgainst += player2.score || 0;
                    
                    // Update points based on result
                    if (result.isDraw) {
                        user.stats.points += 1;
                    } else if (result.winner && result.winner.equals(user._id)) {
                        user.stats.points += 3;
                    }
                    
                    await user.save();
                }
            }
        
            // Update player 2 stats
            if (player2.user) {
                const user = await User.findById(player2.user._id);
                if (user) {
                    user.stats.matchesPlayed++;
                    
                    if (result.isDraw) {
                        user.stats.draws++;
                    } else if (result.winner && result.winner.equals(user._id)) {
                        user.stats.wins++;
                    } else {
                        user.stats.losses++;
                    }
                    
                    // Update goals
                    user.stats.goalsFor += player2.score || 0;
                    user.stats.goalsAgainst += player1.score || 0;
                    
                    // Update points based on result
                    if (result.isDraw) {
                        user.stats.points += 1;
                    } else if (result.winner && result.winner.equals(user._id)) {
                        user.stats.points += 3;
                    }
                    
                    await user.save();
                }
            }
            
            // Update global leaderboard
            if (player1.user) {
                await Leaderboard.updatePlayerStats(
                    player1.user._id,
                    {
                        goals: player1.score || 0,
                        isWinner: result.winner && result.winner.equals(player1.user._id),
                        isDraw: result.isDraw
                    },
                    'global'
                );
            }
            
            if (player2.user) {
                await Leaderboard.updatePlayerStats(
                    player2.user._id,
                    {
                        goals: player2.score || 0,
                        isWinner: result.winner && result.winner.equals(player2.user._id),
                        isDraw: result.isDraw
                    },
                    'global'
                );
            }
            
            // If it's a draw, update both players' stats
            if (result.isDraw) {
                await Leaderboard.updatePlayerStats(match.player1.user._id, 'draw');
                await Leaderboard.updatePlayerStats(match.player2.user._id, 'draw');
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

    // Get tournament leaderboard
    static async getTournamentLeaderboard(req, res) {
        try {
            const { tournamentId } = req.params;
            
            const tournament = await Tournament.findById(tournamentId)
                .populate({
                    path: 'participants.player',
                    select: 'efootballId profile stats',
                    populate: {
                        path: 'profile',
                        select: 'avatar username'
                    }
                });
            
            if (!tournament) {
                return res.status(404).json({
                    success: false,
                    message: 'Tournament not found'
                });
            }
            
            // Get the sorted leaderboard
            const leaderboard = tournament.getLeaderboard();
            
            res.json({
                success: true,
                leaderboard: leaderboard.map((participant, index) => ({
                    position: index + 1,
                    player: participant.player,
                    matchesPlayed: participant.stats.matchesPlayed,
                    wins: participant.stats.wins,
                    draws: participant.stats.draws,
                    losses: participant.stats.losses,
                    goalsFor: participant.stats.goalsFor,
                    goalsAgainst: participant.stats.goalsAgainst,
                    goalDifference: participant.stats.goalsFor - participant.stats.goalsAgainst,
                    points: participant.stats.points
                })),
                tournament: {
                    _id: tournament._id,
                    name: tournament.name,
                    format: tournament.format,
                    status: tournament.status
                }
            });
            
        } catch (error) {
            console.error('Get tournament leaderboard error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch tournament leaderboard',
                error: error.message
            });
        }
    }
    
    // Get tournament fixtures
    static async getTournamentFixtures(req, res) {
        try {
            const { tournamentId } = req.params;
            const { status, round } = req.query;
            
            const query = { tournament: tournamentId };
            if (status) query.status = status;
            if (round) query.round = round;
            
            const matches = await Match.find(query)
                .populate('player1.user player2.user', 'efootballId profile')
                .sort({ scheduledTime: 1 });
                
            // Group matches by round
            const fixtures = matches.reduce((acc, match) => {
                if (!acc[match.round]) {
                    acc[match.round] = [];
                }
                acc[match.round].push(match);
                return acc;
            }, {});
            
            res.json({
                success: true,
                fixtures
            });
            
        } catch (error) {
            console.error('Get tournament fixtures error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch tournament fixtures',
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