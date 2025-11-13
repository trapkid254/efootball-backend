const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    whatsapp: {
        type: String,
        required: [true, 'WhatsApp number is required'],
        unique: true,
        trim: true,
        validate: {
            validator: function(v) {
                return /^(07\d{8}|2547\d{8}|\+2547\d{8})$/.test(v.replace(/\s/g, ''));
            },
            message: 'Please provide a valid WhatsApp number'
        }
    },
    efootballId: {
        type: String,
        required: [true, 'Efootball ID is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Efootball ID must be at least 3 characters'],
        maxlength: [20, 'Efootball ID cannot exceed 20 characters']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    avatar: {
        type: String,
        default: null
    },
    profile: {
        displayName: {
            type: String,
            trim: true
        },
        location: {
            type: String,
            trim: true
        },
        bio: {
            type: String,
            maxlength: 500
        }
    },
    stats: {
        matchesPlayed: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        draws: { type: Number, default: 0 },
        winRate: { type: Number, default: 0 },
        points: { type: Number, default: 0 },
        ranking: { type: Number, default: 0 }
    },
    role: {
        type: String,
        enum: ['user', 'player', 'admin'],
        default: 'user'
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    }
}, {
    timestamps: true
});

// Indexes for better query performance
userSchema.index({ whatsapp: 1 });
userSchema.index({ efootballId: 1 });
userSchema.index({ 'stats.points': -1 });
userSchema.index({ role: 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        console.log('Comparing passwords...');
        console.log('Candidate password length:', candidatePassword ? candidatePassword.length : 'undefined');
        console.log('Stored password hash exists:', !!this.password);
        
        if (!candidatePassword) {
            console.error('No candidate password provided');
            return false;
        }
        
        if (!this.password) {
            console.error('No stored password hash found for user');
            return false;
        }
        
        const isMatch = await bcrypt.compare(candidatePassword, this.password);
        console.log('Password comparison result:', isMatch);
        return isMatch;
    } catch (error) {
        console.error('Error comparing passwords:', error);
        return false;
    }
};

// Method to get public profile (exclude sensitive data)
userSchema.methods.toJSON = function() {
    const user = this.toObject();
    delete user.password;
    delete user.__v;
    return user;
};

// Static method to find by WhatsApp
userSchema.statics.findByWhatsApp = function(whatsapp) {
    return this.findOne({ whatsapp: whatsapp.trim() });
};

// Update stats method
userSchema.methods.updateStats = function(result) {
    this.stats.totalMatches += 1;
    
    if (result === 'win') {
        this.stats.wins += 1;
        this.stats.points += 3;
    } else if (result === 'loss') {
        this.stats.losses += 1;
    } else if (result === 'draw') {
        this.stats.draws += 1;
        this.stats.points += 1;
    }
    
    return this.save();
};

module.exports = mongoose.model('User', userSchema);