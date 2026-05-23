// Server.js - VERSION COMPLÈTE AVEC NOTIFICATIONS PUSH
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

// ==================== CONFIGURATION ====================

const PORT        = process.env.PORT        || 5001;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';
const NODE_ENV    = process.env.NODE_ENV    || 'development';

// Vérification des variables critiques
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI manquante dans .env — arrêt du serveur');
  process.exit(1);
}
if (!JWT_SECRET || JWT_SECRET === 'CHANGE_ME_GENERATE_A_LONG_RANDOM_STRING') {
  console.error('❌ JWT_SECRET manquante ou non modifiée dans .env — arrêt du serveur');
  process.exit(1);
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:19006')
  .split(',')
  .map(o => o.trim());

// Fonction CORS dynamique — accepte localhost, origines configurées, et toutes les URLs ngrok
const corsOriginFn = (origin, callback) => {
  if (
    !origin ||
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith('.ngrok-free.app') ||
    origin.endsWith('.ngrok-free.dev') ||
    origin.endsWith('.ngrok.io')
  ) {
    callback(null, true);
  } else {
    console.warn('🚫 CORS bloqué pour:', origin);
    callback(new Error('Not allowed by CORS'));
  }
};

// ==================== SERVEUR ====================

const app        = express();
const httpServer = createServer(app);

// Socket.io pour les clients web
const io = new Server(httpServer, {
  cors: { origin: corsOriginFn, methods: ['GET', 'POST', 'PUT'], credentials: true }
});
global.io = io;

// WebSocket natif pour l'app mobile
const wss = new WebSocketServer({ server: httpServer, path: '/' });
const mobileClients = new Map(); // userId -> ws

wss.on('connection', (ws) => {
  let userId = null;
  console.log('📱 Mobile WebSocket connecté');

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'identify' && msg.userId) {
        userId = msg.userId;
        mobileClients.set(userId, ws);
        console.log('📱 Mobile identifié:', userId);
      }
    } catch {}
  });

  ws.on('close', () => {
    if (userId) mobileClients.delete(userId);
    console.log('📱 Mobile WebSocket déconnecté');
  });

  ws.on('error', (err) => console.log('📱 WS error:', err.message));
});

// Fonctions globales pour les notifications mobiles
global.notifyUser = (userId, event, data) => {
  const ws = mobileClients.get(String(userId));
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify({ type: event, data }));
    } catch (e) {
      console.log('notifyUser error:', e.message);
    }
  }
};

global.broadcastMobile = (event, data) => {
  const msg = JSON.stringify({ type: event, data });
  mobileClients.forEach((ws) => {
    if (ws.readyState === 1) {
      try { ws.send(msg); } catch {}
    }
  });
};

// Middleware
app.use(cors({ origin: corsOriginFn, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging minimal
app.use((req, _res, next) => {
  if (NODE_ENV === 'development') {
    console.log(`📨 ${req.method} ${req.url}`);
  }
  next();
});

// ==================== CONNEXION MONGODB ====================

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Atlas connecté'))
  .catch(err => { console.error('❌ Erreur MongoDB:', err); process.exit(1); });

// ==================== MODÈLES ====================

// Modèle User
const userSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  firstName: { type: String, required: true, trim: true },
  lastName:  { type: String, default: '', trim: true },
  password:  { type: String, required: true },
  role:      { type: String, default: 'citizen', enum: ['citizen', 'admin', 'moderator'] },
  community: { type: String, default: '', trim: true },
  phone:     { type: String, default: '', trim: true },
  isActive:  { type: Boolean, default: true },
  lastLogin: { type: Date },
}, { timestamps: true });

userSchema.methods.toPublicJSON = function () {
  return {
    id:        this._id,
    email:     this.email,
    firstName: this.firstName,
    lastName:  this.lastName,
    role:      this.role,
    community: this.community,
  };
};

const User = mongoose.model('User', userSchema);

// Modèle PushToken
const pushTokenSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token:     { type: String, required: true, unique: true },
  platform:  { type: String, enum: ['ios', 'android', 'web'], required: true },
  deviceName: { type: String, default: '' },
  appVersion: { type: String, default: '' },
  isActive:  { type: Boolean, default: true },
  lastUsed:  { type: Date, default: Date.now },
}, { timestamps: true });

const PushToken = mongoose.model('PushToken', pushTokenSchema);

// Modèle Report
const reportSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['water_pollution', 'dust', 'abandoned_site', 'waste_deposit',
           'air_pollution', 'soil_contamination', 'noise_pollution', 'other'],
    index: true,
  },
  title:       { type: String, default: '' },
  description: {
    type: String, required: true,
    minlength: 10, maxlength: 1000, trim: true,
  },
  location: {
    address:   { type: String, required: true, trim: true },
    latitude:  { type: Number, required: true, min: -90,  max: 90  },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    region:    { type: String, trim: true },
    city:      { type: String, trim: true },
    postalCode:{ type: String, trim: true },
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium', index: true,
  },
  status: {
    type: String,
    enum: ['new', 'verified', 'in_progress', 'resolved', 'rejected'],
    default: 'new', index: true,
  },
  citizen: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  images: [{
    url:        { type: String, required: true },
    caption:    { type: String, maxlength: 200 },
    uploadedAt: { type: Date, default: Date.now },
  }],
  processing: {
    assignedTo:             { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt:             Date,
    priority:               { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    estimatedResolutionTime: Date,
    notes: [{
      content:  String,
      addedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      addedAt:  { type: Date, default: Date.now },
      type:     { type: String, enum: ['internal', 'public'], default: 'internal' },
    }],
  },
  metadata:        { deviceType: String, appVersion: String, ipAddress: String },
  isVerified:      { type: Boolean, default: false },
  votes: [{
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voteType:  { type: String, enum: ['up', 'down'] },
    createdAt: { type: Date, default: Date.now },
  }],
  voteCount: { type: Number, default: 0 },
  confidenceScore: { type: Number, min: 0, max: 100, default: 50 },
  resolvedAt:      Date,
}, { timestamps: true });

// ==================== MODÈLE COMMENTAIRE ====================
const commentSchema = new mongoose.Schema({
  report:  { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  author:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  content: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
  type:    { type: String, enum: ['public', 'admin_message'], default: 'public' },
  isRead:  { type: Boolean, default: false },
  readBy:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });
commentSchema.index({ report: 1, createdAt: 1 });
const Comment = mongoose.model('Comment', commentSchema);

// ==================== MODÈLE JOURNAL DE SUPPRESSION ====================
const deletionLogSchema = new mongoose.Schema({
  reportId:      { type: String, required: true },           // ID conservé même après suppression
  reportType:    { type: String },
  reportTitle:   { type: String },
  reportDescription: { type: String },
  reportLocation:    { type: Object },
  reportSeverity:    { type: String },
  reportStatus:      { type: String },
  reportCreatedAt:   { type: Date },
  citizenId:         { type: String },
  citizenEmail:      { type: String },
  citizenName:       { type: String },
  deletedBy: {
    id:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email:     { type: String, required: true },
    firstName: { type: String },
    lastName:  { type: String },
    role:      { type: String },
  },
  reason:        { type: String, default: '' },
  deletedAt:     { type: Date, default: Date.now, index: true },
  ipAddress:     { type: String },
}, { timestamps: false });

deletionLogSchema.index({ deletedAt: -1 });
deletionLogSchema.index({ 'deletedBy.id': 1 });

const DeletionLog = mongoose.model('DeletionLog', deletionLogSchema);

// ==================== MODÈLE PROJETS DE VALORISATION ====================
const valorizationProjectSchema = new mongoose.Schema({
  name:            { type: String, required: true, trim: true },
  description:     { type: String, default: '' },
  location:        { type: String, default: '' },
  status:          { type: String, enum: ['planning', 'active', 'paused', 'completed'], default: 'planning' },
  wasteProcessed:  { type: Number, default: 0 },  // tonnes
  productsCreated: { type: Number, default: 0 },
  revenue:         { type: Number, default: 0 },   // en euros
  teamSize:        { type: Number, default: 1 },
  co2Avoided:      { type: Number, default: 0 },   // tonnes CO2
  targetWaste:     { type: Number, default: 0 },   // objectif tonnes
  targetRevenue:   { type: Number, default: 0 },   // objectif euros
  category:        { type: String, enum: ['recyclage', 'depollution', 'energie', 'construction', 'agriculture', 'autre'], default: 'autre' },
  startDate:       { type: Date, default: Date.now },
  endDate:         { type: Date },
  partners:        [{ type: String }],
  tags:            [{ type: String }],
  notes:           { type: String, default: '' },
  createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const ValorizationProject = mongoose.model('ValorizationProject', valorizationProjectSchema);

reportSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });
reportSchema.index({ status: 1, severity: 1 });
reportSchema.index({ citizen: 1, createdAt: -1 });
reportSchema.index({ createdAt: -1 });

reportSchema.statics.getStats = async function () {
  const [stats] = await this.aggregate([
    {
      $group: {
        _id: null,
        totalReports:       { $sum: 1 },
        activeReports:      { $sum: { $cond: [{ $in: ['$status', ['new', 'verified', 'in_progress']] }, 1, 0] } },
        resolvedReports:    { $sum: { $cond: [{ $eq:  ['$status', 'resolved'] }, 1, 0] } },
        highSeverityReports:{ $sum: { $cond: [{ $in: ['$severity', ['high', 'critical']] }, 1, 0] } },
        avgConfidenceScore: { $avg: '$confidenceScore' },
      },
    },
    {
      $project: {
        _id: 0,
        totalReports: 1, activeReports: 1, resolvedReports: 1, highSeverityReports: 1,
        resolutionRate: {
          $cond: [
            { $eq: ['$totalReports', 0] }, 0,
            { $multiply: [{ $divide: ['$resolvedReports', '$totalReports'] }, 100] },
          ],
        },
        avgConfidenceScore: { $round: ['$avgConfidenceScore', 2] },
      },
    },
  ]);
  return stats || { totalReports: 0, activeReports: 0, resolvedReports: 0,
                    highSeverityReports: 0, resolutionRate: 0, avgConfidenceScore: 0 };
};

const Report = mongoose.model('Report', reportSchema);

// ==================== UTILITAIRES ====================

function calculateConfidenceScore(description, images, metadata) {
  let score = 50;
  if (description.length > 100) score += 15;
  if (description.length > 200) score += 10;
  if (images?.length)            score += images.length * 10;
  if (metadata?.deviceType && metadata?.appVersion) score += 5;
  return Math.min(score, 100);
}

function generateToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// ==================== CLOUDINARY ====================

const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_KEY   = process.env.CLOUDINARY_API_KEY    || '';
const CLOUDINARY_SECRET= process.env.CLOUDINARY_API_SECRET || '';

async function uploadToCloudinary(base64Data) {
  try {
    // Extraire le type MIME et les données
    const matches  = base64Data.match(/^data:(.+);base64,(.+)$/);
    if (!matches) throw new Error('Format base64 invalide');
    const mimeType = matches[1];
    const data     = matches[2];

    // Signature pour upload signé
    const timestamp = Math.round(Date.now() / 1000);
    const folder    = 'remine';
    const toSign    = `folder=${folder}&timestamp=${timestamp}${CLOUDINARY_SECRET}`;
    const crypto    = await import('crypto');
    const signature = crypto.default.createHash('sha1').update(toSign).digest('hex');

    const formData = new URLSearchParams();
    formData.append('file',      `data:${mimeType};base64,${data}`);
    formData.append('api_key',   CLOUDINARY_KEY);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder',    folder);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
      { method: 'POST', body: formData }
    );

    const result = await response.json();
    if (result.secure_url) {
      console.log('✅ Cloudinary upload:', result.secure_url);
      return {
        url:       result.secure_url,
        publicId:  result.public_id,
        thumbnail: result.secure_url.replace('/upload/', '/upload/w_200,h_200,c_fill/'),
      };
    }
    throw new Error(result.error?.message || 'Upload échoué');
  } catch (e) {
    console.error('❌ Cloudinary error:', e.message);
    return null;
  }
}

// ==================== MIDDLEWARE ====================

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token d\'authentification requis' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Session expirée, veuillez vous reconnecter' });
    }
    return res.status(401).json({ success: false, error: 'Token invalide' });
  }
}

function requireAdmin(req, res, next) {
  if (!['admin', 'moderator'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, error: 'Accès réservé aux administrateurs' });
  }
  next();
}

// ==================== ROUTES HEALTH ====================

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: NODE_ENV,
  });
});

// ==================== ROUTES AUTH ====================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, firstName, lastName, password, role, community, phone } = req.body;

    if (!email || !firstName || !password) {
      return res.status(400).json({ success: false, error: 'Champs obligatoires : email, firstName, password' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Le mot de passe doit contenir au moins 8 caractères' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Un compte avec cet email existe déjà' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email, firstName, lastName: lastName || '',
      password: hashedPassword,
      role: role || 'citizen',
      community: community || '',
      phone: phone || '',
    });
    await user.save();

    const token = generateToken(user);

    console.log('✅ Inscription:', user.email);
    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      data: { user: user.toPublicJSON(), token },
    });

  } catch (error) {
    console.error('❌ Erreur inscription:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur lors de l\'inscription' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user);

    console.log('✅ Connexion:', user.email);
    res.json({
      success: true,
      message: 'Connexion réussie',
      data: { user: user.toPublicJSON(), token },
    });

  } catch (error) {
    console.error('❌ Erreur connexion:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur lors de la connexion' });
  }
});

app.put('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName, phone, community } = req.body;
    if (!firstName?.trim()) return res.status(400).json({ success: false, error: 'Prénom obligatoire' });
    const user = await User.findByIdAndUpdate(req.user.id,
      { firstName: firstName.trim(), lastName: (lastName||'').trim(), phone: (phone||'').trim(), community: (community||'').trim() },
      { new: true, select: '-password' });
    res.json({ success: true, message: 'Profil mis à jour', data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.put('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, error: 'Champs manquants' });
    if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'Mot de passe trop court (min. 8)' });
    const user = await User.findById(req.user.id);
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ success: false, error: 'Mot de passe actuel incorrect' });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true, message: 'Mot de passe modifié' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email requis' });
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.json({ success: true, message: 'Si cet email existe, un lien vous sera envoyé.' });
    }
    const crypto = await import('crypto');
    const resetToken = crypto.default.randomBytes(32).toString('hex');
    console.log(`🔐 Reset token pour ${email}: ${resetToken}`);
    res.json({ success: true, message: 'Un lien de réinitialisation a été envoyé à votre adresse email.' });
  } catch (error) {
    console.error('❌ Erreur reset-password:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES PUSH TOKENS ====================

app.post('/api/users/push-token', requireAuth, async (req, res) => {
  try {
    const { token, platform, deviceName, appVersion } = req.body;
    const userId = req.user.id;

    if (!token || !platform) {
      return res.status(400).json({ success: false, error: 'Token et platform requis' });
    }

    await PushToken.updateMany({ userId, isActive: true }, { isActive: false });

    const pushToken = await PushToken.findOneAndUpdate(
      { token },
      { userId, platform, deviceName, appVersion, isActive: true, lastUsed: new Date() },
      { upsert: true, new: true }
    );

    console.log('✅ Token push sauvegardé pour:', req.user.email);
    res.json({ success: true, message: 'Token push enregistré', data: { id: pushToken._id } });

  } catch (error) {
    console.error('❌ Erreur sauvegarde push token:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.delete('/api/users/push-token', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (token) {
      await PushToken.findOneAndUpdate({ token }, { isActive: false });
    } else {
      await PushToken.updateMany({ userId: req.user.id }, { isActive: false });
    }
    console.log('✅ Token push désactivé pour:', req.user.email);
    res.json({ success: true, message: 'Token push désactivé' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.post('/api/notifications/send', requireAuth, async (req, res) => {
  try {
    const { userId, title, body, data = {} } = req.body;
    
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ success: false, error: 'Non autorisé' });
    }

    const tokens = await PushToken.find({ userId, isActive: true });
    
    if (tokens.length === 0) {
      return res.json({ success: false, error: 'Aucun token push actif' });
    }

    const results = await Promise.allSettled(
      tokens.map(async (pushToken) => {
        const message = {
          to: pushToken.token,
          sound: 'default',
          title,
          body,
          data: { ...data, timestamp: new Date().toISOString() },
          priority: 'high',
        };

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });

        const result = await response.json();
        
        if (result.data?.status === 'ok') {
          await PushToken.findByIdAndUpdate(pushToken._id, { lastUsed: new Date() });
        } else if (result.data?.status === 'error' && result.data?.message?.includes('DeviceNotRegistered')) {
          await PushToken.findByIdAndUpdate(pushToken._id, { isActive: false });
        }
        
        return result;
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value?.data?.status === 'ok').length;
    
    console.log(`📤 Notification envoyée à ${successful}/${tokens.length} appareils`);
    res.json({ 
      success: true, 
      message: `Notification envoyée à ${successful} appareil(s)`,
      data: { sent: successful, total: tokens.length }
    });

  } catch (error) {
    console.error('❌ Erreur envoi notification:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.post('/api/notifications/broadcast', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, body, data = {}, targetRoles = [] } = req.body;
    
    if (!title || !body) {
      return res.status(400).json({ success: false, error: 'Title et body requis' });
    }

    const filter = { isActive: true };
    if (targetRoles.length > 0) {
      const users = await User.find({ role: { $in: targetRoles } }).select('_id');
      filter.userId = { $in: users.map(u => u._id) };
    }

    const tokens = await PushToken.find(filter);
    
    if (tokens.length === 0) {
      return res.json({ success: false, error: 'Aucun token actif' });
    }

    const batchSize = 100;
    let sent = 0;
    
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const messages = batch.map(token => ({
        to: token.token,
        sound: 'default',
        title,
        body,
        data: { ...data, broadcast: true, timestamp: new Date().toISOString() },
        priority: 'high',
      }));

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      
      const result = await response.json();
      sent += result.data?.filter(r => r.status === 'ok').length || 0;
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`📢 Broadcast: "${title}" envoyé à ${sent}/${tokens.length} appareils`);
    res.json({ 
      success: true, 
      message: `Broadcast envoyé à ${sent} appareil(s)`,
      data: { sent, total: tokens.length }
    });

  } catch (error) {
    console.error('❌ Erreur broadcast:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES SIGNALEMENTS ====================

app.post('/api/reports', requireAuth, async (req, res) => {
  try {
    const { type, description, location, severity = 'medium', images = [], metadata = {}, title = '' } = req.body;
    const citizenId = req.user.id;

    if (!type || !description || !location) {
      return res.status(400).json({ success: false, error: 'Champs obligatoires : type, description, location' });
    }
    if (!location.latitude || !location.longitude || !location.address) {
      return res.status(400).json({ success: false, error: 'Localisation incomplète' });
    }

    // Traitement des images — upload sur Cloudinary si base64
    const processedImages = [];
    for (const img of (images || [])) {
      const url = img.url || img;
      if (typeof url === 'string' && url.startsWith('data:')) {
        // Base64 → Cloudinary
        const uploaded = await uploadToCloudinary(url);
        if (uploaded) {
          processedImages.push({ url: uploaded.url, caption: img.caption || '', publicId: uploaded.publicId });
        }
      } else if (typeof url === 'string' && url.startsWith('http')) {
        // Déjà une URL — garder tel quel
        processedImages.push({ url, caption: img.caption || '' });
      }
    }

    const confidenceScore = calculateConfidenceScore(description, processedImages, metadata);

    const report = new Report({
      type, title, description,
      location: {
        address:    location.address,
        latitude:   location.latitude,
        longitude:  location.longitude,
        region:     location.region,
        city:       location.city,
        postalCode: location.postalCode,
      },
      severity,
      citizen: citizenId,
      images:  processedImages,
      metadata: { ...metadata, ipAddress: req.ip },
      confidenceScore,
      isVerified: confidenceScore > 70,
    });

    await report.save();
    await report.populate('citizen', 'firstName lastName email community');

    if (global.io) {
      global.io.emit('new-report', { type: 'NEW_REPORT', data: report });
      if (global.emitSSE) global.emitSSE('new-report', { type: 'NEW_REPORT', reportId: report._id, reportType: report.type, severity: report.severity });
    }

    console.log('✅ Signalement créé:', report._id, 'par', req.user.email);
    res.status(201).json({
      success: true,
      message: 'Signalement créé avec succès',
      data: { report },
    });

  } catch (error) {
    console.error('❌ Erreur création signalement:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: Object.values(error.errors).map(e => e.message),
      });
    }
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.get('/api/reports/mine', requireAuth, async (req, res) => {
  try {
    const reports = await Report.find({ citizen: req.user.id })
      .populate('citizen', 'firstName lastName email community')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    console.log('✅ /reports/mine pour', req.user.email, ':', reports.length, 'signalement(s)');

    res.json({ 
      success: true, 
      data: { reports },
      count: reports.length
    });
  } catch (error) {
    console.error('❌ Erreur mes signalements:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    const { limit = 20, page = 1, status, type, severity } = req.query;
    const filter = {};
    if (status   && status   !== 'all') filter.status   = status;
    if (type     && type     !== 'all') filter.type     = type;
    if (severity && severity !== 'all') filter.severity = severity;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [reports, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .populate('citizen', 'firstName lastName community')
        .lean(),
      Report.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { reports, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error('❌ Erreur récupération signalements publics:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.get('/api/reports/public', async (req, res) => {
  try {
    const { limit = 30, sortBy = 'voteCount', sortOrder = 'desc' } = req.query;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const reports = await Report.find({ status: { $ne: 'rejected' } })
      .sort(sort).limit(parseInt(limit))
      .populate('citizen', 'firstName lastName community')
      .select('-processing.notes').lean();
    res.json({ success: true, data: { reports, total: reports.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.get('/api/reports/:id', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('citizen', 'firstName lastName community')
      .populate('processing.assignedTo', 'firstName lastName');
    if (!report) {
      return res.status(404).json({ success: false, error: 'Signalement non trouvé' });
    }
    res.json({ success: true, data: { report } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES VOTES ====================

app.post('/api/reports/:id/vote', requireAuth, async (req, res) => {
  try {
    const { voteType } = req.body;
    const reportId = req.params.id;
    const userId   = req.user.id;

    if (!['up', 'down'].includes(voteType)) {
      return res.status(400).json({ success: false, error: 'Type de vote invalide' });
    }

    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ success: false, error: 'Signalement non trouvé' });

    if (!report.votes) report.votes = [];

    const existingVoteIndex = report.votes.findIndex(v => String(v.userId) === String(userId));
    let action = '';

    if (existingVoteIndex >= 0) {
      const existing = report.votes[existingVoteIndex];
      if (existing.voteType === voteType) {
        report.votes.splice(existingVoteIndex, 1);
        action = 'removed';
      } else {
        report.votes[existingVoteIndex].voteType = voteType;
        action = 'changed';
      }
    } else {
      report.votes.push({ userId, voteType, createdAt: new Date() });
      action = 'added';
    }

    report.voteCount = report.votes.filter(v => v.voteType === 'up').length
                     - report.votes.filter(v => v.voteType === 'down').length;
    report.markModified('votes');
    await report.save();

    const upvotes   = report.votes.filter(v => v.voteType === 'up').length;
    const downvotes = report.votes.filter(v => v.voteType === 'down').length;

    console.log('Vote:', userId, voteType, 'sur', reportId, '→', action);
    res.json({
      success: true,
      data: {
        action,
        voteType,
        upvotes,
        downvotes,
        score:    upvotes - downvotes,
        voteCount: report.voteCount,
        userVote:  action === 'removed' ? null : voteType,
      }
    });
  } catch (error) {
    console.error('Erreur vote:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.get('/api/reports/:id/vote', requireAuth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id).select('votes voteCount').lean();
    if (!report) return res.status(404).json({ success: false, error: 'Signalement non trouvé' });

    const votes     = report.votes || [];
    const upvotes   = votes.filter(v => v.voteType === 'up').length;
    const downvotes = votes.filter(v => v.voteType === 'down').length;
    const userVote  = votes.find(v => String(v.userId) === String(req.user.id));

    res.json({
      success: true,
      data: {
        userVote:  userVote?.voteType || null,
        upvotes,
        downvotes,
        score:     upvotes - downvotes,
        voteCount: report.voteCount || 0,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Stats personnelles du citoyen connecté
app.get('/api/users/me/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [reports, commentCount] = await Promise.all([
      Report.find({ citizen: userId }).lean(),
      Comment.countDocuments({ author: userId }).catch(() => 0),
    ]);
    const byStatus       = reports.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    const resolved       = byStatus.resolved || 0;
    const total          = reports.length;
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
    const totalVotes     = reports.reduce((s, r) => s + (r.voteCount || 0), 0);
    const thisMonth      = reports.filter(r => new Date(r.createdAt) > new Date(Date.now() - 30 * 86400000)).length;
    const latest         = [...reports].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const rank           = total >= 20 ? '🏆 Expert' : total >= 10 ? '⭐ Actif' : total >= 5 ? '🌱 Engagé' : '🆕 Débutant';
    res.json({
      success: true,
      data: { total, byStatus, resolved, resolutionRate, totalVotes, commentCount, thisMonth, rank,
        latestReport: latest ? { id: latest._id, type: latest.type, status: latest.status, date: latest.createdAt } : null
      }
    });
  } catch (error) {
    console.error('❌ Erreur stats citoyen:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES ADMIN ====================

app.get('/api/admin/reports', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, page = 1, status, type, severity, sortBy = 'createdAt', sortOrder = 'desc', search } = req.query;

    const filter = {};
    if (status   && status   !== 'all') filter.status   = status;
    if (type     && type     !== 'all') filter.type     = type;
    if (severity && severity !== 'all') filter.severity = severity;
    if (search?.trim()) {
      filter.$or = [
        { description:        { $regex: search, $options: 'i' } },
        { 'location.address': { $regex: search, $options: 'i' } },
        { title:              { $regex: search, $options: 'i' } },
      ];
    }

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reports, total, stats] = await Promise.all([
      Report.find(filter).sort(sort).limit(parseInt(limit)).skip(skip)
        .populate('citizen', 'firstName lastName email community phone')
        .populate('processing.assignedTo', 'firstName lastName')
        .lean(),
      Report.countDocuments(filter),
      Report.getStats(),
    ]);

    res.json({
      success: true,
      data: { reports, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)), stats },
    });

  } catch (error) {
    console.error('❌ Erreur récupération signalements:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.put('/api/admin/reports/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, note, assignedTo } = req.body;

    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Signalement non trouvé' });
    }

    const oldStatus   = report.status;
    const wasAssigned = !report.processing.assignedTo && assignedTo;
    const wasVerified = !report.isVerified && status === 'verified';
    const wasResolved = status === 'resolved' && oldStatus !== 'resolved';

    report.status = status;
    if (note) {
      report.processing.notes.push({ content: note, addedBy: req.user.id, type: 'internal' });
    }
    if (assignedTo) {
      report.processing.assignedTo = assignedTo;
      report.processing.assignedAt = new Date();
    }
    if (wasResolved) report.resolvedAt = new Date();
    if (wasVerified) report.isVerified = true;

    await report.save();
    await report.populate('processing.assignedTo', 'firstName lastName');

    if (global.io) {
      global.io.emit('report-updated', { type: 'REPORT_UPDATED', data: report });
      if (global.emitSSE) global.emitSSE('report-updated', { reportId: report._id, status: report.status });
    }

    const citizenId = String(report.citizen?._id || report.citizen?.id || report.citizen);
    const base = {
      reportId:    String(report._id),
      type:        report.type,
      description: (report.description || '').substring(0, 80),
      location:    report.location,
    };

    const notify = (evt, payload) => {
      if (global.notifyUser) global.notifyUser(citizenId, evt, payload);
    };

    if (status !== oldStatus) notify('status_update',  { ...base, newStatus: status, oldStatus });
    if (note)                 notify('note_added',      { ...base, note, addedBy: req.user.firstName || req.user.email });
    if (wasAssigned)          notify('report_assigned', { ...base, agent: report.processing.assignedTo ? report.processing.assignedTo.firstName + ' ' + report.processing.assignedTo.lastName : 'Un agent' });
    if (wasVerified)          notify('report_verified', base);
    if (wasResolved)          notify('report_resolved', { ...base, resolvedAt: report.resolvedAt });

    console.log('Statut mis à jour:', report._id, '->', status, 'par', req.user.email);
    res.json({ success: true, message: 'Statut mis à jour', data: { report } });

  } catch (error) {
    console.error('Erreur mise à jour statut:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [reportStats, totalUsers, activeUsers, recentReports, reportsByType, reportsByStatus, topCitizens] =
      await Promise.all([
        Report.getStats(),
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        Report.find().sort({ createdAt: -1 }).limit(5)
          .populate('citizen', 'firstName lastName').lean(),
        Report.aggregate([{ $group: { _id: '$type',   count: { $sum: 1 } } }]),
        Report.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Report.aggregate([
          { $group: { _id: '$citizen', reports: { $sum: 1 } } },
          { $sort: { reports: -1 } },
          { $limit: 5 },
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'citizenInfo' } },
          { $project: {
            reports: 1,
            citizen: {
              name:  { $concat: [{ $arrayElemAt: ['$citizenInfo.firstName', 0] }, ' ', { $arrayElemAt: ['$citizenInfo.lastName', 0] }] },
              email: { $arrayElemAt: ['$citizenInfo.email', 0] },
            },
          }},
        ]),
      ]);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const reportsLast7Days = await Report.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    res.json({
      success: true,
      data: {
        overview: {
          totalReports:    reportStats.totalReports,
          activeReports:   reportStats.activeReports,
          resolvedReports: reportStats.resolvedReports,
          resolutionRate:  reportStats.resolutionRate,
          totalUsers,
          activeUsers,
        },
        reportsByType:   reportsByType.reduce((acc, i)   => { acc[i._id] = i.count; return acc; }, {}),
        reportsByStatus: reportsByStatus.reduce((acc, i) => { acc[i._id] = i.count; return acc; }, {}),
        recentReports,
        topCitizens,
        recentActivity: { reportsLast7Days },
      },
    });

  } catch (error) {
    console.error('❌ Erreur statistiques:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.put('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['citizen', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Rôle invalide' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, select: '-password' }
    );
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    console.log('✅ Rôle modifié:', user.email, '->', role, 'par', req.user.email);
    res.json({ success: true, message: 'Rôle mis à jour', data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, error: 'Impossible de supprimer un administrateur' });
    }
    await User.findByIdAndDelete(req.params.id);
    console.log('✅ Utilisateur supprimé:', user.email, 'par', req.user.email);
    res.json({ success: true, message: 'Utilisateur supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== WEBSOCKET ====================

io.on('connection', (socket) => {
  console.log('🔌 Client connecté:', socket.id);
  socket.on('join-dashboard', () => socket.join('dashboard'));
  socket.on('disconnect', () => console.log('🔌 Client déconnecté:', socket.id));
});


// Analytics avancés — admin seulement
app.get('/api/admin/analytics', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { range = '30d' } = req.query;
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [reportStats, reportsInRange, hotspots] = await Promise.all([
      Report.getStats(),
      Report.countDocuments({ createdAt: { $gte: since } }),
      Report.aggregate([
        { $group: { _id: '$location.city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $project: { location: '$_id', count: 1, _id: 0 } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        trends: {
          activeReports: reportStats.activeReports,
          resolutionRate: reportStats.resolutionRate,
          reportsInRange,
        },
        hotspots,
        impact: {
          savedCO2: reportStats.totalReports * 2.5,
          wasteProcessed: reportStats.totalReports * 15,
          waterProtected: reportStats.totalReports * 1000,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur analytics' });
  }
});

// Impact environnemental — admin seulement
app.get('/api/admin/impact', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [reportStats, totalUsers] = await Promise.all([Report.getStats(), User.countDocuments()]);
    res.json({
      success: true,
      data: {
        environmental: {
          co2Saved: reportStats.totalReports * 2.5,
          waterProtected: reportStats.totalReports * 1000,
          landRehabilitated: Math.floor(reportStats.totalReports / 10),
          wasteDiverted: reportStats.totalReports * 15,
        },
        social: {
          jobsCreated: Math.floor(reportStats.totalReports / 3),
          citizensEngaged: totalUsers,
          communitiesImpacted: 8,
        },
        economic: {
          revenueGenerated: reportStats.totalReports * 1000,
          costSavings: reportStats.totalReports * 500,
          newProducts: Math.floor(reportStats.totalReports / 20),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur métriques impact' });
  }
});

// Projets de valorisation — admin seulement
// ==================== ROUTES VALORISATION CRUD ====================

// GET — liste des projets
app.get('/api/valorization/projects', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, category, search } = req.query;
    const filter = {};
    if (status   && status   !== 'all') filter.status   = status;
    if (category && category !== 'all') filter.category = category;
    if (search?.trim()) {
      filter.$or = [
        { name:        { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location:    { $regex: search, $options: 'i' } },
      ];
    }

    const projects = await ValorizationProject.find(filter)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'firstName lastName')
      .lean();

    // Stats globales
    const all = await ValorizationProject.find({}).lean();
    const stats = {
      total:           all.length,
      active:          all.filter(p => p.status === 'active').length,
      totalWaste:      all.reduce((s, p) => s + (p.wasteProcessed || 0), 0),
      totalRevenue:    all.reduce((s, p) => s + (p.revenue || 0), 0),
      totalCO2:        all.reduce((s, p) => s + (p.co2Avoided || 0), 0),
      totalJobs:       all.reduce((s, p) => s + (p.teamSize || 0), 0),
      totalProducts:   all.reduce((s, p) => s + (p.productsCreated || 0), 0),
    };

    res.json({ success: true, data: projects, stats });
  } catch (error) {
    console.error('❌ Erreur valorization GET:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// POST — créer un projet
app.post('/api/valorization/projects', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      name, description, location, status, category,
      wasteProcessed, productsCreated, revenue, co2Avoided,
      targetWaste, targetRevenue, teamSize,
      startDate, endDate, partners, tags, notes,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Le nom du projet est requis' });
    }

    const project = await ValorizationProject.create({
      name: name.trim(), description, location, status: status || 'planning', category: category || 'autre',
      wasteProcessed: parseFloat(wasteProcessed) || 0,
      productsCreated: parseInt(productsCreated) || 0,
      revenue: parseFloat(revenue) || 0,
      co2Avoided: parseFloat(co2Avoided) || 0,
      targetWaste: parseFloat(targetWaste) || 0,
      targetRevenue: parseFloat(targetRevenue) || 0,
      teamSize: parseInt(teamSize) || 1,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : undefined,
      partners: Array.isArray(partners) ? partners : [],
      tags:     Array.isArray(tags)     ? tags     : [],
      notes, createdBy: req.user.id,
    });

    console.log(`✅ Projet valorisation créé: ${project.name} par ${req.user.email}`);
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error('❌ Erreur valorization POST:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// PUT — mettre à jour un projet
app.put('/api/valorization/projects/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const project = await ValorizationProject.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user.id },
      { new: true, runValidators: true }
    );
    if (!project) return res.status(404).json({ success: false, error: 'Projet non trouvé' });
    console.log(`✅ Projet valorisation mis à jour: ${project.name}`);
    res.json({ success: true, data: project });
  } catch (error) {
    console.error('❌ Erreur valorization PUT:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// DELETE — supprimer un projet
app.delete('/api/valorization/projects/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const project = await ValorizationProject.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'Projet non trouvé' });
    console.log(`🗑️ Projet valorisation supprimé: ${project.name} par ${req.user.email}`);
    res.json({ success: true, message: 'Projet supprimé' });
  } catch (error) {
    console.error('❌ Erreur valorization DELETE:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});


// ==================== ROUTE FILTER OPTIONS ====================

app.get('/api/admin/filter-options', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [cities, types, statuses, severities] = await Promise.all([
      Report.distinct('location.city').then(cs => cs.filter(Boolean).sort()),
      Report.distinct('type'),
      Report.distinct('status'),
      Report.distinct('severity'),
    ]);
    res.json({
      success: true,
      data: {
        locations: cities.length ? cities : ['Dakar', 'Thiès', 'Saint-Louis', 'Ziguinchor', 'Kaolack', 'Mbour'],
        pollutionTypes: types,
        statuses,
        severities,
      },
    });
  } catch (error) {
    console.error('❌ Erreur filter-options:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTE EXPORT CSV (Excel-compatible) ====================

app.get('/api/admin/export', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, type, severity, search } = req.query;

    const filter = {};
    if (status   && status   !== 'all') filter.status   = status;
    if (type     && type     !== 'all') filter.type     = type;
    if (severity && severity !== 'all') filter.severity = severity;
    if (search?.trim()) {
      filter.$or = [
        { description:        { $regex: search, $options: 'i' } },
        { 'location.address': { $regex: search, $options: 'i' } },
        { title:              { $regex: search, $options: 'i' } },
      ];
    }

    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .populate('citizen', 'firstName lastName email community phone')
      .lean();

    // Séparateur point-virgule pour Excel FR (évite la confusion avec les virgules dans le texte)
    const SEP = ';';

    // Échapper une valeur pour CSV : toujours entre guillemets pour Excel
    const cell = (v) => {
      if (v === null || v === undefined) return '""';
      // Excel interprète les dates ISO — on formate en lisible FR
      const s = String(v)
        .replace(/"/g, '""')   // échapper les guillemets internes
        .replace(/\r?\n/g, ' '); // pas de retours à la ligne dans une cellule
      return `"${s}"`;
    };

    const fmtDate = (d) => {
      if (!d) return '';
      return new Date(d).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    };

    const typeLabels = {
      water_pollution: 'Pollution eau', air_pollution: 'Pollution air',
      soil_contamination: 'Contamination sol', waste_deposit: 'Dépôt déchets',
      dust: 'Poussière', abandoned_site: 'Site abandonné',
      noise_pollution: 'Pollution sonore', other: 'Autre',
    };

    const statusLabels = {
      new: 'Nouveau', verified: 'Vérifié', in_progress: 'En cours',
      resolved: 'Résolu', rejected: 'Rejeté', pending: 'En attente',
    };

    const severityLabels = { low: 'Faible', medium: 'Moyen', high: 'Élevé', critical: 'Critique' };

    const headers = [
      'ID Signalement', 'Type de pollution', 'Titre', 'Description',
      'Statut', 'Sévérité', 'Score confiance IA (%)', 'Vérifié',
      'Adresse complète', 'Ville', 'Région',
      'Latitude', 'Longitude',
      'Nom du citoyen', 'Email du citoyen', 'Communauté', 'Téléphone',
      'Nombre de votes', 'Date de signalement', 'Date de résolution',
    ].map(h => cell(h)).join(SEP);

    const rows = reports.map(r => {
      const citizen = r.citizen && typeof r.citizen === 'object' ? r.citizen : {};
      return [
        cell(String(r._id)),
        cell(typeLabels[r.type]     || r.type     || ''),
        cell(r.title               || ''),
        cell(r.description         || ''),
        cell(statusLabels[r.status]   || r.status   || ''),
        cell(severityLabels[r.severity] || r.severity || ''),
        cell(r.confidenceScore !== undefined ? String(r.confidenceScore) : ''),
        cell(r.isVerified ? 'Oui' : 'Non'),
        cell(r.location?.address   || ''),
        cell(r.location?.city      || ''),
        cell(r.location?.region    || ''),
        cell(r.location?.latitude  !== undefined ? String(r.location.latitude)  : ''),
        cell(r.location?.longitude !== undefined ? String(r.location.longitude) : ''),
        cell(`${citizen.firstName || ''} ${citizen.lastName || ''}`.trim()),
        cell(citizen.email         || ''),
        cell(citizen.community     || ''),
        cell(citizen.phone         || ''),
        cell(String(r.voteCount    || 0)),
        cell(fmtDate(r.createdAt)),
        cell(fmtDate(r.resolvedAt)),
      ].join(SEP);
    });

    // BOM UTF-8 obligatoire pour qu'Excel ouvre correctement en UTF-8
    const bom  = '\uFEFF';
    const csv  = bom + [headers, ...rows].join('\r\n');
    const date = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="remine-signalements-${date}.csv"`);
    res.send(csv);

    console.log(`✅ Export CSV: ${reports.length} signalements — séparateur point-virgule, UTF-8 BOM`);
  } catch (error) {
    console.error('❌ Erreur export:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'export' });
  }
});

// ==================== ROUTE DEMO DATA ====================

app.post('/api/admin/demo-data', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Récupérer ou créer un utilisateur citoyen de démo
    let demoUser = await User.findOne({ email: 'demo@remine.sn' });
    if (!demoUser) {
      const hashedPassword = await bcrypt.hash('Demo@123456', 10);
      demoUser = await User.create({
        email: 'demo@remine.sn',
        firstName: 'Citoyen',
        lastName: 'Démo',
        password: hashedPassword,
        role: 'citizen',
        community: 'Thiès',
        isActive: true,
      });
    }

    const types      = ['water_pollution', 'dust', 'abandoned_site', 'waste_deposit', 'air_pollution', 'soil_contamination'];
    const severities = ['low', 'medium', 'high', 'critical'];
    const statuses   = ['new', 'verified', 'in_progress', 'resolved'];
    const cities     = [
      { city: 'Dakar',       lat: 14.7167, lng: -17.4677 },
      { city: 'Thiès',       lat: 14.7910, lng: -16.9360 },
      { city: 'Mbour',       lat: 14.3850, lng: -16.9660 },
      { city: 'Saint-Louis', lat: 16.0179, lng: -16.4896 },
      { city: 'Kaolack',     lat: 14.1500, lng: -16.0726 },
      { city: 'Ziguinchor',  lat: 12.5681, lng: -16.2719 },
    ];

    const descriptions = {
      water_pollution:    ['Déversement de liquide suspect dans la rivière locale.', 'Couleur anormale de l\'eau du puits. Odeur forte détectée.', 'Eaux usées minières s\'écoulent vers le cours d\'eau.'],
      dust:               ['Nuage de poussière permanent autour du site minier.', 'Poussière rouge recouvre les toits du quartier depuis une semaine.', 'La piste minière génère une poussière étouffante en saison sèche.'],
      abandoned_site:     ['Ancien site minier abandonné sans réhabilitation. Accès non sécurisé.', 'Galeries ouvertes sur site abandonné. Danger pour les enfants.'],
      waste_deposit:      ['Dépôt de déchets industriels à ciel ouvert près des habitations.', 'Stockage illégal de résidus miniers sur terrain vague.'],
      air_pollution:      ['Fumées noires émises par l\'usine de traitement.', 'Odeurs chimiques insupportables depuis l\'ouverture de la carrière.'],
      soil_contamination: ['Sol noirci et sans végétation autour du site d\'extraction.', 'Arbres morts et sols stériles suite aux rejets de la mine.'],
    };

    const demoReports = [];
    const count = 15;

    for (let i = 0; i < count; i++) {
      const type      = types[i % types.length];
      const cityObj   = cities[i % cities.length];
      const severity  = severities[Math.floor(i / 4) % severities.length];
      const status    = statuses[i % statuses.length];
      const descList  = descriptions[type] || ['Problème environnemental signalé par un citoyen.'];
      const desc      = descList[i % descList.length];
      const daysAgo   = Math.floor(Math.random() * 30);
      const createdAt = new Date(Date.now() - daysAgo * 86400000);

      const report = new Report({
        type, severity, status,
        title: `Signalement ${type.replace('_', ' ')} — ${cityObj.city}`,
        description: desc,
        location: {
          address:   `Zone industrielle, ${cityObj.city}, Sénégal`,
          city:      cityObj.city,
          region:    cityObj.city,
          latitude:  cityObj.lat + (Math.random() - 0.5) * 0.1,
          longitude: cityObj.lng + (Math.random() - 0.5) * 0.1,
        },
        citizen: demoUser._id,
        confidenceScore: 50 + Math.floor(Math.random() * 40),
        isVerified: severity === 'critical' || severity === 'high',
        voteCount: Math.floor(Math.random() * 15),
        createdAt,
        resolvedAt: status === 'resolved' ? new Date(createdAt.getTime() + 7 * 86400000) : undefined,
      });

      demoReports.push(report);
    }

    await Report.insertMany(demoReports);

    if (global.io) {
      global.io.emit('new-report', { type: 'DEMO_DATA_CREATED', count });
    }

    console.log(`✅ Données de démo créées: ${count} signalements`);
    res.json({
      success: true,
      message: `${count} signalements de démo créés avec succès`,
      data: { count, userId: demoUser._id },
    });
  } catch (error) {
    console.error('❌ Erreur demo-data:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la création des données de démo' });
  }
});

// ==================== ROUTE ACTIVITÉ 7 JOURS (graphique réel) ====================

app.get('/api/admin/activity', requireAuth, requireAdmin, async (req, res) => {
  try {
    const days = 7;
    const results = [];

    for (let i = days - 1; i >= 0; i--) {
      const start = new Date();
      start.setDate(start.getDate() - i);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);

      const count = await Report.countDocuments({ createdAt: { $gte: start, $lte: end } });
      results.push({
        date:  start.toISOString().split('T')[0],
        label: start.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
        count,
      });
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('❌ Erreur activity:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES COMMENTAIRES ====================

app.get('/api/reports/:id/comments', requireAuth, async (req, res) => {
  try {
    const comments = await Comment.find({ report: req.params.id })
      .populate('author', 'firstName lastName role')
      .sort({ createdAt: 1 })
      .lean();
    res.json({ success: true, data: { comments } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.post('/api/reports/:id/comments', requireAuth, async (req, res) => {
  try {
    const { content, type = 'public' } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ success: false, error: 'Contenu requis' });
    }

    // Seuls les admins peuvent poster des messages admin
    const commentType = ['admin', 'moderator'].includes(req.user.role) ? type : 'public';

    const comment = await Comment.create({
      report:  req.params.id,
      author:  req.user.id,
      content: content.trim(),
      type:    commentType,
    });

    await comment.populate('author', 'firstName lastName role');

    // Notifier le citoyen si message admin
    if (commentType === 'admin_message') {
      const report = await Report.findById(req.params.id).select('citizen type');
      if (report) {
        const citizenId = String(report.citizen);
        if (global.notifyUser) {
          global.notifyUser(citizenId, 'new_comment', {
            reportId: req.params.id,
            type:     report.type,
            message:  content.trim().substring(0, 100),
            from:     `${req.user.firstName || 'Admin'}`,
          });
        }
      }
    }

    // Émettre via Socket.io
    if (global.io) {
      global.io.emit('new-comment', { reportId: req.params.id, comment });
      if (global.emitSSE) global.emitSSE('new-comment', { reportId: req.params.id });
    }

    res.status(201).json({ success: true, data: { comment } });
  } catch (error) {
    console.error('❌ Erreur commentaire:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

app.delete('/api/reports/:reportId/comments/:commentId', requireAuth, requireAdmin, async (req, res) => {
  try {
    await Comment.findByIdAndDelete(req.params.commentId);
    res.json({ success: true, message: 'Commentaire supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});


// ==================== ROUTE SUPPRESSION SIGNALEMENT ====================

app.delete('/api/admin/reports/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reason = '' } = req.body;
    const reportId = req.params.id;

    const report = await Report.findById(reportId)
      .populate('citizen', 'firstName lastName email')
      .lean();

    if (!report) {
      return res.status(404).json({ success: false, error: 'Signalement non trouvé' });
    }

    // Enregistrer le journal AVANT la suppression
    const log = await DeletionLog.create({
      reportId:          String(report._id),
      reportType:        report.type,
      reportTitle:       report.title || '',
      reportDescription: (report.description || '').substring(0, 300),
      reportLocation:    report.location,
      reportSeverity:    report.severity,
      reportStatus:      report.status,
      reportCreatedAt:   report.createdAt,
      citizenId:         report.citizen ? String(report.citizen._id || report.citizen) : '',
      citizenEmail:      report.citizen?.email || '',
      citizenName:       report.citizen ? `${report.citizen.firstName || ''} ${report.citizen.lastName || ''}`.trim() : '',
      deletedBy: {
        id:        req.user.id,
        email:     req.user.email,
        firstName: req.user.firstName || '',
        lastName:  req.user.lastName  || '',
        role:      req.user.role,
      },
      reason: reason.trim(),
      deletedAt: new Date(),
      ipAddress: req.ip,
    });

    // Supprimer les commentaires liés
    await Comment.deleteMany({ report: reportId });

    // Supprimer le signalement
    await Report.findByIdAndDelete(reportId);

    // Notifier le citoyen
    if (report.citizen) {
      const citizenId = String(report.citizen._id || report.citizen);
      if (global.notifyUser) {
        global.notifyUser(citizenId, 'report_deleted', {
          reportId:    String(report._id),
          type:        report.type,
          description: (report.description || '').substring(0, 80),
          reason:      reason.trim() || 'Décision administrative',
        });
      }
    }

    // Émettre via Socket.io
    if (global.io) {
      global.io.emit('report-deleted', { reportId, deletedBy: req.user.email });
      if (global.emitSSE) global.emitSSE('report-deleted', { reportId });
    }

    console.log(`🗑️  Signalement supprimé: ${reportId} par ${req.user.email}${reason ? ` — raison: ${reason}` : ''}`);

    res.json({
      success: true,
      message: 'Signalement supprimé et tracé avec succès',
      data: { deletionLogId: log._id, reportId },
    });

  } catch (error) {
    console.error('❌ Erreur suppression signalement:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur lors de la suppression' });
  }
});

// ==================== ROUTE JOURNAL DES SUPPRESSIONS ====================

app.get('/api/admin/deletion-logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, adminId, dateFrom, dateTo } = req.query;

    const filter = {};
    // adminId peut être un ObjectId ou un email — on filtre sur l'email pour éviter les erreurs de cast
    if (adminId && adminId.trim()) {
      filter['deletedBy.email'] = adminId.includes('@') ? adminId : { $regex: adminId, $options: 'i' };
    }
    if (dateFrom || dateTo) {
      filter.deletedAt = {};
      if (dateFrom) filter.deletedAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.deletedAt.$lte = end;
      }
    }

    const pageNum  = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const skip     = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      DeletionLog.find(filter)
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      DeletionLog.countDocuments(filter),
    ]);

    // Stats globales — pipeline robuste avec $ifNull pour éviter les erreurs sur champs manquants
    const stats = await DeletionLog.aggregate([
      {
        $group: {
          _id:   { $ifNull: ['$deletedBy.email', 'inconnu'] },
          count: { $sum: 1 },
          name:  { $first: { $concat: [
            { $ifNull: ['$deletedBy.firstName', ''] },
            ' ',
            { $ifNull: ['$deletedBy.lastName',  ''] },
          ]}},
          last:  { $max: '$deletedAt' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    res.json({
      success: true,
      data: {
        logs,
        total,
        page:       pageNum,
        totalPages: Math.ceil(total / limitNum),
        stats,
      },
    });

  } catch (error) {
    console.error('❌ Erreur journal suppressions:', error.message);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});


// ==================== SERVER-SENT EVENTS (dashboard temps réel) ====================
// Permet au dashboard Next.js de recevoir les événements sans socket.io-client

const sseClients = new Set(); // ensemble des réponses SSE actives

app.get('/api/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Ping toutes les 25s pour garder la connexion vivante
  const ping = setInterval(() => {
    try { res.write('event: ping\ndata: {}\n\n'); } catch {}
  }, 25000);

  sseClients.add(res);
  console.log(`📡 SSE client connecté — total: ${sseClients.size}`);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(res);
    console.log(`📡 SSE client déconnecté — total: ${sseClients.size}`);
  });
});

// Fonction helper pour émettre vers tous les clients SSE
function emitSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => {
    try { res.write(msg); } catch { sseClients.delete(res); }
  });
}

// Exposer globalement pour réutilisation dans les routes
global.emitSSE = emitSSE;

// ==================== GESTION DES ERREURS ====================

app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: `Route non trouvée: ${req.method} ${req.originalUrl}` });
});

app.use((error, _req, res, _next) => {
  console.error('💥 Erreur globale:', error);
  res.status(500).json({
    success: false,
    error: 'Erreur interne du serveur',
    ...(NODE_ENV === 'development' && { details: error.message }),
  });
});

// ==================== DÉMARRAGE ====================

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 Serveur ReMine SÉCURISÉ démarré');
  console.log(`📊 Port           : ${PORT}`);
  console.log(`🌍 Environnement  : ${NODE_ENV}`);
  console.log(`🔗 Health check   : http://localhost:${PORT}/api/health`);
  console.log(`🔌 WebSocket      : ws://localhost:${PORT}`);
  console.log(`🔒 Auth JWT       : activée`);
  console.log(`🛡️  Routes admin   : protégées`);
  console.log(`📱 Push tokens    : activés\n`);
});