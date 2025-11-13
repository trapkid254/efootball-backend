const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tona-kikwetu';

async function fixAdminPassword() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');

        // Get the User model
        const User = require('../models/Users');
        
        // Admin credentials
        const adminWhatsapp = '254714003218';
        const newPassword = '#Okwonkwo254';
        
        // Hash the new password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        console.log('New hashed password:', hashedPassword);
        
        // Update the admin user
        const result = await User.findOneAndUpdate(
            { whatsapp: adminWhatsapp },
            { 
                $set: { 
                    password: hashedPassword,
                    isVerified: true,
                    isActive: true,
                    role: 'admin',
                    efootballId: '12345',
                    'profile.displayName': 'Admin User'
                }
            },
            { 
                new: true,
                upsert: true,
                setDefaultsOnInsert: true 
            }
        );

        console.log('Admin password has been updated successfully!');
        console.log('New password:', newPassword);
        console.log('Admin details:', {
            _id: result._id,
            whatsapp: result.whatsapp,
            efootballId: result.efootballId,
            role: result.role,
            isVerified: result.isVerified,
            isActive: result.isActive
        });
        
        process.exit(0);
    } catch (error) {
        console.error('Error updating admin password:', error);
        process.exit(1);
    }
}

fixAdminPassword();
