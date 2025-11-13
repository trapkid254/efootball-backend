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
    console.log('Registration attempt:', { 
        whatsapp: req.body.whatsapp, 
        efootballId: req.body.efootballId,
        hasPassword: !!req.body.password 
    });

    try {
        const { whatsapp, efootballId, password } = req.body;

        // Validate input
        if (!whatsapp || !efootballId || !password) {
            console.log('Missing fields:', { whatsapp: !!whatsapp, efootballId: !!efootballId, password: !!password });
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields',
                errorType: 'MISSING_FIELDS',
                receivedFields: {
                    whatsapp: !!whatsapp,
                    efootballId: !!efootballId,
                    password: !!password
                }
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
        const userData = {
            whatsapp: whatsapp.trim(),
            efootballId: efootballId.trim(),
            password: password, // Will be hashed in pre-save hook
            role: 'user',
            isActive: true,
            isVerified: true, // Auto-verify for now
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
        };

        console.log('Creating user with data:', JSON.stringify(userData, null, 2));

        const user = new User(userData);

        try {
            // Save user to database (password will be hashed in pre-save hook)
            await user.save();
            
            console.log('New user registered successfully:', {
                _id: user._id,
                whatsapp: user.whatsapp,
                efootballId: user.efootballId,
                role: user.role,
                isVerified: user.isVerified,
                isActive: user.isActive
            });
        } catch (saveError) {
            console.error('Error saving user to database:', {
                error: saveError,
                message: saveError.message,
                stack: saveError.stack,
                errors: saveError.errors ? Object.keys(saveError.errors) : null,
                code: saveError.code
            });
            throw saveError; // Re-throw to be caught by the outer try-catch
        }

        // Create JWT token with user data
        const token = generateToken(user._id);

        // Prepare user response without sensitive data
        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.__v; // Remove version key
        
        console.log('User registration successful, sending response');

        // Send success response with token and user data
        res.status(201).json({
            success: true,
            token,
            user: userResponse,
            message: 'Registration successful! You are now logged in.'
        });
    } catch (err) {
        console.error('Registration error:', {
            error: err,
            message: err.message,
            stack: err.stack,
            name: err.name,
            code: err.code,
            keyPattern: err.keyPattern,
            keyValue: err.keyValue,
            errors: err.errors ? Object.keys(err.errors) : null
        });

        // Handle duplicate key errors
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            const value = err.keyValue[field];
            return res.status(400).json({
                success: false,
                message: `${field === 'whatsapp' ? 'WhatsApp number' : 'Efootball ID'} '${value}' is already registered`,
                errorType: 'DUPLICATE_KEY',
                field,
                value
            });
        }

        // Handle validation errors
        if (err.name === 'ValidationError') {
            const errors = {};
            Object.keys(err.errors).forEach((key) => {
                errors[key] = err.errors[key].message;
            });
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errorType: 'VALIDATION_ERROR',
                errors
            });
        }

        // Generic error response
        res.status(500).json({
            success: false,
            message: 'Server error during registration',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined,
            errorType: 'SERVER_ERROR'
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
            
            // Handle both formats of the phone number
            let normalizedWhatsapp = cleanWhatsapp;
            
            // If number starts with 0, also try with 254 (Kenya country code)
            if (cleanWhatsapp.startsWith('0') && cleanWhatsapp.length === 10) {
                const withCountryCode = '254' + cleanWhatsapp.substring(1);
                console.log('Also trying with country code:', withCountryCode);
                queryConditions.push({ whatsapp: withCountryCode });
            }
            // If number starts with 254, also try with 0 (local format)
            else if (cleanWhatsapp.startsWith('254') && cleanWhatsapp.length === 12) {
                const localFormat = '0' + cleanWhatsapp.substring(3);
                console.log('Also trying local format:', localFormat);
                queryConditions.push({ whatsapp: localFormat });
            }
            
            // Always try the exact match as well
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
        console.log('Attempting to verify password...');
        const isPasswordValid = await user.comparePassword(password);
        console.log('Password validation result:', isPasswordValid);
        
        if (!isPasswordValid) {
            console.log('Password validation failed for user:', {
                userId: user._id,
                whatsapp: user.whatsapp,
                efootballId: user.efootballId,
                hasPassword: !!user.password,
                passwordLength: user.password ? user.password.length : 0
            });
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
                errorType: 'INVALID_CREDENTIALS',
                details: 'The provided password is incorrect.'
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

// Temporary route to reset admin password (remove in production)
router.get('/reset-admin', async (req, res) => {
    try {
        const User = require('../models/Users');
        const bcrypt = require('bcryptjs');
        
        const adminWhatsapp = '254714003218';
        const newPassword = '#Okwonkwo254';
        
        // Hash the new password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // Update or create admin user
        const admin = await User.findOneAndUpdate(
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
        
        res.json({
            success: true,
            message: 'Admin password has been reset',
            admin: {
                whatsapp: admin.whatsapp,
                efootballId: admin.efootballId,
                role: admin.role,
                isVerified: admin.isVerified,
                isActive: admin.isActive
            }
        });
    } catch (error) {
        console.error('Error resetting admin password:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset admin password',
            error: error.message
        });
    }
});

module.exports = router;