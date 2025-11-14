console.log('🚀 Script started - Debug password reset');
console.log('Current directory:', process.cwd());
console.log('Node version:', process.version);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Enable debug logging
mongoose.set('debug', true);

async function debugReset() {
    try {
        console.log('1. Starting debug process...');
        
        // Check environment variables
        console.log('2. Environment variables:');
        console.log('   - MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
        
        // Test bcrypt
        console.log('3. Testing bcrypt...');
        const testHash = await bcrypt.hash('test', 10);
        console.log('   - Bcrypt test hash:', testHash ? 'Success' : 'Failed');
        
        // Try to require the User model
        console.log('4. Loading User model...');
        let User;
        try {
            User = require('../models/Users');
            console.log('   - User model loaded successfully');
        } catch (err) {
            console.error('   - Error loading User model:', err.message);
            throw err;
        }
        
        // Try to connect to MongoDB
        console.log('5. Connecting to MongoDB...');
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tona-kikwetu';
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
        });
        console.log('   - MongoDB connected successfully');
        
        // Test a simple query
        console.log('6. Testing database connection...');
        const count = await User.countDocuments({});
        console.log(`   - Found ${count} users in the database`);
        
        console.log('✅ Debug completed successfully');
    } catch (error) {
        console.error('❌ Debug error:', error.message);
        console.error('Error details:', error);
    } finally {
        process.exit(0);
    }
}

debugReset();
