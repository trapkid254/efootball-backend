const bcrypt = require('bcryptjs');
const User = require('../models/Users');

const ensureAdminUser = async () => {
    try {
        const adminData = {
            whatsapp: '254714003218',
            efootballId: '12345',
            password: '#Okwonkwo254',
            role: 'admin',
            isVerified: true,
            isActive: true,
            stats: {
                matchesPlayed: 0,
                wins: 0,
                losses: 0,
                draws: 0,
                winRate: 0,
                points: 0,
                ranking: 0
            }
        };

        // Check if admin already exists
        let admin = await User.findOne({ efootballId: adminData.efootballId });

        if (admin) {
            // Update existing admin
            admin.whatsapp = adminData.whatsapp;
            admin.role = 'admin';
            admin.isVerified = true;
            admin.isActive = true;
            
            // Only update password if it's not already hashed
            if (!admin.password.startsWith('$2a$')) {
                admin.password = adminData.password;
            }
            
            await admin.save();
            console.log('✅ Admin user updated');
        } else {
            // Create new admin
            admin = new User(adminData);
            await admin.save();
            console.log('✅ Admin user created');
        }

        console.log('Admin credentials:');
        console.log('------------------');
        console.log(`eFootball ID: ${admin.efootballId}`);
        console.log('Password: #Okwonkwo254');
        console.log('------------------');

    } catch (error) {
        console.error('❌ Error ensuring admin user:', error);
    }
};

module.exports = ensureAdminUser;
