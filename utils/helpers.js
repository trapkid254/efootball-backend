// Utility functions for the application

/**
 * Generate a random alphanumeric string
 * @param {number} length - Length of the string to generate
 * @returns {string} Random string
 */
const generateRandomString = (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

/**
 * Format phone number to Kenyan format (2547...)
 * @param {string} phone - Phone number to format
 * @returns {string} Formatted phone number
 */
const formatPhoneNumber = (phone) => {
    if (!phone) return null;
    
    const cleanPhone = phone.replace(/\s/g, '');
    
    if (cleanPhone.startsWith('07')) {
        return '254' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('+254')) {
        return cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('254')) {
        return cleanPhone;
    }
    
    return null;
};

/**
 * Validate Kenyan phone number
 * @param {string} phone - Phone number to validate
 * @returns {boolean} Whether the phone number is valid
 */
const validatePhoneNumber = (phone) => {
    if (!phone) return false;
    
    const cleanPhone = phone.replace(/\s/g, '');
    return /^(07\d{8}|2547\d{8}|\+2547\d{8})$/.test(cleanPhone);
};

/**
 * Calculate age from birth date
 * @param {Date} birthDate - Birth date
 * @returns {number} Age in years
 */
const calculateAge = (birthDate) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    
    return age;
};

/**
 * Format currency amount
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: KES)
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount, currency = 'KES') => {
    return new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

/**
 * Generate tournament bracket based on participants and format
 * @param {Array} participants - Array of participant IDs
 * @param {string} format - Tournament format ('knockout', 'group', etc.)
 * @returns {Object} Bracket structure
 */
const generateTournamentBracket = (participants, format) => {
    const bracket = {
        rounds: [],
        matches: []
    };

    if (format === 'knockout') {
        // Simple knockout bracket generation
        const numParticipants = participants.length;
        const numRounds = Math.ceil(Math.log2(numParticipants));
        
        for (let round = 1; round <= numRounds; round++) {
            const roundName = this.getRoundName(round, numRounds, numParticipants);
            bracket.rounds.push({
                round: round,
                name: roundName,
                matches: []
            });
        }
    }

    return bracket;
};

/**
 * Get round name for tournament bracket
 * @param {number} round - Round number
 * @param {number} totalRounds - Total number of rounds
 * @param {number} numParticipants - Number of participants
 * @returns {string} Round name
 */
const getRoundName = (round, totalRounds, numParticipants) => {
    const roundNames = {
        1: 'Final',
        2: 'Semi Finals',
        3: 'Quarter Finals',
        4: 'Round of 16',
        5: 'Round of 32',
        6: 'Round of 64'
    };

    if (roundNames[round]) {
        return roundNames[round];
    }

    return `Round ${round}`;
};

/**
 * Calculate win rate
 * @param {number} wins - Number of wins
 * @param {number} totalMatches - Total number of matches
 * @returns {number} Win rate percentage
 */
const calculateWinRate = (wins, totalMatches) => {
    if (totalMatches === 0) return 0;
    return Math.round((wins / totalMatches) * 100);
};

/**
 * Sanitize user input for security
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
};

/**
 * Generate pagination metadata
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items
 * @returns {Object} Pagination metadata
 */
const generatePagination = (page, limit, total) => {
    const currentPage = parseInt(page);
    const pageSize = parseInt(limit);
    const totalPages = Math.ceil(total / pageSize);
    
    return {
        currentPage,
        pageSize,
        totalItems: total,
        totalPages,
        hasNext: currentPage < totalPages,
        hasPrevious: currentPage > 1
    };
};

/**
 * Delay execution for specified time
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} Promise that resolves after delay
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Whether email is valid
 */
const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Truncate text to specified length
 * @param {string} text - Text to truncate
 * @param {number} length - Maximum length
 * @returns {string} Truncated text
 */
const truncateText = (text, length = 100) => {
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
};

module.exports = {
    generateRandomString,
    formatPhoneNumber,
    validatePhoneNumber,
    calculateAge,
    formatCurrency,
    generateTournamentBracket,
    getRoundName,
    calculateWinRate,
    sanitizeInput,
    generatePagination,
    delay,
    validateEmail,
    truncateText
};