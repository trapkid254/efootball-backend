console.log('🚀 Starting admin password reset script...');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Enable debug logging
mongoose.set('debug', true);

async function resetAdminPassword() {
    try {
        // Connect to MongoDB
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tona-kikwetu';
        console.log('Connecting to MongoDB...');
        
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to MongoDB');

        // Get the User model
        const User = require('../models/Users');
        
        // Admin details
        const adminWhatsapp = '254714003218';
        const newPassword = '#Okwonkwo254';
        
        // Ensure newPassword is a string
        if (typeof newPassword !== 'string') {
            throw new Error('Password must be a string');
        }

        console.log('Hashing password...');
        // Hash the new password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        console.log('Updating admin user...');
        // Update the admin user
        const result = await User.findOneAndUpdate(
            { whatsapp: adminWhatsapp },
            { 
                $set: { 
                    password: hashedPassword,
                    isVerified: true,
                    isActive: true,
                    role: 'admin',
                    efootballId: 'DEMO123'
                }
            },
            { 
                new: true, 
                upsert: true,
                setDefaultsOnInsert: true
            }
        );

        console.log('✅ Admin password reset successfully');
        console.log('Updated admin details:', {
            whatsapp: result.whatsapp,
            efootballId: result.efootballId,
            role: result.role,
            isActive: result.isActive,
            isVerified: result.isVerified
        });

        // Verify the password was set correctly
        const isPasswordValid = await bcrypt.compare(newPassword, result.password);
        console.log('✅ Password verification:', isPasswordValid ? 'Valid' : 'Invalid');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error resetting admin password:', error.message);
        console.error('Error details:', error);
        process.exit(1);
    }
}

resetAdminPassword();