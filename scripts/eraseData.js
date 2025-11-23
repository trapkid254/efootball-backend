console.log('🚀 Script started - Data Erasure');
console.log('Current directory:', process.cwd());
console.log('Node version:', process.version);

const mongoose = require('mongoose');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const User = require('../models/Users');
const Payment = require('../models/Payment');
const Leaderboard = require('../models/Leaderboard');
require('dotenv').config();

async function eraseData() {
    try {
        console.log('1. Connecting to MongoDB...');

        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tona-kikwetu';
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
        });
        console.log('   - MongoDB connected successfully');

        console.log('2. Starting data erasure process...');

        // Get admin users
        const admins = await User.find({ role: 'admin' });
        const adminIds = admins.map(admin => admin._id);
        console.log(`   - Found ${adminIds.length} admin users`);

        // Find all tournaments created by admins
        const adminTournaments = await Tournament.find({ organizer: { $in: adminIds } });
        const tournamentIds = adminTournaments.map(t => t._id);
        console.log(`   - Found ${tournamentIds.length} tournaments created by admins`);

        // Delete all matches for these tournaments
        const matchDeleteResult = await Match.deleteMany({ tournament: { $in: tournamentIds } });
        console.log(`   - Deleted ${matchDeleteResult.deletedCount} matches`);

        // Delete all tournaments created by admins
        const tournamentDeleteResult = await Tournament.deleteMany({ organizer: { $in: adminIds } });
        console.log(`   - Deleted ${tournamentDeleteResult.deletedCount} tournaments`);

        // Delete all payments related to these tournaments
        const paymentDeleteResult = await Payment.deleteMany({ tournament: { $in: tournamentIds } });
        console.log(`   - Deleted ${paymentDeleteResult.deletedCount} payments`);

        // Delete all player accounts (role: 'player')
        const playerDeleteResult = await User.deleteMany({ role: 'player' });
        console.log(`   - Deleted ${playerDeleteResult.deletedCount} player accounts`);

        // Clear leaderboard (assuming it needs to be reset)
        const leaderboardDeleteResult = await Leaderboard.deleteMany({});
        console.log(`   - Cleared ${leaderboardDeleteResult.deletedCount} leaderboard entries`);

        console.log('✅ Data erasure completed successfully');
        console.log('Summary:');
        console.log(`   - Matches deleted: ${matchDeleteResult.deletedCount}`);
        console.log(`   - Tournaments deleted: ${tournamentDeleteResult.deletedCount}`);
        console.log(`   - Payments deleted: ${paymentDeleteResult.deletedCount}`);
        console.log(`   - Player accounts deleted: ${playerDeleteResult.deletedCount}`);
        console.log(`   - Leaderboard entries cleared: ${leaderboardDeleteResult.deletedCount}`);

    } catch (error) {
        console.error('❌ Data erasure error:', error.message);
        console.error('Error details:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed');
        process.exit(0);
    }
}

eraseData();