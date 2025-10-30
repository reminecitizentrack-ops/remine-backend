const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// Données en mémoire (pour la démo)
let users = [];
let reports = [];
let nextId = 1;

// Middleware d'authentification simplifié
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token d\'accès requis' });
  }

  try {
    // Vérifier le token (version simplifiée)
    const userId = token.replace('demo-token-', '');
    req.user = { userId };
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token invalide' });
  }
};

// Routes d'authentification
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, phone, password, community } = req.body;
    
    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({ error: 'Tous les champs sont obligatoires' });
    }

    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'Un utilisateur avec cet email existe déjà' });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = {
      id: nextId++,
      fullName,
      email,
      phone,
      password: hashedPassword,
      community,
      avatar: '👤',
      joinDate: new Date().toISOString()
    };

    users.push(user);

    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      token: 'demo-token-' + user.id,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        community: user.community,
        avatar: user.avatar,
        joinDate: user.joinDate
      }
    });

  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur serveur lors de l\'inscription' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(400).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Email ou mot de passe incorrect' });
    }

    res.json({
      message: 'Connexion réussie',
      token: 'demo-token-' + user.id,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        community: user.community,
        avatar: user.avatar,
        joinDate: user.joinDate
      }
    });

  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
});

// Routes des signalements
app.post('/api/reports', authenticateToken, (req, res) => {
  try {
    const { type, description, location, photos, severity } = req.body;

    if (!type || !description) {
      return res.status(400).json({ error: 'Type et description sont requis' });
    }

    const report = {
      id: nextId++,
      userId: parseInt(req.user.userId),
      type,
      description,
      location: location || { latitude: 14.7167, longitude: -17.4677, address: 'Dakar, Sénégal' },
      photos: photos || [],
      status: 'pending',
      severity: severity || 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    reports.push(report);

    res.status(201).json({
      message: 'Signalement créé avec succès',
      report
    });

  } catch (error) {
    console.error('Erreur création signalement:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la création du signalement' });
  }
});

app.get('/api/reports', authenticateToken, (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    const userReports = reports.filter(r => r.userId === userId);
    res.json(userReports);

  } catch (error) {
    console.error('Erreur récupération signalements:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la récupération des signalements' });
  }
});

app.get('/api/reports/all', (req, res) => {
  try {
    const publicReports = reports.map(report => ({
      id: report.id,
      type: report.type,
      location: report.location,
      status: report.status,
      createdAt: report.createdAt
    }));

    res.json(publicReports);

  } catch (error) {
    console.error('Erreur récupération tous les signalements:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Routes utilisateur
app.get('/api/user/profile', authenticateToken, (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    const user = users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Statistiques de l'utilisateur
    const userReports = reports.filter(r => r.userId === userId);
    const reportsCount = userReports.length;
    const resolvedCount = userReports.filter(r => r.status === 'resolved').length;

    res.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        community: user.community,
        avatar: user.avatar,
        joinDate: user.joinDate
      },
      stats: {
        reportsSubmitted: reportsCount,
        reportsResolved: resolvedCount,
        communitiesHelped: user.community ? 1 : 0
      }
    });

  } catch (error) {
    console.error('Erreur profil utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques globales
app.get('/api/stats', (req, res) => {
  try {
    const totalReports = reports.length;
    const resolvedReports = reports.filter(r => r.status === 'resolved').length;
    const totalUsers = users.length;

    res.json({
      totalReports,
      resolvedReports,
      totalUsers,
      resolutionRate: totalReports > 0 ? Math.round((resolvedReports / totalReports) * 100) : 0
    });

  } catch (error) {
    console.error('Erreur statistiques:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'API ReMine Simple fonctionnelle',
    timestamp: new Date().toISOString(),
    usersCount: users.length,
    reportsCount: reports.length
  });
});

// Données de démo automatiques
function initializeDemoData() {
  // Utilisateur de démo
  const demoUser = {
    id: nextId++,
    fullName: 'Citoyen ReMine Démo',
    email: 'demo@remine.sn',
    phone: '+221 77 123 45 67',
    password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/eoGMK3145NPX4TqRq', // "demo123"
    community: 'Dakar',
    avatar: '👤',
    joinDate: new Date().toISOString()
  };
  users.push(demoUser);

  // Signalements de démo
  const demoReports = [
    {
      id: nextId++,
      userId: demoUser.id,
      type: 'water_pollution',
      description: 'Eau rougeâtre dans les puits du village de Thiès',
      location: { latitude: 14.7167, longitude: -17.4677, address: 'Thiès, Sénégal' },
      photos: [],
      status: 'in_progress',
      severity: 'high',
      createdAt: new Date('2024-01-15').toISOString(),
      updatedAt: new Date('2024-01-16').toISOString()
    },
    {
      id: nextId++,
      userId: demoUser.id,
      type: 'abandoned_site',
      description: 'Ancienne carrière non sécurisée à Diamniadio',
      location: { latitude: 14.7640, longitude: -17.3660, address: 'Diamniadio, Sénégal' },
      photos: [],
      status: 'resolved',
      severity: 'medium',
      createdAt: new Date('2024-01-10').toISOString(),
      updatedAt: new Date('2024-01-14').toISOString()
    },
    {
      id: nextId++,
      userId: demoUser.id,
      type: 'dust_pollution',
      description: 'Poussière excessive provenant du site minier de Rufisque',
      location: { latitude: 14.7150, longitude: -17.4500, address: 'Rufisque, Sénégal' },
      photos: [],
      status: 'pending',
      severity: 'medium',
      createdAt: new Date('2024-01-08').toISOString(),
      updatedAt: new Date('2024-01-08').toISOString()
    }
  ];

  reports.push(...demoReports);
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur ReMine Simple démarré sur le port ${PORT}`);
  console.log(`📊 API disponible sur: http://localhost:${PORT}/api`);
  
  // Initialiser les données de démo
  initializeDemoData();
  console.log('✅ Données de démo chargées');
  console.log(`👤 Utilisateur démo: demo@remine.sn / demo123`);
  console.log(`📝 ${reports.length} signalements de démo créés`);
});
