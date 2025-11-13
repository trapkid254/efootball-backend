const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tona-kikwetu';

async function resetAdminPassword() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');

        // Get the User model
        const User = require('../models/Users');
        
        // Define the admin's WhatsApp number (with country code)
        const adminWhatsapp = '254714003218';
        const newPassword = '#Okwonkwo254';
        
        // Hash the new password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // Update the admin user
        const result = await User.findOneAndUpdate(
            { whatsapp: adminWhatsapp },
            { 
                $set: { 
                    password: hashedPassword,
                    isVerified: true,
                    isActive: true,
                    role: 'admin'
                },
                $setOnInsert: {
                    whatsapp: adminWhatsapp,
                    efootballId: '12345',
                    profile: {
                        displayName: 'Admin User'
                    },
                    stats: {
                        matchesPlayed: 0,
                        wins: 0,
                        losses: 0,
                        draws: 0,
                        winRate: 0,
                        points: 0,
                        ranking: 0
                    }
                }
            },
            { 
                new: true,
                upsert: true,
                setDefaultsOnInsert: true 
            }
        );

        console.log('Admin password has been reset successfully!');
        console.log('New password set to:', newPassword);
        console.log('Admin details:', {
            whatsapp: result.whatsapp,
            efootballId: result.efootballId,
            role: result.role,
            isVerified: result.isVerified,
            isActive: result.isActive
        });
        
        process.exit(0);
    } catch (error) {
        console.error('Error resetting admin password:', error);
        process.exit(1);
    }
}

resetAdminPassword();
