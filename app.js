const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

// Demo Admin Configuration
const ADMIN_CONFIG = {
    whatsapp: '254714003218', // Demo WhatsApp number
    efootballId: 'DEMO123',   // Demo Efootball ID
    password: 'demo123',      // Simple demo password
    role: 'admin',
    profile: {
        displayName: 'Demo Admin',
        email: 'demo@tonakikwetu.com'
    },
    isActive: true,
    isVerified: true,
    isDemo: true,  // Mark as demo account
    stats: {
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        points: 1000,  // Starting points for demo
        ranking: 1     // Ranked first in demo
    }
};

// Log demo admin credentials (for development/demo only)
console.log('\n🚀 DEMO ADMIN CREDENTIALS 🚀');
console.log('==========================');
console.log(`📱 WhatsApp: ${ADMIN_CONFIG.whatsapp}`);
console.log(`🎮 Efootball ID: ${ADMIN_CONFIG.efootballId}`);
console.log(`🔑 Password: ${ADMIN_CONFIG.password}`);
console.log('==========================\n');

// Security note for production
if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️  WARNING: Running with demo admin credentials in production!');
    console.warn('   Please ensure you change these credentials before going live.\n');
}

// Function to initialize admin user
async function initializeAdminUser() {
    try {
        const User = require('./models/Users');
        
        console.log('Initializing admin user...');
        
        // Hash the password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(ADMIN_CONFIG.password, salt);
        
        // Prepare admin data with hashed password
        const adminData = {
            ...ADMIN_CONFIG,
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        // Check if admin exists by efootballId, whatsapp, or role
        let admin = await User.findOne({
            $or: [
                { efootballId: ADMIN_CONFIG.efootballId },
                { whatsapp: ADMIN_CONFIG.whatsapp },
                { role: 'admin' }
            ]
        });
        
        if (admin) {
            // Update existing admin
            console.log('Admin user found, updating...');
            console.log('Current admin data:', {
                _id: admin._id,
                whatsapp: admin.whatsapp,
                efootballId: admin.efootballId,
                role: admin.role,
                isActive: admin.isActive,
                isVerified: admin.isVerified
            });
            
            // Preserve original creation date if exists
            if (admin.createdAt) {
                adminData.createdAt = admin.createdAt;
            }
            
            // Update all fields
            Object.assign(admin, adminData);
            admin.updatedAt = new Date();
            
            console.log('Saving updated admin user...');
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
            if (!updatedAdmin.password) {
                console.warn('⚠️ Admin has no password set, setting new password...');
                updatedAdmin.password = hashedPassword;
                await updatedAdmin.save();
                console.log('✅ New admin password set successfully');
            } else {
                const isPasswordValid = await bcrypt.compare(ADMIN_CONFIG.password, updatedAdmin.password);
                console.log('✅ Password verification:', isPasswordValid ? 'Valid' : 'Invalid');
            }
            
            return updatedAdmin;
        } else {
            // Create new admin
            console.log('No admin user found, creating new one...');
            
            admin = new User(adminData);
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
        }
    } catch (error) {
        console.error('❌ Error initializing admin user:', error);
        if (error.name === 'ValidationError') {
            console.error('Validation errors:', Object.values(error.errors).map(e => e.message));
        }
        throw error; // Re-throw to be caught by the caller
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

console.log('Allowed CORS origins:', allowedOrigins);

// Enable CORS for all routes
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    // Allow all origins for now (for testing)
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '600');
    
    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    console.log(`✅ Request from origin: ${origin || 'no-origin'} (${req.method} ${req.path})`);
    next();
});

// Add a health check endpoint
app.get('/api/auth/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
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


// Serve static files with CORS headers
app.use('/uploads', (req, res, next) => {
    // Set CORS headers for all responses from /uploads
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
}, express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, path) => {
        res.header('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    }
}));

// Database connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tona-kikwetu';

// Log database connection info (without credentials)
console.log('Connecting to MongoDB...');

// Function to connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
            socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
        });
        console.log('✅ MongoDB connected successfully');
        
        // Initialize admin user after successful database connection
        await initializeAdminUser();
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    }
};

// Function to get an available port
const getAvailablePort = async (port) => {
    const net = require('net');
    const MAX_PORT = 65535;
    
    // Ensure port is a number and within valid range
    port = Number(port);
    if (isNaN(port) || port < 0 || port > MAX_PORT) {
        port = 10000; // Reset to default if invalid
    }
    
    return new Promise((resolve, reject) => {
        // If we've reached the maximum port number, reject with an error
        if (port > MAX_PORT) {
            return reject(new Error(`No available ports found (tried up to port ${port - 1})`));
        }
        
        const server = net.createServer();
        server.unref();
        
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                // Port is in use, try the next one
                console.log(`Port ${port} is in use, trying ${port + 1}...`);
                return resolve(getAvailablePort(port + 1));
            }
            // For other errors, reject the promise
            reject(err);
        });
        
        server.listen(port, '0.0.0.0', () => {
            const { port: availablePort } = server.address();
            server.close(() => {
                console.log(`Found available port: ${availablePort}`);
                resolve(availablePort);
            });
        });
    });
};

// Start the server
const startServer = async () => {
    try {
        await connectDB();
        
        const DEFAULT_PORT = 10000;
        const port = process.env.PORT || DEFAULT_PORT;
        
        // Get an available port
        const availablePort = await getAvailablePort(port);
        
        const server = app.listen(availablePort, () => {
            console.log(`🚀 Server is running on port ${availablePort}`);
            console.log(`🌐 Health check: http://localhost:${availablePort}/api/auth/health`);
        });
        
        // Handle server errors
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.warn(`⚠️  Port ${availablePort} is in use, trying next port...`);
                // Try the next port
                server.close();
                startServer(availablePort + 1);
            } else {
                console.error('❌ Server error:', error);
                process.exit(1);
            }
        });
        
        // Handle process termination
        process.on('SIGTERM', () => {
            console.log('SIGTERM received. Shutting down gracefully...');
            server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

// Start the application
startServer();

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

// Temporary admin routes (unsecured - for development only)
app.use('/api/temp-admin', require('./routes/tempAdmin'));

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