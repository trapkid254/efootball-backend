const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/Users');
const auth = require('../middleware/auth');
const router = express.Router();

// Generate JWT Token
const generateToken = (userId) => {
    return jwt.sign(
        { userId }, 
        process.env.JWT_SECRET || 'tona-kikwetu-secret-key',
        { expiresIn: '7d' }
    );
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
    try {
        const { whatsapp, efootballId, password } = req.body;

        // Validate input
        if (!whatsapp || !efootballId || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields',
                errorType: 'MISSING_FIELDS'
            });
        }

        // Validate WhatsApp number format
        const whatsappRegex = /^(07\d{8}|\+2547\d{8}|2547\d{8})$/;
        if (!whatsappRegex.test(whatsapp.replace(/\s/g, ''))) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid WhatsApp number',
                errorType: 'INVALID_WHATSAPP'
            });
        }

        // Validate password strength
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character',
                errorType: 'WEAK_PASSWORD',
                details: {
                    minLength: 8,
                    requiresUppercase: true,
                    requiresLowercase: true,
                    requiresNumber: true,
                    requiresSpecialChar: true
                }
            });
        }

        // Check if user already exists with same WhatsApp or Efootball ID
        const existingUser = await User.findOne({ 
            $or: [
                { whatsapp: whatsapp.trim() },
                { efootballId: efootballId.trim() }
            ]
        });

        if (existingUser) {
            const errorField = existingUser.whatsapp === whatsapp.trim() ? 'WhatsApp number' : 'Efootball ID';
            return res.status(400).json({
                success: false,
                message: `${errorField} is already registered`,
                errorType: 'USER_EXISTS',
                field: errorField === 'WhatsApp number' ? 'whatsapp' : 'efootballId'
            });
        }

        // Create new user
        const user = new User({
            whatsapp: whatsapp.trim(),
            efootballId: efootballId.trim(),
            password,
            role: 'user',
            isActive: true,
            isVerified: false, // Set to false, require email/SMS verification in production
            profile: {
                displayName: `Player-${efootballId.trim()}`
            },
            stats: {
                totalMatches: 0,
                wins: 0,
                losses: 0,
                draws: 0,
                points: 0,
                ranking: 0
            }
        });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        // Save user to database
        await user.save();

        console.log('New user registered successfully:', {
            _id: user._id,
            whatsapp: user.whatsapp,
            efootballId: user.efootballId,
            role: user.role,
            isVerified: user.isVerified,
            isActive: user.isActive
        });

        // For now, we'll auto-verify the user
        // In production, you should implement email/SMS verification
        user.isVerified = true;
        await user.save();

        // Create JWT token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET || 'tona-kikwetu-secret-key',
            { expiresIn: '7d' }
        );

        // Don't send password in response
        const userResponse = user.toObject();
        delete userResponse.password;

        // Send success response with token and user data
        res.status(201).json({
            success: true,
            token,
            user: userResponse,
            message: 'Registration successful! You are now logged in.'
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error during registration',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// @route   POST /api/auth/login
// @desc    Login player
// @access  Public
router.post('/login', async (req, res) => {
    try {
        console.log('Login request received:', {
            body: { ...req.body, password: req.body.password ? '[REDACTED]' : 'MISSING' },
            headers: {
                ...req.headers,
                'authorization': req.headers.authorization ? '[REDACTED]' : 'MISSING'
            }
        });

        const { whatsapp, efootballId, password } = req.body;
        
        // Validate input
        if (!password) {
            console.log('Login failed: No password provided');
            return res.status(400).json({
                success: false,
                message: 'Password is required',
                errorType: 'MISSING_PASSWORD'
            });
        }
        
        if (!whatsapp && !efootballId) {
            console.log('Login failed: No identifier provided');
            return res.status(400).json({
                success: false,
                message: 'WhatsApp number or Efootball ID is required',
                errorType: 'MISSING_IDENTIFIER'
            });
        }

        // Build query based on provided credentials
        const queryConditions = [];
        
        if (whatsapp) {
            const cleanWhatsapp = whatsapp.toString().trim();
            console.log('Looking for user with whatsapp:', cleanWhatsapp);
            queryConditions.push({ whatsapp: cleanWhatsapp });
        }
        
        if (efootballId) {
            const cleanEfootballId = efootballId.toString().trim();
            console.log('Looking for user with efootballId:', cleanEfootballId);
            queryConditions.push({ efootballId: cleanEfootballId });
        }

        if (queryConditions.length === 0) {
            console.log('No valid query conditions could be built');
            return res.status(400).json({
                success: false,
                message: 'Invalid login credentials',
                errorType: 'INVALID_CREDENTIALS'
            });
        }

        console.log('Searching for user with conditions:', queryConditions);
        
        // Find user by provided credentials
        const user = await User.findOne({
            $or: queryConditions
        }).select('+password'); // Explicitly include password for verification

        if (!user) {
            console.log('Login failed: No user found with provided credentials');
            return res.status(401).json({
                success: false,
                message: 'Account not found',
                details: 'No account found with the provided credentials. Please register first.',
                errorType: 'USER_NOT_FOUND'
            });
        }
        
        // Check if user is verified
        if (!user.isVerified) {
            console.log('Login failed: Account not verified');
            return res.status(401).json({
                success: false,
                message: 'Account not verified',
                details: 'Please verify your account before logging in.',
                errorType: 'ACCOUNT_NOT_VERIFIED'
            });
        }
        
        console.log('User found:', {
            _id: user._id,
            whatsapp: user.whatsapp,
            efootballId: user.efootballId,
            role: user.role,
            isActive: user.isActive,
            isVerified: user.isVerified
        });
        
        // Check if user is active
        if (!user.isActive) {
            console.log('Login failed: User account is not active');
            return res.status(401).json({
                success: false,
                message: 'This account has been deactivated',
                errorType: 'ACCOUNT_DEACTIVATED'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated'
            });
        }

        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate token
        const token = generateToken(user._id);

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                whatsapp: user.whatsapp,
                efootballId: user.efootballId,
                profile: user.profile,
                role: user.role,
                stats: user.stats
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                whatsapp: user.whatsapp,
                efootballId: user.efootballId,
                profile: user.profile,
                role: user.role,
                stats: user.stats,
                isVerified: user.isVerified
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user data',
            error: error.message
        });
    }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
    try {
        const { displayName, location, bio } = req.body;
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update profile fields
        if (displayName) user.profile.displayName = displayName;
        if (location) user.profile.location = location;
        if (bio) user.profile.bio = bio;

        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                whatsapp: user.whatsapp,
                efootballId: user.efootballId,
                profile: user.profile,
                role: user.role,
                stats: user.stats
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: error.message
        });
    }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to change password',
            error: error.message
        });
    }
});

// @route   POST /api/auth/verify-token
// @desc    Verify JWT token
// @access  Public
router.post('/verify-token', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tona-kikwetu-secret-key');
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                whatsapp: user.whatsapp,
                efootballId: user.efootballId,
                profile: user.profile,
                role: user.role,
                stats: user.stats
            }
        });

    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
});

module.exports = router;