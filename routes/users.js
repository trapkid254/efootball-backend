const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const User = require('../models/User');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'avatar-' + uniqueSuffix + ext);
    }
});

// File filter to accept only images
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and GIF files are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB limit
    },
    fileFilter: fileFilter
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
            avatarUrl = `/uploads/avatars/${user.avatar}`;
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

// @route   POST /api/users/avatar
// @desc    Upload user avatar
// @access  Private
router.post('/avatar', [auth, upload.single('avatar')], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Please upload a file' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            // Clean up the uploaded file if user not found
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ message: 'User not found' });
        }

        // Delete old avatar if it exists
        if (user.avatar) {
            const oldAvatarPath = path.join(uploadDir, user.avatar);
            if (fs.existsSync(oldAvatarPath)) {
                fs.unlinkSync(oldAvatarPath);
            }
        }

        // Save the new avatar filename to user document
        user.avatar = req.file.filename;
        await user.save();

        // Create URL for the avatar
        const avatarUrl = `/uploads/avatars/${user.avatar}`;

        res.json({ 
            message: 'Avatar uploaded successfully',
            avatarUrl: avatarUrl
        });
    } catch (err) {
        console.error('Error uploading avatar:', err);
        
        // Clean up the uploaded file if there was an error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            message: err.message || 'Error uploading avatar' 
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

        // Update fields if they are provided
        if (efootballId) user.efootballId = efootballId;
        if (whatsapp) user.whatsapp = whatsapp;

        await user.save();
        
        // Get updated user data
        const userData = await User.findById(req.user.id).select('-password');
        
        res.json({
            message: 'Profile updated successfully',
            user: {
                id: userData._id,
                efootballId: userData.efootballId,
                whatsapp: userData.whatsapp,
                avatarUrl: userData.avatar ? `/uploads/avatars/${userData.avatar}` : null,
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
