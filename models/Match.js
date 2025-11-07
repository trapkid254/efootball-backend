const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
    tournament: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tournament',
        required: true
    },
    round: {
        type: String,
        required: true
    },
    matchNumber: {
        type: Number,
        required: true
    },
    player1: {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        score: {
            type: Number,
            default: null
        },
        screenshot: {
            type: String,
            default: null
        },
        confirmed: {
            type: Boolean,
            default: false
        }
    },
    player2: {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        score: {
            type: Number,
            default: null
        },
        screenshot: {
            type: String,
            default: null
        },
        confirmed: {
            type: Boolean,
            default: false
        }
    },
    scheduledTime: {
        type: Date,
        required: true
    },
    actualStartTime: Date,
    actualEndTime: Date,
    status: {
        type: String,
        enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'disputed'],
        default: 'scheduled'
    },
    result: {
        winner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        loser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        isDraw: {
            type: Boolean,
            default: false
        },
        confirmedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        confirmedAt: Date
    },
    disputes: [{
        raisedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reason: String,
        description: String,
        status: {
            type: String,
            enum: ['open', 'under_review', 'resolved', 'rejected'],
            default: 'open'
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        resolution: String,
        createdAt: {
            type: Date,
            default: Date.now
        },
        resolvedAt: Date
    }],
    adminNotes: String
}, {
    timestamps: true
});

// Indexes
matchSchema.index({ tournament: 1, matchNumber: 1 });
matchSchema.index({ 'player1.user': 1 });
matchSchema.index({ 'player2.user': 1 });
matchSchema.index({ status: 1 });
matchSchema.index({ scheduledTime: 1 });

// Virtual for match display name
matchSchema.virtual('displayName').get(function() {
    return `Match ${this.matchNumber} - ${this.round}`;
});

// Method to submit score
matchSchema.methods.submitScore = function(player, score, screenshot = null) {
    const playerField = this.player1.user.toString() === player.toString() ? 'player1' : 'player2';
    
    this[playerField].score = score;
    if (screenshot) {
        this[playerField].screenshot = screenshot;
    }
    this[playerField].confirmed = true;
    
    // If both players have submitted scores, auto-verify if they match
    if (this.player1.confirmed && this.player2.confirmed) {
        if (this.player1.score === this.player2.score) {
            this.verifyResult();
        } else {
            this.status = 'disputed';
        }
    }
    
    return this.save();
};

// Method to verify result (admin only)
matchSchema.methods.verifyResult = function(adminId) {
    if (this.player1.score === null || this.player2.score === null) {
        throw new Error('Both players must have submitted scores');
    }
    
    if (this.player1.score > this.player2.score) {
        this.result.winner = this.player1.user;
        this.result.loser = this.player2.user;
        this.result.isDraw = false;
    } else if (this.player2.score > this.player1.score) {
        this.result.winner = this.player2.user;
        this.result.loser = this.player1.user;
        this.result.isDraw = false;
    } else {
        this.result.isDraw = true;
    }
    
    this.result.confirmedBy = adminId;
    this.result.confirmedAt = new Date();
    this.status = 'completed';
    
    return this.save();
};

// Static method to find matches by player
matchSchema.statics.findByPlayer = function(playerId) {
    return this.find({
        $or: [
            { 'player1.user': playerId },
            { 'player2.user': playerId }
        ]
    }).populate('player1.user player2.user tournament', 'efootballId profile name');
};

// Static method to find upcoming matches
matchSchema.statics.findUpcoming = function() {
    return this.find({
        status: 'scheduled',
        scheduledTime: { $gte: new Date() }
    }).populate('player1.user player2.user', 'efootballId profile');
};

module.exports = mongoose.model('Match', matchSchema);