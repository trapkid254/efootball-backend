const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

// Admin user configuration
const ADMIN_CONFIG = {
    whatsapp: '0714003218',
    efootballId: '12345',
    password: '#Okwonkwo254',
    role: 'admin',
    profile: {
        displayName: 'Admin User'
    },
    isActive: true,
    isVerified: true
};

// Function to initialize admin user
async function initializeAdminUser() {
    try {
        const User = require('./models/Users');
        
        // Log the admin config we're trying to use
        console.log('Initializing admin user with config:', {
            whatsapp: ADMIN_CONFIG.whatsapp,
            efootballId: ADMIN_CONFIG.efootballId,
            hasPassword: !!ADMIN_CONFIG.password,
            role: ADMIN_CONFIG.role
        });
        
        // Check if admin user already exists by role first
        let admin = await User.findOne({ role: 'admin' });
        
        // If no admin by role, check by whatsapp or efootballId
        if (!admin) {
            console.log('No admin user found by role, checking by credentials...');
            admin = await User.findOne({
                $or: [
                    { whatsapp: ADMIN_CONFIG.whatsapp },
                    { efootballId: ADMIN_CONFIG.efootballId }
                ]
            });
        }
        
        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(ADMIN_CONFIG.password, salt);
        console.log('Hashed password created successfully');
        
        if (!admin) {
            console.log('No admin user found, creating new one...');
            
            try {
                // Create new admin user
                admin = new User({
                    whatsapp: ADMIN_CONFIG.whatsapp,
                    efootballId: ADMIN_CONFIG.efootballId,
                    password: hashedPassword,
                    role: 'admin',
                    profile: ADMIN_CONFIG.profile || {},
                    isActive: true,
                    isVerified: true
                });
                
                console.log('Saving new admin user...');
                await admin.save();
                console.log('✅ Admin user created successfully');
                
                // Verify the admin was saved correctly
                const savedAdmin = await User.findById(admin._id);
                if (!savedAdmin) {
                    throw new Error('Failed to verify admin user creation');
                }
                
                console.log('✅ Verified admin user creation:', {
                    _id: savedAdmin._id,
                    whatsapp: savedAdmin.whatsapp,
                    efootballId: savedAdmin.efootballId,
                    role: savedAdmin.role,
                    isActive: savedAdmin.isActive,
                    isVerified: savedAdmin.isVerified
                });
                
                // Verify password
                const isPasswordValid = await bcrypt.compare(ADMIN_CONFIG.password, savedAdmin.password);
                console.log('✅ Password verification:', isPasswordValid ? 'Valid' : 'Invalid');
                
                return savedAdmin;
            } catch (saveError) {
                console.error('❌ Error saving admin user:', saveError);
                if (saveError.name === 'ValidationError') {
                    console.error('Validation errors:', Object.values(saveError.errors).map(e => e.message));
                }
                throw saveError;
            }
        } else {
            console.log('Existing admin user found, updating...');
            console.log('Current admin data:', {
                _id: admin._id,
                whatsapp: admin.whatsapp,
                efootballId: admin.efootballId,
                role: admin.role,
                isActive: admin.isActive,
                isVerified: admin.isVerified
            });
            
            // Update existing admin user with current config
            admin.whatsapp = ADMIN_CONFIG.whatsapp;
            admin.efootballId = ADMIN_CONFIG.efootballId;
            admin.role = 'admin'; // Ensure role is set to admin
            admin.profile = ADMIN_CONFIG.profile;
            admin.isActive = true;
            admin.isVerified = true;
            admin.password = hashedPassword; // Always update password
            
            try {
                await admin.save();
                console.log('✅ Admin user updated successfully');
                
                // Verify the update
                const updatedAdmin = await User.findOne({ _id: admin._id });
                console.log('✅ Verified updated admin:', {
                    _id: updatedAdmin._id,
                    whatsapp: updatedAdmin.whatsapp,
                    efootballId: updatedAdmin.efootballId,
                    role: updatedAdmin.role,
                    isActive: updatedAdmin.isActive,
                    isVerified: updatedAdmin.isVerified
                });
                
                // Verify password
                try {
                    if (!updatedAdmin.password) {
                        console.error('❌ Admin user has no password set');
                        throw new Error('Admin user has no password set');
                    }
                    
                    console.log('Verifying admin password...');
                    const isPasswordValid = await bcrypt.compare(ADMIN_CONFIG.password, updatedAdmin.password);
                    console.log('✅ Password verification after update:', isPasswordValid ? 'Valid' : 'Invalid');
                    
                    if (!isPasswordValid) {
                        console.warn('⚠️ Admin password verification failed - this might be expected on first run');
                        // Update the password if verification fails (might be first run or password change)
                        updatedAdmin.password = hashedPassword;
                        await updatedAdmin.save();
                        console.log('✅ Admin password updated successfully');
                    }
                    
                    return updatedAdmin;
                } catch (passwordError) {
                    console.error('❌ Error verifying admin password:', passwordError);
                    throw passwordError;
                }
            } catch (updateError) {
                console.error('❌ Error updating admin user:', updateError);
                if (updateError.name === 'ValidationError') {
                    console.error('Validation errors:', Object.values(updateError.errors).map(e => e.message));
                }
                throw updateError;
            }
        }
    } catch (error) {
        console.error('❌ Critical error in initializeAdminUser:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        // Don't crash the server, but make sure we log the error
        process.exit(1);
    }
}

const app = express();

// Security Middleware
app.use(helmet());
// CORS configuration
const allowedOrigins = [
    'https://tonakikwetu.netlify.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5000',
    'https://efootball-backend-f8ws.onrender.com',
    process.env.FRONTEND_URL
].filter(Boolean);

// Log allowed origins for debugging
console.log('Allowed CORS origins:', allowedOrigins);

// CORS middleware with detailed logging
app.use((req, res, next) => {
    const origin = req.headers.origin;
    console.log(`Incoming ${req.method} request from origin: ${origin}`);
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        res.header('Access-Control-Allow-Credentials', 'true');
        return res.status(200).end();
    }
    
    // For non-preflight requests
    if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Authorization');
        return next();
    }
    
    // Handle requests with no origin (like mobile apps or curl requests)
    if (!origin) {
        return next();
    }
    
    // Log blocked requests
    console.warn('CORS blocked request from origin:', origin);
    res.status(403).json({ error: 'Not allowed by CORS' });
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static('uploads'));

// Database connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tona-kikwetu';

// Log database connection info (without credentials)
console.log('Connecting to MongoDB...');

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
})
.then(async () => {
    console.log('✅ MongoDB connected successfully');
    // Initialize admin user after successful database connection
    await initializeAdminUser();
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        message: 'CORS test successful!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tournaments', require('./routes/tournaments'));
app.use('/api/user', require('./routes/userTournaments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/players', require('./routes/players'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/activity', require('./routes/activity'));

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'TONA KIKWETU API is running',
        timestamp: new Date().toISOString()
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to TONA KIKWETU Efootball Tournament API',
        version: '1.0.0',
        documentation: '/api/docs'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'production' ? {} : err.message
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;