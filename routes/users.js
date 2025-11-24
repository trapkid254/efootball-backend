const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');
const User = require('../models/Users');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads/profile');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for profile picture uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Use timestamp + original extension (e.g., 1698765432109.jpg)
        const timestamp = Date.now();
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, timestamp + ext);
    }
});

// Enhanced file filter with MIME type validation
const fileFilter = (req, file, cb) => {
    // Check MIME type
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedMimes.includes(file.mimetype)) {
        return cb(new Error('Invalid file type. Only JPEG, PNG, and GIF files are allowed.'), false);
    }

    // Check file extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
        return cb(new Error('Invalid file extension. Only .jpg, .jpeg, .png, and .gif files are allowed.'), false);
    }

    // Additional security: check if file is actually an image
    if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('File is not a valid image.'), false);
    }

    cb(null, true);
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: fileFilter
});

// Rate limiting for uploads (max 5 uploads per hour per user)
const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // limit each user to 5 uploads per hour
    message: {
        success: false,
        message: 'Too many uploads. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// @route   GET /api/users/me
// @desc    Get current user's profile
// @access  Private
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // If avatar exists, create a URL to access it
        let avatarUrl = null;
        if (user.avatar) {
            avatarUrl = `/uploads/profile/${user.avatar}`;
        }

        res.json({
            id: user._id,
            efootballId: user.efootballId,
            whatsapp: user.whatsapp,
            avatarUrl: avatarUrl,
            stats: {
                matchesPlayed: user.stats?.matchesPlayed || 0,
                wins: user.stats?.wins || 0,
                losses: user.stats?.losses || 0,
                draws: user.stats?.draws || 0
            },
            role: user.role,
            createdAt: user.createdAt
        });
    } catch (err) {
        console.error('Error fetching user profile:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/users/tournaments
// @desc    Get tournaments the user has registered for
// @access  Private
router.get('/tournaments', auth, async (req, res) => {
    try {
        const Tournament = require('../models/Tournament');

        const tournaments = await Tournament.find({
            'participants.player': req.user.id,
            'participants.status': 'registered'
        })
        .populate('organizer', 'efootballId profile')
        .populate('participants.player', 'efootballId profile')
        .sort({ 'schedule.tournamentStart': -1 });

        res.json({
            success: true,
            tournaments
        });
    } catch (err) {
        console.error('Error fetching user tournaments:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/users/avatar/:filename
// @desc    Get user profile image
// @access  Public
router.get('/avatar/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: 'Profile image not found'
        });
    }

    // Check if it's actually an image file
    const ext = path.extname(filename).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
    if (!allowedExtensions.includes(ext)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid image file'
        });
    }

    // Set appropriate headers
    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif'
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
        console.error('Error streaming profile image:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving profile image'
        });
    });
});

// @route   POST /api/users/avatar
// @desc    Upload user profile picture
// @access  Private
router.post('/avatar', [auth, uploadLimiter, upload.single('avatar')], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a file'
            });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            // Clean up the uploaded file if user not found
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Delete old avatar if it exists
        if (user.avatar) {
            const oldAvatarPath = path.join(uploadDir, user.avatar);
            if (fs.existsSync(oldAvatarPath)) {
                try {
                    fs.unlinkSync(oldAvatarPath);
                    console.log('Deleted old avatar:', oldAvatarPath);
                } catch (deleteError) {
                    console.error('Error deleting old avatar:', deleteError);
                    // Don't fail the upload if we can't delete the old file
                }
            }
        }

        // Save the new avatar filename to user document
        user.avatar = req.file.filename;
        await user.save();

        // Create URL for the avatar
        const avatarUrl = `/uploads/profile/${user.avatar}`;

        console.log('Profile picture uploaded successfully:', {
            userId: user._id,
            filename: req.file.filename,
            size: req.file.size,
            url: avatarUrl
        });

        res.json({
            success: true,
            message: 'Profile picture uploaded successfully',
            avatarUrl: avatarUrl,
            filename: req.file.filename
        });
    } catch (err) {
        console.error('Error uploading profile picture:', err);

        // Clean up the uploaded file if there was an error
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (cleanupError) {
                console.error('Error cleaning up uploaded file:', cleanupError);
            }
        }

        // Handle multer errors
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    message: 'File too large. Maximum size is 10MB.'
                });
            }
        }

        res.status(500).json({
            success: false,
            message: err.message || 'Error uploading profile picture'
        });
    }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
    const { efootballId, whatsapp } = req.body;

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent eFootball ID changes - users cannot modify their eFootball ID
        if (efootballId && efootballId !== user.efootballId) {
            return res.status(400).json({
                message: 'Efootball ID cannot be changed. Contact support if you need to update your eFootball ID.'
            });
        }

        // Update only allowed fields
        if (whatsapp) {
            // Validate WhatsApp format
            if (!/^(07\d{8}|2547\d{8}|\+2547\d{8})$/.test(whatsapp.replace(/\s/g, ''))) {
                return res.status(400).json({ message: 'Please provide a valid WhatsApp number' });
            }
            user.whatsapp = whatsapp;
        }

        await user.save();

        // Get updated user data
        const userData = await User.findById(req.user.id).select('-password');

        res.json({
            message: 'Profile updated successfully',
            user: {
                id: userData._id,
                efootballId: userData.efootballId,
                whatsapp: userData.whatsapp,
                avatarUrl: userData.avatar ? `/uploads/profile/${userData.avatar}` : null,
                stats: userData.stats,
                role: userData.role,
                createdAt: userData.createdAt
            }
        });
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
