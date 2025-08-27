const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import configurations
const connectDB = require('./server/config/database');
// Temporarily disable Redis for testing
// const connectRedis = require('./server/config/redis');

// Import middleware
const { errorHandler } = require('./server/middleware/errorHandler');
const authMiddleware = require('./server/middleware/auth');

// Import routes
const authRoutes = require('./server/routes/auth');
// Temporarily disable route imports for testing
// const chatRoutes = require('./server/routes/chat');
// const analyticsRoutes = require('./server/routes/analytics');
// const aiRoutes = require('./server/routes/ai');

// Import services
const ChatService = require('./server/services/chatService');
const AIService = require('./server/services/aiService');
const AnalyticsService = require('./server/services/analyticsService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Connect to databases
connectDB();
// Redis temporarily disabled for testing
console.log('⚠️ Redis temporarily disabled for testing...');

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api/auth', authRoutes);
// Temporarily disable all routes except auth for testing
// app.use('/api/chat', chatRoutes);
// app.use('/api/analytics', analyticsRoutes);
// app.use('/api/ai', aiRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle user joining a chat room
  socket.on('join_room', async (data) => {
    const { userId, roomId } = data;
    socket.join(roomId);
    socket.userId = userId;
    socket.roomId = roomId;
    
    // Notify others in the room
    socket.to(roomId).emit('user_joined', { userId, timestamp: Date.now() });
    
    console.log(`User ${userId} joined room ${roomId}`);
  });

  // Handle chat messages
  socket.on('message', async (data) => {
    try {
      const { message, roomId, userId } = data;
      
      // Process message through AI service
      const aiResponse = await AIService.processMessage(message, userId, roomId);
      
      // Save message to database
      const savedMessage = await ChatService.saveMessage({
        userId,
        roomId,
        message,
        response: aiResponse.response,
        intent: aiResponse.intent,
        entities: aiResponse.entities,
        sentiment: aiResponse.sentiment,
        confidence: aiResponse.confidence
      });

      // Emit response to the room
      io.to(roomId).emit('message', {
        id: savedMessage._id,
        userId,
        message,
        response: aiResponse.response,
        timestamp: savedMessage.timestamp,
        type: 'user'
      });

      // Emit AI response
      io.to(roomId).emit('message', {
        id: `ai_${Date.now()}`,
        userId: 'ai',
        message: aiResponse.response,
        timestamp: new Date(),
        type: 'ai',
        intent: aiResponse.intent,
        confidence: aiResponse.confidence
      });

      // Track analytics
      AnalyticsService.trackMessage({
        userId,
        roomId,
        messageLength: message.length,
        responseTime: aiResponse.responseTime,
        intent: aiResponse.intent,
        confidence: aiResponse.confidence,
        sentiment: aiResponse.sentiment
      });

    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', { message: 'Failed to process message' });
    }
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    socket.to(data.roomId).emit('typing', {
      userId: data.userId,
      isTyping: data.isTyping
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('user_left', { 
        userId: socket.userId, 
        timestamp: Date.now() 
      });
    }
    console.log('User disconnected:', socket.id);
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

module.exports = app;
