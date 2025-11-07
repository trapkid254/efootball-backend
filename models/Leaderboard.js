const mongoose = require('mongoose');

const leaderboardSchema = new mongoose.Schema({
    player: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    points: {
        type: Number,
        default: 0,
        min: 0
    },
    wins: {
        type: Number,
        default: 0,
        min: 0
    },
    losses: {
        type: Number,
        default: 0,
        min: 0
    },
    draws: {
        type: Number,
        default: 0,
        min: 0
    },
    totalMatches: {
        type: Number,
        default: 0,
        min: 0
    },
    winRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    rank: {
        type: Number,
        default: 0,
        min: 1
    },
    previousRank: {
        type: Number,
        default: 0
    },
    rankChange: {
        type: Number,
        default: 0
    },
    type: {
        type: String,
        enum: ['global', 'monthly', 'weekly', 'tournament'],
        default: 'global'
    },
    period: {
        type: String, // e.g., "2024-01" for monthly, "2024-W02" for weekly
        default: 'global'
    },
    tournament: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tournament'
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound indexes for efficient queries
leaderboardSchema.index({ type: 1, period: 1, points: -1 });
leaderboardSchema.index({ type: 1, period: 1, player: 1 });
leaderboardSchema.index({ player: 1, type: 1 });

// Pre-save middleware to calculate win rate and rank change
leaderboardSchema.pre('save', function(next) {
    // Calculate win rate
    if (this.totalMatches > 0) {
        this.winRate = ((this.wins / this.totalMatches) * 100);
    }
    
    // Calculate rank change
    if (this.previousRank > 0) {
        this.rankChange = this.previousRank - this.rank;
    }
    
    this.lastUpdated = new Date();
    next();
});

// Static method to get leaderboard by type and period
leaderboardSchema.statics.getLeaderboard = function(type = 'global', period = 'global', limit = 100, page = 1) {
    const skip = (page - 1) * limit;
    
    return this.find({ type, period })
        .populate('player', 'efootballId profile stats')
        .sort({ points: -1, wins: -1, winRate: -1 })
        .skip(skip)
        .limit(limit);
};

// Static method to get player's position
leaderboardSchema.statics.getPlayerPosition = function(playerId, type = 'global', period = 'global') {
    return this.findOne({ player: playerId, type, period })
        .populate('player', 'efootballId profile stats');
};

// Static method to update player stats
leaderboardSchema.statics.updatePlayerStats = async function(playerId, matchResult, type = 'global', period = 'global') {
    const leaderboard = await this.findOne({ player: playerId, type, period });
    
    if (!leaderboard) {
        // Create new leaderboard entry
        const newLeaderboard = new this({
            player: playerId,
            type,
            period
        });
        return this.updateStatsForMatch(newLeaderboard, matchResult);
    }
    
    return this.updateStatsForMatch(leaderboard, matchResult);
};

// Helper method to update stats for a match
leaderboardSchema.statics.updateStatsForMatch = async function(leaderboard, matchResult) {
    leaderboard.totalMatches += 1;
    
    switch (matchResult) {
        case 'win':
            leaderboard.wins += 1;
            leaderboard.points += 3;
            break;
        case 'loss':
            leaderboard.losses += 1;
            break;
        case 'draw':
            leaderboard.draws += 1;
            leaderboard.points += 1;
            break;
    }
    
    await leaderboard.save();
    await this.updateRanks(leaderboard.type, leaderboard.period);
    
    return leaderboard;
};

// Static method to update all ranks for a leaderboard type/period
leaderboardSchema.statics.updateRanks = async function(type, period) {
    const entries = await this.find({ type, period })
        .sort({ points: -1, wins: -1, winRate: -1 });
    
    const bulkOps = entries.map((entry, index) => ({
        updateOne: {
            filter: { _id: entry._id },
            update: {
                $set: {
                    previousRank: entry.rank,
                    rank: index + 1
                }
            }
        }
    }));
    
    if (bulkOps.length > 0) {
        await this.bulkWrite(bulkOps);
    }
};

// Method to get rank trend
leaderboardSchema.methods.getRankTrend = function() {
    if (this.rankChange === 0) return 'stable';
    return this.rankChange > 0 ? 'up' : 'down';
};

// Virtual for display name
leaderboardSchema.virtual('displayRank').get(function() {
    if (this.rank <= 0) return '-';
    return `#${this.rank}`;
});

module.exports = mongoose.model('Leaderboard', leaderboardSchema);