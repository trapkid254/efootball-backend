const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');

/**
 * @route   GET api/activity/recent
 * @desc    Get recent user activity
 * @access  Private
 */
router.get('/recent', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get recent matches (last 5)
        const recentMatches = await Match.find({
            $or: [
                { 'player1.player': userId },
                { 'player2.player': userId }
            ],
            status: { $ne: 'pending' }
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('player1.player', 'efootballId')
        .populate('player2.player', 'efootballId')
        .populate('tournament', 'name');

        // Get recent tournament activity (last 5)
        const recentTournaments = await Tournament.find({
            'participants.player': userId,
            status: { $in: ['in_progress', 'completed'] }
        })
        .sort({ updatedAt: -1 })
        .limit(5);

        // Format activities
        const activities = [];
        
        // Add match activities
        recentMatches.forEach(match => {
            const opponent = match.player1.player._id.toString() === userId ? 
                match.player2.player?.efootballId || 'Opponent' : 
                match.player1.player?.efootballId || 'Opponent';
            
            let title, description;
            
            if (match.status === 'completed') {
                const isWinner = match.winner?.toString() === userId;
                title = isWinner ? 'Match Won' : 'Match Completed';
                description = isWinner ? 
                    `You defeated ${opponent} in ${match.tournament?.name || 'a tournament'}` :
                    `Match against ${opponent} completed in ${match.tournament?.name || 'a tournament'}`;
            } else {
                title = 'Upcoming Match';
                description = `Your match against ${opponent} in ${match.tournament?.name || 'a tournament'} is coming up`;
            }
            
            activities.push({
                type: 'match',
                title,
                description,
                timestamp: match.updatedAt,
                data: {
                    matchId: match._id,
                    tournamentId: match.tournament?._id
                }
            });
        });

        // Add tournament activities
        recentTournaments.forEach(tournament => {
            const participant = tournament.participants.find(p => p.player.toString() === userId);
            
            let title, description;
            
            if (tournament.status === 'completed') {
                const isWinner = tournament.winner?.toString() === userId;
                title = isWinner ? 'Tournament Won!' : 'Tournament Completed';
                description = isWinner ?
                    `You won the ${tournament.name} tournament!` :
                    `The ${tournament.name} tournament has ended`;
            } else {
                title = 'Tournament Update';
                description = `Your tournament ${tournament.name} is in progress`;
                
                // Add specific updates based on tournament progress
                if (participant?.nextMatch) {
                    description = `Your next match in ${tournament.name} is ready`;
                } else if (participant?.eliminated) {
                    description = `You've been eliminated from ${tournament.name}`;
                }
            }
            
            activities.push({
                type: 'tournament',
                title,
                description,
                timestamp: tournament.updatedAt,
                data: {
                    tournamentId: tournament._id
                }
            });
        });

        // Sort activities by timestamp (newest first) and limit to 10
        const sortedActivities = activities
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 10);

        res.json({ activities: sortedActivities });
        
    } catch (error) {
        console.error('Error fetching recent activity:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
