const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  response: {
    type: String,
    required: true,
    trim: true
  },
  intent: {
    type: String,
    required: true,
    trim: true
  },
  entities: [{
    type: {
      type: String,
      required: true
    },
    value: {
      type: String,
      required: true
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1
    }
  }],
  sentiment: {
    type: String,
    enum: ['positive', 'negative', 'neutral'],
    default: 'neutral'
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    required: true
  },
  responseTime: {
    type: Number, // in milliseconds
    required: true
  },
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    timestamp: Date
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    platform: String,
    browser: String
  }
}, {
  timestamps: true
});

const chatSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['user', 'ai', 'moderator'],
      default: 'user'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: Date
  }],
  messages: [messageSchema],
  context: {
    currentTopic: String,
    conversationFlow: [String],
    userPreferences: mongoose.Schema.Types.Mixed,
    sessionData: mongoose.Schema.Types.Mixed
  },
  settings: {
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko']
    },
    aiModel: {
      type: String,
      default: 'gpt-3.5-turbo',
      enum: ['gpt-3.5-turbo', 'gpt-4', 'bert-base', 'custom']
    },
    responseStyle: {
      type: String,
      default: 'conversational',
      enum: ['conversational', 'formal', 'casual', 'technical']
    },
    maxContextLength: {
      type: Number,
      default: 10
    }
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'ended', 'archived'],
    default: 'active'
  },
  analytics: {
    totalMessages: {
      type: Number,
      default: 0
    },
    averageResponseTime: {
      type: Number,
      default: 0
    },
    userSatisfaction: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    intentAccuracy: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  },
  tags: [String],
  category: {
    type: String,
    enum: ['general', 'support', 'sales', 'technical', 'personal'],
    default: 'general'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for message count
chatSchema.virtual('messageCount').get(function() {
  return this.messages.length;
});

// Virtual for duration
chatSchema.virtual('duration').get(function() {
  if (this.messages.length === 0) return 0;
  const firstMessage = this.messages[0].createdAt;
  const lastMessage = this.messages[this.messages.length - 1].createdAt;
  return lastMessage - firstMessage;
});

// Virtual for active participants
chatSchema.virtual('activeParticipants').get(function() {
  return this.participants.filter(p => !p.leftAt);
});

// Index for better query performance
chatSchema.index({ roomId: 1 });
chatSchema.index({ 'participants.userId': 1 });
chatSchema.index({ createdAt: -1 });
chatSchema.index({ status: 1 });
chatSchema.index({ category: 1 });
chatSchema.index({ 'analytics.lastActivity': -1 });

// Pre-save middleware to update analytics
chatSchema.pre('save', function(next) {
  if (this.messages.length > 0) {
    // Update total messages
    this.analytics.totalMessages = this.messages.length;
    
    // Update average response time
    const responseTimes = this.messages.map(m => m.responseTime);
    this.analytics.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    
    // Update last activity
    this.analytics.lastActivity = new Date();
    
    // Update intent accuracy (if feedback is available)
    const ratedMessages = this.messages.filter(m => m.feedback && m.feedback.rating);
    if (ratedMessages.length > 0) {
      const totalRating = ratedMessages.reduce((sum, m) => sum + m.feedback.rating, 0);
      this.analytics.userSatisfaction = totalRating / ratedMessages.length;
    }
  }
  next();
});

// Instance method to add message
chatSchema.methods.addMessage = function(messageData) {
  this.messages.push(messageData);
  return this.save();
};

// Instance method to add participant
chatSchema.methods.addParticipant = function(userId, role = 'user') {
  const existingParticipant = this.participants.find(p => p.userId.toString() === userId.toString());
  if (!existingParticipant) {
    this.participants.push({ userId, role });
  }
  return this.save();
};

// Instance method to remove participant
chatSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => p.userId.toString() === userId.toString());
  if (participant) {
    participant.leftAt = new Date();
  }
  return this.save();
};

// Instance method to update context
chatSchema.methods.updateContext = function(contextData) {
  this.context = { ...this.context, ...contextData };
  return this.save();
};

// Instance method to get recent context
chatSchema.methods.getRecentContext = function(limit = 5) {
  return this.messages
    .slice(-limit)
    .map(m => ({
      message: m.message,
      response: m.response,
      intent: m.intent,
      timestamp: m.createdAt
    }));
};

// Static method to find active chats
chatSchema.statics.findActive = function() {
  return this.find({ status: 'active' });
};

// Static method to find chats by user
chatSchema.statics.findByUser = function(userId) {
  return this.find({
    'participants.userId': userId
  }).sort({ 'analytics.lastActivity': -1 });
};

// Static method to find chats by category
chatSchema.statics.findByCategory = function(category) {
  return this.find({ category }).sort({ 'analytics.lastActivity': -1 });
};

// Static method to get chat statistics
chatSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalChats: { $sum: 1 },
        activeChats: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        totalMessages: { $sum: '$analytics.totalMessages' },
        averageSatisfaction: { $avg: '$analytics.userSatisfaction' },
        averageResponseTime: { $avg: '$analytics.averageResponseTime' }
      }
    }
  ]);
  
  return stats[0] || {
    totalChats: 0,
    activeChats: 0,
    totalMessages: 0,
    averageSatisfaction: 0,
    averageResponseTime: 0
  };
};

module.exports = mongoose.model('Chat', chatSchema);
