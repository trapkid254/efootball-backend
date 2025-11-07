const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Security Middleware
app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        const allowed = [
            process.env.FRONTEND_URL,
            'http://localhost:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500'
        ].filter(Boolean);
        // Allow non-browser tools (no origin) and allowed origins
        if (!origin || allowed.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

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
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tona-kikwetu', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
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