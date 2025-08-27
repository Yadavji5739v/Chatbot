const Chat = require('../models/Chat');
const User = require('../models/User');
const { getCache, setCache, deleteCache } = require('../config/redis');

class ChatService {
  constructor() {
    this.activeChats = new Map();
    this.userSessions = new Map();
  }

  /**
   * Create a new chat session
   */
  async createChat(userId, options = {}) {
    try {
      const roomId = this.generateRoomId();
      
      const chatData = {
        roomId,
        participants: [{ userId, role: 'user' }],
        settings: {
          language: options.language || 'en',
          aiModel: options.aiModel || 'gpt-3.5-turbo',
          responseStyle: options.responseStyle || 'conversational',
          maxContextLength: options.maxContextLength || 10
        },
        category: options.category || 'general',
        tags: options.tags || []
      };

      const chat = new Chat(chatData);
      await chat.save();

      // Cache the chat
      await setCache(`chat:${roomId}`, chat, 3600);

      // Track active chat
      this.activeChats.set(roomId, {
        chatId: chat._id,
        participants: [userId],
        lastActivity: new Date()
      });

      console.log(`💬 New chat created: ${roomId} for user: ${userId}`);

      return chat;

    } catch (error) {
      console.error('Error creating chat:', error);
      throw new Error('Failed to create chat session');
    }
  }

  /**
   * Join an existing chat
   */
  async joinChat(userId, roomId) {
    try {
      let chat = await this.getChat(roomId);
      
      if (!chat) {
        throw new Error('Chat not found');
      }

      if (chat.status !== 'active') {
        throw new Error('Chat is not active');
      }

      // Check if user is already a participant
      const isParticipant = chat.participants.some(p => 
        p.userId.toString() === userId.toString() && !p.leftAt
      );

      if (!isParticipant) {
        await chat.addParticipant(userId, 'user');
        await chat.save();
        
        // Update cache
        await setCache(`chat:${roomId}`, chat, 3600);
      }

      // Update active chats tracking
      if (this.activeChats.has(roomId)) {
        const activeChat = this.activeChats.get(roomId);
        if (!activeChat.participants.includes(userId)) {
          activeChat.participants.push(userId);
        }
        activeChat.lastActivity = new Date();
      }

      return chat;

    } catch (error) {
      console.error('Error joining chat:', error);
      throw error;
    }
  }

  /**
   * Get chat by room ID
   */
  async getChat(roomId) {
    try {
      // Check cache first
      let chat = await getCache(`chat:${roomId}`);
      
      if (!chat) {
        chat = await Chat.findOne({ roomId }).populate('participants.userId', 'username firstName lastName avatar');
        
        if (chat) {
          // Cache the chat
          await setCache(`chat:${roomId}`, chat, 3600);
        }
      }

      return chat;

    } catch (error) {
      console.error('Error getting chat:', error);
      return null;
    }
  }

  /**
   * Save a message to the chat
   */
  async saveMessage(messageData) {
    try {
      const { userId, roomId, message, response, intent, entities, sentiment, confidence } = messageData;

      let chat = await this.getChat(roomId);
      
      if (!chat) {
        throw new Error('Chat not found');
      }

      // Create message object
      const messageObj = {
        userId,
        message,
        response,
        intent: intent.name || intent,
        entities: entities || [],
        sentiment: sentiment || 'neutral',
        confidence: confidence || 0.5,
        responseTime: messageData.responseTime || 0,
        metadata: {
          userAgent: messageData.userAgent || '',
          ipAddress: messageData.ipAddress || '',
          platform: messageData.platform || '',
          browser: messageData.browser || ''
        }
      };

      // Add message to chat
      await chat.addMessage(messageObj);
      
      // Update chat analytics
      chat.analytics.totalMessages = chat.messages.length;
      chat.analytics.lastActivity = new Date();
      
      // Calculate average response time
      const responseTimes = chat.messages.map(m => m.responseTime);
      chat.analytics.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

      await chat.save();

      // Update cache
      await setCache(`chat:${roomId}`, chat, 3600);

      // Update active chat tracking
      if (this.activeChats.has(roomId)) {
        const activeChat = this.activeChats.get(roomId);
        activeChat.lastActivity = new Date();
      }

      console.log(`💬 Message saved to chat: ${roomId}`);

      return chat.messages[chat.messages.length - 1];

    } catch (error) {
      console.error('Error saving message:', error);
      throw error;
    }
  }

  /**
   * Get chat history
   */
  async getChatHistory(roomId, limit = 50, offset = 0) {
    try {
      const chat = await this.getChat(roomId);
      
      if (!chat) {
        return [];
      }

      const messages = chat.messages
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(offset, offset + limit);

      return messages;

    } catch (error) {
      console.error('Error getting chat history:', error);
      return [];
    }
  }

  /**
   * Get user's chat sessions
   */
  async getUserChats(userId, limit = 20, offset = 0) {
    try {
      const chats = await Chat.find({
        'participants.userId': userId
      })
      .sort({ 'analytics.lastActivity': -1 })
      .limit(limit)
      .skip(offset)
      .populate('participants.userId', 'username firstName lastName avatar');

      return chats;

    } catch (error) {
      console.error('Error getting user chats:', error);
      return [];
    }
  }

  /**
   * Update chat settings
   */
  async updateChatSettings(roomId, settings) {
    try {
      const chat = await this.getChat(roomId);
      
      if (!chat) {
        throw new Error('Chat not found');
      }

      // Update settings
      chat.settings = { ...chat.settings, ...settings };
      await chat.save();

      // Update cache
      await setCache(`chat:${roomId}`, chat, 3600);

      return chat;

    } catch (error) {
      console.error('Error updating chat settings:', error);
      throw error;
    }
  }

  /**
   * Update chat context
   */
  async updateChatContext(roomId, contextData) {
    try {
      const chat = await this.getChat(roomId);
      
      if (!chat) {
        throw new Error('Chat not found');
      }

      await chat.updateContext(contextData);
      
      // Update cache
      await setCache(`chat:${roomId}`, chat, 3600);

      return chat;

    } catch (error) {
      console.error('Error updating chat context:', error);
      throw error;
    }
  }

  /**
   * Add feedback to a message
   */
  async addMessageFeedback(roomId, messageId, feedback) {
    try {
      const chat = await this.getChat(roomId);
      
      if (!chat) {
        throw new Error('Chat not found');
      }

      const message = chat.messages.id(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      message.feedback = {
        rating: feedback.rating,
        comment: feedback.comment,
        timestamp: new Date()
      };

      await chat.save();

      // Update cache
      await setCache(`chat:${roomId}`, chat, 3600);

      // Update analytics
      this.updateChatAnalytics(chat);

      return message;

    } catch (error) {
      console.error('Error adding message feedback:', error);
      throw error;
    }
  }

  /**
   * End a chat session
   */
  async endChat(roomId, userId) {
    try {
      const chat = await this.getChat(roomId);
      
      if (!chat) {
        throw new Error('Chat not found');
      }

      // Check if user is a participant
      const isParticipant = chat.participants.some(p => 
        p.userId.toString() === userId.toString()
      );

      if (!isParticipant) {
        throw new Error('User is not a participant in this chat');
      }

      // Remove participant
      await chat.removeParticipant(userId);

      // Check if no active participants
      const activeParticipants = chat.participants.filter(p => !p.leftAt);
      
      if (activeParticipants.length === 0) {
        chat.status = 'ended';
        chat.analytics.lastActivity = new Date();
        await chat.save();
      }

      // Remove from active chats if ended
      if (chat.status === 'ended') {
        this.activeChats.delete(roomId);
      }

      // Update cache
      await setCache(`chat:${roomId}`, chat, 3600);

      console.log(`💬 Chat ended: ${roomId} by user: ${userId}`);

      return chat;

    } catch (error) {
      console.error('Error ending chat:', error);
      throw error;
    }
  }

  /**
   * Archive a chat
   */
  async archiveChat(roomId, userId) {
    try {
      const chat = await this.getChat(roomId);
      
      if (!chat) {
        throw new Error('Chat not found');
      }

      // Check if user has permission (admin or moderator)
      const user = await User.findById(userId);
      if (!user || !['admin', 'moderator'].includes(user.role)) {
        throw new Error('Insufficient permissions');
      }

      chat.status = 'archived';
      await chat.save();

      // Remove from active chats
      this.activeChats.delete(roomId);

      // Clear cache
      await deleteCache(`chat:${roomId}`);

      console.log(`💬 Chat archived: ${roomId} by user: ${userId}`);

      return chat;

    } catch (error) {
      console.error('Error archiving chat:', error);
      throw error;
    }
  }

  /**
   * Get active chats
   */
  async getActiveChats() {
    try {
      const activeChats = await Chat.find({ status: 'active' })
        .sort({ 'analytics.lastActivity': -1 })
        .populate('participants.userId', 'username firstName lastName avatar');

      return activeChats;

    } catch (error) {
      console.error('Error getting active chats:', error);
      return [];
    }
  }

  /**
   * Get chat statistics
   */
  async getChatStatistics() {
    try {
      const stats = await Chat.getStatistics();
      return stats;

    } catch (error) {
      console.error('Error getting chat statistics:', error);
      return {
        totalChats: 0,
        activeChats: 0,
        totalMessages: 0,
        averageSatisfaction: 0,
        averageResponseTime: 0
      };
    }
  }

  /**
   * Search chat messages
   */
  async searchMessages(roomId, query, limit = 20) {
    try {
      const chat = await this.getChat(roomId);
      
      if (!chat) {
        return [];
      }

      const searchRegex = new RegExp(query, 'i');
      const messages = chat.messages.filter(message => 
        searchRegex.test(message.message) || searchRegex.test(message.response)
      );

      return messages.slice(0, limit);

    } catch (error) {
      console.error('Error searching messages:', error);
      return [];
    }
  }

  /**
   * Update chat analytics
   */
  updateChatAnalytics(chat) {
    try {
      // Calculate user satisfaction from feedback
      const ratedMessages = chat.messages.filter(m => m.feedback && m.feedback.rating);
      if (ratedMessages.length > 0) {
        const totalRating = ratedMessages.reduce((sum, m) => sum + m.feedback.rating, 0);
        chat.analytics.userSatisfaction = totalRating / ratedMessages.length;
      }

      // Calculate intent accuracy (placeholder for future implementation)
      // This could be based on user feedback or other metrics

      chat.save();

    } catch (error) {
      console.error('Error updating chat analytics:', error);
    }
  }

  /**
   * Generate unique room ID
   */
  generateRoomId() {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `room_${timestamp}_${randomStr}`;
  }

  /**
   * Clean up inactive chats
   */
  async cleanupInactiveChats() {
    try {
      const inactiveThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
      
      const inactiveChats = await Chat.find({
        status: 'active',
        'analytics.lastActivity': { $lt: inactiveThreshold }
      });

      for (const chat of inactiveChats) {
        chat.status = 'paused';
        await chat.save();
        
        // Remove from active chats tracking
        this.activeChats.delete(chat.roomId);
      }

      console.log(`🧹 Cleaned up ${inactiveChats.length} inactive chats`);

    } catch (error) {
      console.error('Error cleaning up inactive chats:', error);
    }
  }

  /**
   * Get service statistics
   */
  getServiceStats() {
    return {
      activeChats: this.activeChats.size,
      totalActiveChats: Array.from(this.activeChats.values()).length,
      userSessions: this.userSessions.size
    };
  }
}

module.exports = new ChatService();
