const mongoose = require('mongoose');

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
        seed: Number
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
        seed: this.participantCount + 1
    });
    
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
    
    if (this.schedule.tournamentEnd && now >= this.schedule.tournamentEnd) {
        this.status = 'completed';
    }
    
    next();
});

module.exports = mongoose.model('Tournament', tournamentSchema);