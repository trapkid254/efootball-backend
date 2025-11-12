const express = require('express');
const jwt = require('jsonwebtoken');
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
// @desc    Register a new player
// @access  Public
router.post('/register', async (req, res) => {
    try {
        const { whatsapp, efootballId, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [
                { whatsapp: whatsapp.trim() },
                { efootballId: efootballId.trim() }
            ]
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this WhatsApp number or Efootball ID already exists'
            });
        }

        // Create new user
        const user = new User({
            whatsapp: whatsapp.trim(),
            efootballId: efootballId.trim(),
            password,
            profile: {
                displayName: efootballId.trim()
            }
        });

        await user.save();

        // Generate token
        const token = generateToken(user._id);

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            token,
            user: {
                id: user._id,
                whatsapp: user.whatsapp,
                efootballId: user.efootballId,
                profile: user.profile,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
});

// @route   POST /api/auth/login
// @desc    Login player
// @access  Public
router.post('/login', async (req, res) => {
    try {
        console.log('Login request received:', {
            body: req.body,
            headers: req.headers
        });

        const { whatsapp, efootballId, password } = req.body;
        
        // Validate input
        if (!password) {
            console.log('Login failed: No password provided');
            return res.status(400).json({
                success: false,
                message: 'Password is required'
            });
        }
        
        if (!whatsapp && !efootballId) {
            console.log('Login failed: No identifier provided');
            return res.status(400).json({
                success: false,
                message: 'WhatsApp number or Efootball ID is required'
            });
        }

        // Build query based on provided credentials
        const query = {};
        if (whatsapp) {
            query.whatsapp = whatsapp.toString().trim();
            console.log('Looking for user with whatsapp:', query.whatsapp);
        }
        if (efootballId) {
            query.efootballId = efootballId.toString().trim();
            console.log('Looking for user with efootballId:', query.efootballId);
        }

        // Find user by provided credentials
        const user = await User.findOne({
            $or: [
                whatsapp ? { whatsapp: query.whatsapp } : null,
                efootballId ? { efootballId: query.efootballId } : null
            ].filter(Boolean) // Remove null values from the $or array
        });

        if (!user) {
            console.log('Login failed: No user found with provided credentials');
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
                details: 'No user found with the provided credentials'
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