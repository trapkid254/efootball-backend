const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Admin user configuration
const ADMIN_CONFIG = {
    whatsapp: '0712345678',
    efootballId: 'admin',
    password: 'Admin@1234',
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
        
        // Check if admin user already exists
        let admin = await User.findOne({ role: 'admin' });
        
        if (!admin) {
            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(ADMIN_CONFIG.password, salt);
            
            // Create admin user
            admin = new User({
                ...ADMIN_CONFIG,
                password: hashedPassword
            });
            
            await admin.save();
            console.log('✅ Admin user created successfully');
        } else {
            // Update existing admin user with current config
            admin.whatsapp = ADMIN_CONFIG.whatsapp;
            admin.efootballId = ADMIN_CONFIG.efootballId;
            admin.profile = ADMIN_CONFIG.profile;
            admin.isActive = true;
            admin.isVerified = true;
            
            // Only update password if it's the default one
            if (ADMIN_CONFIG.password === 'Admin@1234') {
                const salt = await bcrypt.genSalt(10);
                admin.password = await bcrypt.hash(ADMIN_CONFIG.password, salt);
            }
            
            await admin.save();
            console.log('✅ Admin user updated successfully');
        }
    } catch (error) {
        console.error('❌ Error initializing admin user:', error);
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

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tournaments', require('./routes/tournaments'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/players', require('./routes/players'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));

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