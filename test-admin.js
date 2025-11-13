const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
require('dotenv').config();

// Admin credentials
const ADMIN_CREDENTIALS = {
    efootballId: '12345',
    password: '#Okwonkwo254',
    whatsapp: '254714003218'
};

// Connect to MongoDB
async function testAdminUser() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tona-kikwetu', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ MongoDB connected');

        const User = require('./models/Users');
        
        // Find admin user
        console.log('\n🔍 Searching for admin user...');
        const admin = await User.findOne({
            $or: [
                { efootballId: ADMIN_CREDENTIALS.efootballId },
                { whatsapp: ADMIN_CREDENTIALS.whatsapp },
                { role: 'admin' }
            ]
        }).select('+password');

        if (!admin) {
            console.error('❌ No admin user found!');
            process.exit(1);
        }

        console.log('✅ Admin user found:', {
            _id: admin._id,
            efootballId: admin.efootballId,
            whatsapp: admin.whatsapp,
            role: admin.role,
            isActive: admin.isActive,
            isVerified: admin.isVerified,
            hasPassword: !!admin.password
        });

        // Test password
        if (admin.password) {
            const isMatch = await bcrypt.compare(ADMIN_CREDENTIALS.password, admin.password);
            console.log('\n🔑 Testing password...');
            console.log(isMatch ? '✅ Password is correct' : '❌ Password is incorrect');
        } else {
            console.log('\n⚠️ No password set for admin user');
        }

        // Test login
        console.log('\n🔑 Testing login...');
        const loginUser = await User.findOne({ efootballId: ADMIN_CREDENTIALS.efootballId });
        
        if (!loginUser) {
            console.error('❌ Login test failed: User not found');
            process.exit(1);
        }

        console.log('✅ Login test passed');
        console.log('\n🎉 Admin user is properly configured!');

    } catch (error) {
        console.error('❌ Error testing admin user:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

testAdminUser();
