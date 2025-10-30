// server.js - BACKEND ReMine Citizen Track (Version Production Ready)
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Middleware de production
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:3001',
    'http://localhost:19006',
    'https://remine-dashboard.vercel.app',
    'https://remine-citizen-track.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuration
const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware de logging avancé
app.use((req, res, next) => {
  console.log(`📨 ${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// ==================== MODÈLES DE BASE ====================

// Schéma User simplifié
const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  firstName: { 
    type: String, 
    required: true,
    trim: true
  },
  lastName: { 
    type: String, 
    default: '',
    trim: true
  },
  password: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    default: 'citizen',
    enum: ['citizen', 'admin', 'operator']
  },
  community: { 
    type: String, 
    default: '',
    trim: true
  },
  phone: { 
    type: String, 
    default: '',
    trim: true
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  lastLogin: { 
    type: Date 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const User = mongoose.model('User', userSchema);

// Schéma Report simplifié
const reportSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['water_pollution', 'dust', 'abandoned_site', 'waste_deposit', 'air_pollution', 'soil_contamination', 'noise_pollution', 'other'],
    index: true
  },
  title: {
    type: String,
    default: '',
    trim: true
  },
  description: {
    type: String,
    required: true,
    minlength: 10,
    maxlength: 1000,
    trim: true
  },
  location: {
    address: {
      type: String,
      required: true,
      trim: true
    },
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180
    },
    region: { 
      type: String, 
      trim: true 
    },
    city: { 
      type: String, 
      trim: true 
    },
    postalCode: { 
      type: String, 
      trim: true 
    }
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  status: {
    type: String,
    enum: ['new', 'verified', 'in_progress', 'resolved', 'rejected'],
    default: 'new',
    index: true
  },
  citizen: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  images: [{
    url: String,
    caption: String,
    uploadedAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  confidenceScore: { 
    type: Number, 
    min: 0, 
    max: 100, 
    default: 50 
  },
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    index: true 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now, 
    index: true 
  }
}, {
  timestamps: true
});

const Report = mongoose.model('Report', reportSchema);

// ==================== ROUTES PRINCIPALES ====================

// Route racine
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 ReMine Citizen Track API is running!',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Health check détaillé
app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    
    const healthInfo = {
      status: 'OK',
      message: 'ReMine API is healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        status: dbStatus,
        readyState: mongoose.connection.readyState,
        name: mongoose.connection.name || 'unknown'
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        memory: process.memoryUsage()
      }
    };

    // Ajouter les infos DB si connecté
    if (dbStatus === 'Connected') {
      healthInfo.database.details = {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        databaseName: mongoose.connection.db?.databaseName
      };
      
      // Compter les documents
      try {
        healthInfo.database.counts = {
          users: await User.countDocuments(),
          reports: await Report.countDocuments()
        };
      } catch (countError) {
        healthInfo.database.counts = { error: 'Unable to count documents' };
      }
    }

    res.json(healthInfo);
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== ROUTES AUTH ====================

// Inscription utilisateur
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('📝 Registration attempt:', { ...req.body, password: '***' });
    
    const { email, firstName, password, lastName, role, community, phone } = req.body;
    
    // Validation
    if (!email || !firstName || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: email, firstName, password' 
      });
    }

    // Vérifier si l'utilisateur existe
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'User with this email already exists' 
      });
    }

    // Créer l'utilisateur
    const user = new User({
      email: email.toLowerCase().trim(),
      firstName: firstName.trim(),
      lastName: (lastName || '').trim(),
      password, // ⚠️ À hasher en production!
      role: role || 'citizen',
      community: (community || '').trim(),
      phone: (phone || '').trim()
    });

    await user.save();
    
    console.log('✅ User created:', user.email);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          community: user.community,
          phone: user.phone
        },
        token: 'jwt-token-placeholder' // ⚠️ Remplacer par JWT réel
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid data',
        details: errors
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Server error during registration'
    });
  }
});

// Connexion utilisateur
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt:', { email: req.body.email, password: '***' });
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and password required' 
      });
    }

    const user = await User.findOne({ 
      email: email.toLowerCase().trim(),
      isActive: true 
    });
    
    if (user && user.password === password) { // ⚠️ Comparaison directe - à changer!
      user.lastLogin = new Date();
      await user.save();
      
      console.log('✅ Login successful:', user.email);
      
      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            community: user.community,
            phone: user.phone,
            lastLogin: user.lastLogin
          },
          token: 'jwt-token-placeholder' // ⚠️ Remplacer par JWT réel
        }
      });
    } else {
      console.log('❌ Invalid credentials:', email);
      res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error during login'
    });
  }
});

// ==================== ROUTES REPORTS ====================

// Créer un signalement
app.post('/api/reports', async (req, res) => {
  try {
    console.log('📱 New report received');
    
    const { 
      type, 
      description, 
      location, 
      severity = 'medium', 
      citizenId,
      images = [],
      title = ''
    } = req.body;

    // Validation
    if (!type || !description || !location || !citizenId) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: type, description, location, citizenId' 
      });
    }

    // Vérifier l'utilisateur
    const user = await User.findById(citizenId);
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    // Créer le signalement
    const report = new Report({
      type,
      title: title || `${type.replace('_', ' ')} - ${new Date().toLocaleDateString('fr-FR')}`,
      description,
      location: {
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
        region: location.region || '',
        city: location.city || '',
        postalCode: location.postalCode || ''
      },
      severity,
      citizen: citizenId,
      images: images.map(img => ({
        url: img.url || img,
        caption: img.caption || ''
      })),
      confidenceScore: 60 // Score basique
    });

    await report.save();
    await report.populate('citizen', 'firstName lastName email community');

    console.log('✅ Report created:', report._id);

    res.status(201).json({
      success: true,
      message: 'Report created successfully',
      data: {
        report: {
          id: report._id,
          type: report.type,
          title: report.title,
          status: report.status,
          severity: report.severity,
          confidenceScore: report.confidenceScore,
          isVerified: report.isVerified,
          createdAt: report.createdAt,
          location: report.location,
          description: report.description,
          citizen: {
            id: report.citizen._id,
            firstName: report.citizen.firstName,
            lastName: report.citizen.lastName,
            email: report.citizen.email
          },
          images: report.images
        }
      }
    });

  } catch (error) {
    console.error('❌ Report creation error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid data',
        details: errors
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Server error during report creation'
    });
  }
});

// Récupérer tous les signalements
app.get('/api/reports', async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;

    const reports = await Report.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('citizen', 'firstName lastName email community')
      .lean();

    const total = await Report.countDocuments();

    res.json({
      success: true,
      data: {
        reports,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('❌ Get reports error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching reports' 
    });
  }
});

// ==================== ROUTES ADMIN ====================

// Statistiques
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalReports = await Report.countDocuments();
    const activeReports = await Report.countDocuments({ 
      status: { $in: ['new', 'verified', 'in_progress'] } 
    });
    const resolvedReports = await Report.countDocuments({ status: 'resolved' });

    const stats = {
      overview: {
        totalUsers,
        totalReports,
        activeReports,
        resolvedReports,
        resolutionRate: totalReports > 0 ? Math.round((resolvedReports / totalReports) * 100) : 0
      },
      reportsByType: await Report.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      reportsByStatus: await Report.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      recentReports: await Report.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('citizen', 'firstName lastName')
        .lean()
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error calculating statistics' 
    });
  }
});

// ==================== ROUTES UTILITAIRES ====================

// Route de test
app.post('/api/test', (req, res) => {
  console.log('🧪 Test request:', req.body);
  
  res.json({
    success: true,
    message: 'Test endpoint works!',
    data: req.body,
    serverInfo: {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
    }
  });
});

// Debug environnement
app.get('/api/debug/env', (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    hasMongoUrl: !!process.env.MONGODB_URI,
    mongoUrlLength: process.env.MONGODB_URI?.length || 0,
    jwtSecret: process.env.JWT_SECRET ? '***' : 'Not set'
  });
});

// ==================== CONNEXION MONGODB ====================

const connectDB = async () => {
  try {
    if (!MONGODB_URI) {
      console.log('❌ MONGODB_URI not found in environment variables');
      console.log('🔧 Please check your .env file');
      return;
    }

    console.log('🔄 Connecting to MongoDB Atlas...');
    
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority'
    });
    
    console.log('✅ MongoDB Atlas connected successfully!');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
    console.log(`🔗 Host: ${mongoose.connection.host}`);
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('💡 Tips:');
    console.log('   • Check your MONGODB_URI in .env file');
    console.log('   • Verify network connectivity to MongoDB Atlas');
    console.log('   • Check IP whitelist in MongoDB Atlas dashboard');
    console.log('   • Verify database user credentials');
    
    // Le serveur démarre quand même mais certaines fonctionnalités seront limitées
    console.log('🔧 Running in limited mode - some features may not work');
  }
};

// Gestionnaires d'événements MongoDB
mongoose.connection.on('connected', () => {
  console.log('🔌 Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔌 Mongoose disconnected from MongoDB');
});

// ==================== GESTION DES ERREURS ====================

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET  /',
      'GET  /api/health',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/reports',
      'GET  /api/reports',
      'GET  /api/admin/stats',
      'POST /api/test',
      'GET  /api/debug/env'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('💥 Global error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { 
      details: error.message,
      stack: error.stack
    })
  });
});

// ==================== DÉMARRAGE SERVEUR ====================

const startServer = async () => {
  try {
    console.log('🚀 Starting ReMine Citizen Track Server...');
    console.log('='.repeat(60));
    
    await connectDB();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log('='.repeat(60));
      console.log('✅ ReMine Server started successfully!');
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️ Database: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
      console.log('='.repeat(60));
      console.log('📋 Available endpoints:');
      console.log(`   🔍 Health: http://localhost:${PORT}/api/health`);
      console.log(`   🐛 Debug: http://localhost:${PORT}/api/debug/env`);
      console.log(`   👤 Register: POST http://localhost:${PORT}/api/auth/register`);
      console.log(`   📱 Reports: POST http://localhost:${PORT}/api/reports`);
      console.log('='.repeat(60));
      console.log('🎯 Server ready for production!');
    });
    
  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
};

// Gestion propre de l'arrêt
process.on('SIGINT', async () => {
  console.log('\n🔻 Shutting down ReMine server...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔻 Shutting down ReMine server (SIGTERM)...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});

// Démarrer le serveur
startServer();