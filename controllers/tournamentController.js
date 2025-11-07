const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const User = require('../models/Users');

class TournamentController {
    // Create new tournament
    static async createTournament(req, res) {
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
    }

    // Get all tournaments with filtering and pagination
    static async getTournaments(req, res) {
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
    }

    // Get single tournament with details
    static async getTournament(req, res) {
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
    }

    // Update tournament
    static async updateTournament(req, res) {
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
    }

    // Join tournament
    static async joinTournament(req, res) {
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
    }

    // Leave tournament
    static async leaveTournament(req, res) {
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
    }

    // Generate tournament fixtures
    static async generateFixtures(req, res) {
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
                    message: 'Can only generate fixtures for upcoming tournaments'
                });
            }

            const participants = tournament.participants.filter(p => p.status === 'registered');
            
            if (participants.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Need at least 2 participants to generate fixtures'
                });
            }

            // Generate matches based on tournament format
            const matches = await this.generateMatches(tournament, participants);
            
            res.json({
                success: true,
                message: 'Fixtures generated successfully',
                matches
            });

        } catch (error) {
            console.error('Generate fixtures error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate fixtures',
                error: error.message
            });
        }
    }

    // Helper method to generate matches
    static async generateMatches(tournament, participants) {
        const matches = [];
        let matchNumber = 1;

        // Simple knockout bracket generation
        if (tournament.format === 'knockout') {
            const shuffled = [...participants].sort(() => Math.random() - 0.5);
            
            for (let i = 0; i < shuffled.length; i += 2) {
                if (i + 1 < shuffled.length) {
                    const match = new Match({
                        tournament: tournament._id,
                        round: 'Round of 16',
                        matchNumber: matchNumber++,
                        player1: { user: shuffled[i].player },
                        player2: { user: shuffled[i + 1].player },
                        scheduledTime: tournament.schedule.tournamentStart
                    });
                    matches.push(await match.save());
                }
            }
        }

        return matches;
    }

    // Get tournament standings
    static async getStandings(req, res) {
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

                const goalsFor = playerMatches.reduce((total, match) => {
                    if (match.player1.user.toString() === participant.player._id.toString()) {
                        return total + (match.player1.score || 0);
                    } else {
                        return total + (match.player2.score || 0);
                    }
                }, 0);

                const goalsAgainst = playerMatches.reduce((total, match) => {
                    if (match.player1.user.toString() === participant.player._id.toString()) {
                        return total + (match.player2.score || 0);
                    } else {
                        return total + (match.player1.score || 0);
                    }
                }, 0);

                return {
                    player: participant.player,
                    matches: playerMatches.length,
                    wins,
                    losses,
                    draws,
                    points: wins * 3 + draws,
                    goalsFor,
                    goalsAgainst,
                    goalDifference: goalsFor - goalsAgainst
                };
            }).sort((a, b) => {
                // Sort by points, then goal difference, then goals for
                if (b.points !== a.points) return b.points - a.points;
                if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
                return b.goalsFor - a.goalsFor;
            });

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
    }
}

module.exports = TournamentController;