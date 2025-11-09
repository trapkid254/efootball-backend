const mongoose = require('mongoose');
const { generateFixtures, updateTournamentLeaderboard, generateNextKnockoutRound } = require('../utils/fixtureGenerator');

const tournamentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Tournament name is required'],
        trim: true,
        maxlength: [100, 'Tournament name cannot exceed 100 characters']
    },
    description: {
        type: String,
        required: [true, 'Tournament description is required'],
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    banner: {
        type: String,
        default: null
    },
    organizer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    format: {
        type: String,
        enum: ['knockout', 'group', 'group+knockout', 'league'],
        required: true
    },
    status: {
        type: String,
        enum: ['draft', 'upcoming', 'active', 'completed', 'cancelled'],
        default: 'draft'
    },
    settings: {
        capacity: {
            type: Number,
            required: true,
            min: [2, 'Tournament must have at least 2 players'],
            max: [128, 'Tournament cannot exceed 128 players']
        },
        entryFee: {
            type: Number,
            default: 0,
            min: 0
        },
        prizePool: {
            type: Number,
            required: true,
            min: 0
        },
        prizeDistribution: [{
            position: Number,
            amount: Number,
            description: String
        }],
        rules: {
            type: String,
            default: 'Standard Efootball rules apply'
        },
        matchDuration: {
            type: Number,
            default: 10 // minutes
        },
        platforms: {
            type: [String],
            default: ['mobile'],
            enum: ['mobile', 'console']
        }
    },
    schedule: {
        registrationStart: Date,
        registrationEnd: Date,
        tournamentStart: Date,
        tournamentEnd: Date
    },
    participants: [{
        player: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        },
        status: {
            type: String,
            enum: ['registered', 'checked-in', 'disqualified'],
            default: 'registered'
        },
        seed: Number,
        stats: {
            matchesPlayed: {
                type: Number,
                default: 0
            },
            wins: {
                type: Number,
                default: 0
            },
            draws: {
                type: Number,
                default: 0
            },
            losses: {
                type: Number,
                default: 0
            },
            goalsFor: {
                type: Number,
                default: 0
            },
            goalsAgainst: {
                type: Number,
                default: 0
            },
            points: {
                type: Number,
                default: 0
            }
        }
    }],
    groups: [{
        name: String,
        players: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        matches: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Match'
        }]
    }],
    knockoutRounds: [{
        round: Number,
        name: String,
        matches: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Match'
        }]
    }],
    winners: [{
        position: Number,
        player: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        prize: Number
    }],
    isPublic: {
        type: Boolean,
        default: true
    },
    requiresApproval: {
        type: Boolean,
        default: false
    },
    fixtureSettings: {
        matchesPerDay: {
            type: Number,
            default: 3
        },
        matchDuration: {
            type: Number,
            default: 30
        },
        breakBetweenMatches: {
            type: Number,
            default: 15
        },
        startTime: {
            type: String,
            default: '18:00'
        },
        daysOfWeek: {
            type: [Number],
            default: [5, 6]
        }
    },
    leaderboardSettings: {
        pointsForWin: {
            type: Number,
            default: 3
        },
        pointsForDraw: {
            type: Number,
            default: 1
        },
        pointsForLoss: {
            type: Number,
            default: 0
        },
        sortBy: {
            type: String,
            enum: ['points', 'goalDifference', 'goalsFor', 'alphabetical'],
            default: 'points'
        },
        tiebreakers: {
            type: [String],
            default: ['points', 'goalDifference', 'goalsFor', 'headToHead']
        }
    }
}, {
    timestamps: true
});

// Indexes
tournamentSchema.index({ status: 1 });
tournamentSchema.index({ 'schedule.tournamentStart': 1 });
tournamentSchema.index({ organizer: 1 });
tournamentSchema.index({ 'settings.entryFee': 1 });

// Virtual for current participants count
tournamentSchema.virtual('participantCount').get(function() {
    return this.participants.filter(p => p.status === 'registered').length;
});

// Virtual for available slots
tournamentSchema.virtual('availableSlots').get(function() {
    return this.settings.capacity - this.participantCount;
});

// Virtual for registration status
tournamentSchema.virtual('registrationStatus').get(function() {
    const now = new Date();
    if (this.schedule.registrationStart && now < this.schedule.registrationStart) {
        return 'not_started';
    }
    if (this.schedule.registrationEnd && now > this.schedule.registrationEnd) {
        return 'ended';
    }
    if (this.participantCount >= this.settings.capacity) {
        return 'full';
    }
    return 'open';
});

// Method to add participant
tournamentSchema.methods.addParticipant = function(userId) {
    if (this.participants.some(p => p.player.toString() === userId.toString())) {
        throw new Error('Player already registered for this tournament');
    }
    
    if (this.participantCount >= this.settings.capacity) {
        throw new Error('Tournament is full');
    }
    
    this.participants.push({
        player: userId,
        seed: this.participantCount + 1,
        stats: {
            matchesPlayed: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0
        }
    });
    
    // Check if we've reached capacity and need to generate fixtures
    if (this.participantCount + 1 === this.settings.capacity && this.format !== 'league') {
        this.generateFixtures();
    }
    
    return this.save();
};

// Method to remove participant
tournamentSchema.methods.removeParticipant = function(userId) {
    const participantIndex = this.participants.findIndex(
        p => p.player.toString() === userId.toString()
    );
    
    if (participantIndex === -1) {
        throw new Error('Player not registered for this tournament');
    }
    
    this.participants.splice(participantIndex, 1);
    return this.save();
};

// Static method to find active tournaments
tournamentSchema.statics.findActive = function() {
    return this.find({
        status: { $in: ['upcoming', 'active'] },
        'schedule.tournamentStart': { $lte: new Date() },
        'schedule.tournamentEnd': { $gte: new Date() }
    }).populate('participants.player', 'efootballId profile');
};

// Pre-save middleware to update status based on dates
tournamentSchema.pre('save', function(next) {
    const now = new Date();
    
    if (this.schedule.tournamentStart && now >= this.schedule.tournamentStart) {
        this.status = 'active';
    }
    
    if (this.schedule.tournamentEnd && now > this.schedule.tournamentEnd) {
        this.status = 'completed';
    }
    
    next();
});

/**
 * Generate fixtures for the tournament
 * @returns {Promise} Resolves when fixtures are generated
 */
tournamentSchema.methods.generateFixtures = async function() {
    if (this.status === 'completed') {
        throw new Error('Cannot generate fixtures for a completed tournament');
    }
    
    if (this.participantCount < 2) {
        throw new Error('Need at least 2 participants to generate fixtures');
    }
    
    // Generate fixtures using the fixture generator
    const matches = await generateFixtures(this);
    
    // Save matches and update tournament
    const savedMatches = await Match.insertMany(matches);
    this.matches = savedMatches.map(match => match._id);
    this.status = 'upcoming';
    
    return this.save();
};

/**
 * Update the tournament leaderboard
 * @returns {Promise} Resolves with the updated tournament
 */
tournamentSchema.methods.updateLeaderboard = async function() {
    return updateTournamentLeaderboard(this._id);
};

/**
 * Generate the next round of a knockout tournament
 * @returns {Promise} Resolves with the updated tournament
 */
tournamentSchema.methods.generateNextKnockoutRound = async function() {
    if (this.format !== 'knockout' && this.format !== 'group+knockout') {
        throw new Error('Can only generate knockout rounds for knockout tournaments');
    }
    
    return generateNextKnockoutRound(this._id);
};

/**
 * Get the current leaderboard for the tournament
 * @returns {Array} Sorted array of participants with their stats
 */
tournamentSchema.methods.getLeaderboard = function() {
    return [...this.participants].sort((a, b) => {
        // Sort by points (descending)
        if (a.stats.points !== b.stats.points) {
            return b.stats.points - a.stats.points;
        }
        
        // If points are equal, use tiebreakers
        for (const tiebreaker of this.leaderboardSettings.tiebreakers) {
            switch (tiebreaker) {
                case 'goalDifference':
                    const diffA = a.stats.goalsFor - a.stats.goalsAgainst;
                    const diffB = b.stats.goalsFor - b.stats.goalsAgainst;
                    if (diffA !== diffB) return diffB - diffA;
                    break;
                    
                case 'goalsFor':
                    if (a.stats.goalsFor !== b.stats.goalsFor) {
                        return b.stats.goalsFor - a.stats.goalsFor;
                    }
                    break;
                    
                case 'headToHead':
                    // In a real app, we'd check head-to-head results
                    // For now, we'll just use a random value
                    return Math.random() - 0.5;
                    
                case 'alphabetical':
                    return a.player.efootballId.localeCompare(b.player.efootballId);
            }
        }
        
        return 0;
    });
};

module.exports = mongoose.model('Tournament', tournamentSchema);