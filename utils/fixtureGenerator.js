const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const { v4: uuidv4 } = require('uuid');

/**
 * Generates fixtures for a tournament based on its format
 * @param {Object} tournament - The tournament document
 * @returns {Promise<Array>} - Array of generated matches
 */
const generateFixtures = async (tournament) => {
    const matches = [];
    const { format, participants, _id: tournamentId, fixtureSettings } = tournament;
    const participantIds = participants.map(p => p.player);
    
    // Shuffle participants for random seeding
    const shuffledParticipants = [...participantIds].sort(() => 0.5 - Math.random());
    
    switch (format) {
        case 'knockout':
            await generateKnockoutFixtures(tournament, shuffledParticipants, matches);
            break;
        case 'group':
            await generateGroupFixtures(tournament, shuffledParticipants, matches);
            break;
        case 'group+knockout':
            await generateGroupKnockoutFixtures(tournament, shuffledParticipants, matches);
            break;
        case 'league':
            await generateLeagueFixtures(tournament, shuffledParticipants, matches);
            break;
        default:
            throw new Error(`Unsupported tournament format: ${format}`);
    }

    // Schedule matches based on tournament settings
    return scheduleMatches(matches, tournament);
};

/**
 * Generates knockout stage fixtures
 */
const generateKnockoutFixtures = async (tournament, participants, matches) => {
    let round = 1;
    let currentRound = participants;
    let matchNumber = 1;
    
    while (currentRound.length > 1) {
        const nextRound = [];
        const roundName = getRoundName(round, currentRound.length);
        
        // If odd number of participants, one gets a bye
        if (currentRound.length % 2 !== 0) {
            const byeIndex = Math.floor(Math.random() * currentRound.length);
            const [byePlayer] = currentRound.splice(byeIndex, 1);
            nextRound.push(byePlayer);
        }
        
        // Create matches for current round
        for (let i = 0; i < currentRound.length; i += 2) {
            const player1 = currentRound[i];
            const player2 = currentRound[i + 1] || null; // Could be null for bye
            
            matches.push({
                tournament: tournament._id,
                round: roundName,
                matchNumber: matchNumber++,
                player1: { user: player1 },
                player2: player2 ? { user: player2 } : null,
                status: player2 ? 'scheduled' : 'completed',
                result: player2 ? null : { 
                    winner: player1,
                    isDraw: false,
                    confirmedBy: tournament.organizer
                }
            });
            
            if (player2) {
                nextRound.push(null); // Placeholder for winner
            } else {
                nextRound.push(player1); // Player with bye advances
            }
        }
        
        currentRound = nextRound;
        round++;
    }
};

/**
 * Generates group stage fixtures
 */
const generateGroupFixtures = async (tournament, participants, matches) => {
    const groupCount = Math.ceil(participants.length / 4); // 4 players per group
    const groups = [];
    
    // Create groups
    for (let i = 0; i < groupCount; i++) {
        groups.push({
            name: `Group ${String.fromCharCode(65 + i)}`,
            players: []
        });
    }
    
    // Distribute players to groups
    participants.forEach((player, index) => {
        const groupIndex = index % groupCount;
        groups[groupIndex].players.push(player);
    });
    
    // Generate round-robin matches for each group
    for (const group of groups) {
        const groupPlayers = group.players;
        const groupMatches = [];
        
        // Generate all possible match combinations
        for (let i = 0; i < groupPlayers.length; i++) {
            for (let j = i + 1; j < groupPlayers.length; j++) {
                groupMatches.push({
                    player1: groupPlayers[i],
                    player2: groupPlayers[j]
                });
            }
        }
        
        // Shuffle matches to distribute them across rounds
        const shuffledMatches = groupMatches.sort(() => 0.5 - Math.random());
        
        // Create match documents
        shuffledMatches.forEach((match, index) => {
            matches.push({
                tournament: tournament._id,
                round: group.name,
                matchNumber: matches.length + 1,
                player1: { user: match.player1 },
                player2: { user: match.player2 },
                status: 'scheduled',
                group: group.name
            });
        });
    }
};

/**
 * Generates group stage followed by knockout stage
 */
const generateGroupKnockoutFixtures = async (tournament, participants, matches) => {
    // First generate group stage
    await generateGroupFixtures(tournament, participants, matches);
    
    // After group stage, we would need to determine the top players from each group
    // and then generate knockout fixtures. This would require the group stage to be completed first.
    // We'll add a placeholder for the knockout stage matches.
    
    // This would be implemented to run after group stage is complete
    // and would use the group stage results to seed the knockout stage
};

/**
 * Generates league/round-robin fixtures
 */
const generateLeagueFixtures = async (tournament, participants, matches) => {
    const rounds = participants.length - 1;
    const matchesPerRound = Math.floor(participants.length / 2);
    
    // Create a copy of the participants array
    let teams = [...participants];
    
    // Fixed first team, rotate others
    for (let round = 0; round < rounds; round++) {
        for (let match = 0; match < matchesPerRound; match++) {
            const home = (round + match) % (participants.length - 1);
            let away = (participants.length - 1 - match + round) % (participants.length - 1);
            
            // Last team stays in place, others rotate around it
            if (match === 0) {
                away = participants.length - 1;
            }
            
            matches.push({
                tournament: tournament._id,
                round: `Round ${round + 1}`,
                matchNumber: matches.length + 1,
                player1: { user: teams[home] },
                player2: { user: teams[away] },
                status: 'scheduled'
            });
        }
        
        // Rotate all except first team
        teams = [teams[0], teams[teams.length - 1], ...teams.slice(1, -1)];
    }
};

/**
 * Schedules matches based on tournament settings
 */
const scheduleMatches = (matches, tournament) => {
    const { fixtureSettings } = tournament;
    const { matchDuration, breakBetweenMatches, startTime, daysOfWeek } = fixtureSettings;
    
    // Sort matches by round to schedule them in order
    matches.sort((a, b) => {
        // Simple comparison - in a real app, we'd parse the round names
        return a.round.localeCompare(b.round);
    });
    
    // Start from the tournament start date
    let currentDate = new Date(tournament.schedule.tournamentStart);
    let currentMatchIndex = 0;
    
    // Find the next valid day based on daysOfWeek
    const getNextValidDay = (date) => {
        let nextDay = new Date(date);
        let day = date.getDay();
        
        while (!daysOfWeek.includes(day)) {
            nextDay.setDate(nextDay.getDate() + 1);
            day = nextDay.getDay();
        }
        
        return nextDay;
    };
    
    // Get the next valid day
    currentDate = getNextValidDay(currentDate);
    
    // Schedule matches
    while (currentMatchIndex < matches.length) {
        const [hours, minutes] = startTime.split(':').map(Number);
        let currentTime = new Date(currentDate);
        currentTime.setHours(hours, minutes, 0, 0);
        
        // Schedule matches for this day
        let matchesToday = 0;
        
        while (matchesToday < fixtureSettings.matchesPerDay && currentMatchIndex < matches.length) {
            matches[currentMatchIndex].scheduledTime = new Date(currentTime);
            
            // Move to next match time
            currentTime = new Date(currentTime.getTime() + (matchDuration + breakBetweenMatches) * 60000);
            matchesToday++;
            currentMatchIndex++;
        }
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate = getNextValidDay(currentDate);
    }
    
    return matches;
};

/**
 * Gets the name of a round based on the number of participants
 */
const getRoundName = (round, participantCount) => {
    switch (participantCount) {
        case 2: return 'Final';
        case 4: return round === 1 ? 'Semi-Finals' : 'Final';
        case 8: 
            if (round === 1) return 'Quarter-Finals';
            if (round === 2) return 'Semi-Finals';
            return 'Final';
        case 16:
            if (round === 1) return 'Round of 16';
            if (round === 2) return 'Quarter-Finals';
            if (round === 3) return 'Semi-Finals';
            return 'Final';
        default:
            if (participantCount <= 4) return `Round ${round}`;
            if (participantCount <= 8) return `Round ${round} (Top ${participantCount})`;
            return `Round ${round} (Top ${participantCount})`;
    }
};

/**
 * Updates the tournament leaderboard based on match results
 * @param {String} tournamentId - ID of the tournament
 */
const updateTournamentLeaderboard = async (tournamentId) => {
    const tournament = await Tournament.findById(tournamentId)
        .populate('participants.player')
        .populate({
            path: 'matches',
            match: { status: 'completed' },
            populate: [
                { path: 'player1.user' },
                { path: 'player2.user' },
                { path: 'result.winner' },
                { path: 'result.loser' }
            ]
        });
    
    if (!tournament) {
        throw new Error('Tournament not found');
    }
    
    // Reset participant stats
    tournament.participants.forEach(participant => {
        participant.stats = {
            matchesPlayed: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0
        };
    });
    
    // Process completed matches
    tournament.matches.forEach(match => {
        if (match.status === 'completed' && match.result) {
            const player1 = tournament.participants.find(p => p.player._id.equals(match.player1.user._id));
            const player2 = tournament.participants.find(p => p.player._id.equals(match.player2.user._id));
            
            if (player1 && player2) {
                // Update matches played
                player1.stats.matchesPlayed++;
                player2.stats.matchesPlayed++;
                
                // Update goals
                player1.stats.goalsFor += match.player1.score || 0;
                player1.stats.goalsAgainst += match.player2.score || 0;
                player2.stats.goalsFor += match.player2.score || 0;
                player2.stats.goalsAgainst += match.player1.score || 0;
                
                // Update wins/draws/losses and points
                if (match.result.isDraw) {
                    player1.stats.draws++;
                    player2.stats.draws++;
                    player1.stats.points += tournament.leaderboardSettings.pointsForDraw;
                    player2.stats.points += tournament.leaderboardSettings.pointsForDraw;
                } else if (match.result.winner) {
                    const isPlayer1Winner = match.result.winner._id.equals(player1.player._id);
                    
                    if (isPlayer1Winner) {
                        player1.stats.wins++;
                        player2.stats.losses++;
                        player1.stats.points += tournament.leaderboardSettings.pointsForWin;
                        player2.stats.points += tournament.leaderboardSettings.pointsForLoss;
                    } else {
                        player2.stats.wins++;
                        player1.stats.losses++;
                        player2.stats.points += tournament.leaderboardSettings.pointsForWin;
                        player1.stats.points += tournament.leaderboardSettings.pointsForLoss;
                    }
                }
            }
        }
    });
    
    // Sort participants based on leaderboard settings
    tournament.participants.sort((a, b) => {
        // Sort by points (descending)
        if (a.stats.points !== b.stats.points) {
            return b.stats.points - a.stats.points;
        }
        
        // If points are equal, use tiebreakers
        for (const tiebreaker of tournament.leaderboardSettings.tiebreakers) {
            switch (tiebreaker) {
                case 'goalDifference':
                    const diffA = a.stats.goalsFor - a.stats.goalsAgainst;
                    const diffB = b.stats.goalsFor - b.stats.goalsAgainst;
                    if (diffA !== diffB) return diffB - diffA;
                    break;
                    
                case 'goalsFor':
                    if (a.stats.goalsFor !== b.stats.goalsFor) {
                        return b.stats.goalsFor - a.stats.goalsFor;
                    }
                    break;
                    
                case 'headToHead':
                    // In a real app, we'd check head-to-head results
                    // For now, we'll just use a random value
                    return Math.random() - 0.5;
                    
                case 'alphabetical':
                    return a.player.efootballId.localeCompare(b.player.efootballId);
            }
        }
        
        return 0;
    });
    
    // Save the updated tournament
    await tournament.save();
    
    return tournament;
};

/**
 * Generates the next round of fixtures for a knockout tournament
 * @param {String} tournamentId - ID of the tournament
 */
const generateNextKnockoutRound = async (tournamentId) => {
    const tournament = await Tournament.findById(tournamentId)
        .populate('matches')
        .populate('participants.player');
    
    if (!tournament) {
        throw new Error('Tournament not found');
    }
    
    // Get all completed matches
    const completedMatches = tournament.matches.filter(m => m.status === 'completed');
    const lastRound = Math.max(...tournament.matches.map(m => parseInt(m.round) || 0));
    const nextRound = lastRound + 1;
    
    // Get winners from the last round
    const winners = [];
    const lastRoundMatches = tournament.matches.filter(m => m.round === lastRound.toString());
    
    for (const match of lastRoundMatches) {
        if (match.result && match.result.winner) {
            winners.push(match.result.winner);
        } else {
            // If there's no winner but the match is completed, it might be a bye
            if (match.player1 && !match.player2) {
                winners.push(match.player1.user);
            }
        }
    }
    
    // If we have an odd number of winners, one gets a bye
    if (winners.length > 1 && winners.length % 2 !== 0) {
        const byeIndex = Math.floor(Math.random() * winners.length);
        const [byePlayer] = winners.splice(byeIndex, 1);
        
        // Create a bye match
        const byeMatch = new Match({
            tournament: tournament._id,
            round: nextRound.toString(),
            matchNumber: tournament.matches.length + 1,
            player1: { user: byePlayer },
            status: 'completed',
            result: {
                winner: byePlayer,
                isDraw: false,
                confirmedBy: tournament.organizer
            }
        });
        
        await byeMatch.save();
        tournament.matches.push(byeMatch._id);
        winners.push(byePlayer);
    }
    
    // Create matches for the next round
    for (let i = 0; i < winners.length; i += 2) {
        if (i + 1 < winners.length) {
            const match = new Match({
                tournament: tournament._id,
                round: nextRound.toString(),
                matchNumber: tournament.matches.length + 1,
                player1: { user: winners[i] },
                player2: { user: winners[i + 1] },
                status: 'scheduled'
            });
            
            await match.save();
            tournament.matches.push(match._id);
        }
    }
    
    // Update tournament status if this was the final
    if (winners.length <= 1) {
        tournament.status = 'completed';
        tournament.winner = winners[0];
    }
    
    await tournament.save();
    return tournament;
};

module.exports = {
    generateFixtures,
    updateTournamentLeaderboard,
    generateNextKnockoutRound
};
