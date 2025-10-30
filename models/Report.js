// models/Report.js
import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  // Identifiant unique du signalement
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId()
  },

  // Type de pollution/signalement
  type: {
    type: String,
    required: true,
    enum: [
      'water_pollution',    // Pollution de l'eau
      'dust',               // Poussières
      'abandoned_site',     // Site abandonné
      'waste_deposit',      // Dépôt de déchets
      'air_pollution',      // Pollution de l'air
      'soil_contamination', // Contamination du sol
      'noise_pollution',    // Pollution sonore
      'other'               // Autre
    ],
    index: true
  },

  // Description détaillée
  description: {
    type: String,
    required: [true, 'La description est obligatoire'],
    minlength: [10, 'La description doit contenir au moins 10 caractères'],
    maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères'],
    trim: true
  },

  // Localisation précise
  location: {
    address: {
      type: String,
      required: [true, 'L\'adresse est obligatoire'],
      trim: true
    },
    latitude: {
      type: Number,
      required: [true, 'La latitude est obligatoire'],
      min: [-90, 'Latitude invalide'],
      max: [90, 'Latitude invalide']
    },
    longitude: {
      type: Number,
      required: [true, 'La longitude est obligatoire'],
      min: [-180, 'Longitude invalide'],
      max: [180, 'Longitude invalide']
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

  // Niveau de sévérité
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },

  // Statut du traitement
  status: {
    type: String,
    enum: [
      'new',           // Nouveau signalement
      'verified',      // Vérifié par un modérateur
      'in_progress',   // En cours de traitement
      'resolved',      // Résolu
      'rejected'       // Rejeté
    ],
    default: 'new',
    index: true
  },

  // Référence à l'utilisateur qui a créé le signalement
  citizen: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'utilisateur est obligatoire'],
    index: true
  },

  // Images associées (stockées en base64 ou URLs)
  images: [{
    url: {
      type: String,
      required: true
    },
    caption: {
      type: String,
      maxlength: 200
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Informations de traitement
  processing: {
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedAt: Date,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    estimatedResolutionTime: Date,
    notes: [{
      content: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: {
        type: Date,
        default: Date.now
      },
      type: {
        type: String,
        enum: ['internal', 'public'],
        default: 'internal'
      }
    }]
  },

  // Métadonnées automatiques
  metadata: {
    deviceType: String,      // Mobile/Web
    appVersion: String,      // Version de l'app
    ipAddress: String,       // Adresse IP (anonymisée)
    userAgent: String        // Navigateur/App info
  },

  // Validation automatique
  isVerified: {
    type: Boolean,
    default: false
  },

  // Score de confiance (pour tri automatique)
  confidenceScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },

  // Timestamps automatiques
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  resolvedAt: Date,
  deletedAt: Date
}, {
  // Options du schéma
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 🔥 INDEXES pour les performances
reportSchema.index({ 'location.latitude': 1, 'location.longitude': 1 }); // Recherche géospatiale
reportSchema.index({ status: 1, severity: 1 }); // Filtres combinés
reportSchema.index({ citizen: 1, createdAt: -1 }); // Historique utilisateur
reportSchema.index({ createdAt: -1 }); // Tri par date
reportSchema.index({ type: 1, status: 1 }); // Analytics

// 🔥 MIDDLEWARE pour mettre à jour updatedAt
reportSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// 🔥 VIRTUELS (champs calculés)
reportSchema.virtual('ageInDays').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

reportSchema.virtual('isActive').get(function() {
  return this.status === 'new' || this.status === 'verified' || this.status === 'in_progress';
});

reportSchema.virtual('isResolved').get(function() {
  return this.status === 'resolved' || this.status === 'rejected';
});

// 🔥 METHODES d'instance
reportSchema.methods.assignToUser = function(userId) {
  this.processing.assignedTo = userId;
  this.processing.assignedAt = new Date();
  return this.save();
};

reportSchema.methods.addNote = function(content, userId, type = 'internal') {
  this.processing.notes.push({
    content,
    addedBy: userId,
    type
  });
  return this.save();
};

reportSchema.methods.markAsResolved = function() {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  return this.save();
};

// 🔥 METHODES statiques
reportSchema.statics.findByStatus = function(status) {
  return this.find({ status }).populate('citizen', 'firstName lastName email');
};

reportSchema.statics.findByLocation = function(lat, lng, radiusKm = 10) {
  // Implémentation basique de recherche géospatiale
  return this.find({
    'location.latitude': { 
      $gte: lat - (radiusKm / 111), // 1 degré ≈ 111 km
      $lte: lat + (radiusKm / 111)
    },
    'location.longitude': {
      $gte: lng - (radiusKm / (111 * Math.cos(lat * Math.PI / 180))),
      $lte: lng + (radiusKm / (111 * Math.cos(lat * Math.PI / 180)))
    }
  });
};

reportSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalReports: { $sum: 1 },
        activeReports: {
          $sum: {
            $cond: [
              { $in: ['$status', ['new', 'verified', 'in_progress']] },
              1,
              0
            ]
          }
        },
        resolvedReports: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'resolved'] },
              1,
              0
            ]
          }
        },
        highSeverityReports: {
          $sum: {
            $cond: [
              { $in: ['$severity', ['high', 'critical']] },
              1,
              0
            ]
          }
        },
        avgConfidenceScore: { $avg: '$confidenceScore' }
      }
    },
    {
      $project: {
        _id: 0,
        totalReports: 1,
        activeReports: 1,
        resolvedReports: 1,
        highSeverityReports: 1,
        resolutionRate: {
          $cond: [
            { $eq: ['$totalReports', 0] },
            0,
            { $multiply: [{ $divide: ['$resolvedReports', '$totalReports'] }, 100] }
          ]
        },
        avgConfidenceScore: { $round: ['$avgConfidenceScore', 2] }
      }
    }
  ]);

  return stats[0] || {
    totalReports: 0,
    activeReports: 0,
    resolvedReports: 0,
    highSeverityReports: 0,
    resolutionRate: 0,
    avgConfidenceScore: 0
  };
};

// Export du modèle
export default mongoose.model('Report', reportSchema);