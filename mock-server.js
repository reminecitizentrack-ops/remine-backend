const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Stockage en mémoire (simule une base de données)
let users = [];
let nextId = 1;

// ==================== ROUTES SANS /api (compatibilité) ====================

// Route de santé sans /api
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Mock API Remine en fonctionnement',
    timestamp: new Date().toISOString()
  });
});

// Route d'inscription sans /api
app.post('/auth/register', (req, res) => {
  console.log('📝 Tentative d\'inscription (route legacy):', req.body);
  
  const { email, firstName, password, lastName, role, community, phone } = req.body;
  
  // Validation des champs requis
  if (!email || !firstName || !password) {
    return res.status(400).json({ 
      error: 'Champs obligatoires manquants: email, firstName, password' 
    });
  }

  // Vérifier si l'email existe déjà
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({ error: 'Un utilisateur avec cet email existe déjà' });
  }

  // Créer l'utilisateur
  const user = {
    id: nextId++,
    email,
    firstName,
    lastName: lastName || '',
    role: role || 'citizen',
    community: community || '',
    phone: phone || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  users.push(user);
  
  console.log('✅ Utilisateur créé (route legacy):', user.email);

  // Réponse de succès
  res.status(201).json({
    message: 'Utilisateur créé avec succès',
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      community: user.community
    },
    token: 'mock-jwt-token-' + Date.now()
  });
});

// Route de connexion sans /api
app.post('/auth/login', (req, res) => {
  console.log('🔐 Tentative de connexion (route legacy):', req.body.email);
  
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  // Trouver l'utilisateur
  const user = users.find(u => u.email === email);
  
  if (user) {
    console.log('✅ Connexion réussie (route legacy):', user.email);
    res.json({
      message: 'Connexion réussie',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        community: user.community
      },
      token: 'mock-jwt-token-' + Date.now()
    });
  } else {
    console.log('❌ Utilisateur non trouvé (route legacy):', email);
    res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
});

// ==================== ROUTES AVEC /api (nouvelle version) ====================

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Mock API Remine en fonctionnement',
    timestamp: new Date().toISOString()
  });
});

// Route d'inscription
app.post('/api/auth/register', (req, res) => {
  console.log('📝 Tentative d\'inscription:', req.body);
  
  const { email, firstName, password, lastName, role, community, phone } = req.body;
  
  // Validation des champs requis
  if (!email || !firstName || !password) {
    return res.status(400).json({ 
      error: 'Champs obligatoires manquants: email, firstName, password' 
    });
  }

  // Vérifier si l'email existe déjà
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({ error: 'Un utilisateur avec cet email existe déjà' });
  }

  // Créer l'utilisateur
  const user = {
    id: nextId++,
    email,
    firstName,
    lastName: lastName || '',
    role: role || 'citizen',
    community: community || '',
    phone: phone || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  users.push(user);
  
  console.log('✅ Utilisateur créé:', user.email);

  // Réponse de succès
  res.status(201).json({
    message: 'Utilisateur créé avec succès',
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      community: user.community
    },
    token: 'mock-jwt-token-' + Date.now()
  });
});

// Route de connexion
app.post('/api/auth/login', (req, res) => {
  console.log('🔐 Tentative de connexion:', req.body.email);
  
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  // Trouver l'utilisateur
  const user = users.find(u => u.email === email);
  
  if (user) {
    console.log('✅ Connexion réussie pour:', user.email);
    res.json({
      message: 'Connexion réussie',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        community: user.community
      },
      token: 'mock-jwt-token-' + Date.now()
    });
  } else {
    console.log('❌ Utilisateur non trouvé:', email);
    res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
});

// Démarrer le serveur
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('🚀 Mock API Remine démarrée !');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log('📝 Endpoints disponibles:');
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   POST http://localhost:${PORT}/auth/register`);
  console.log(`   POST http://localhost:${PORT}/auth/login`);
  console.log(`   GET  http://localhost:${PORT}/api/health`);
  console.log(`   POST http://localhost:${PORT}/api/auth/register`);
  console.log(`   POST http://localhost:${PORT}/api/auth/login`);
});