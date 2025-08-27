const Chat = require('../models/Chat');
const User = require('../models/User');
const { getCache, setCache } = require('../config/redis');

class AnalyticsService {
  constructor() {
    this.metrics = {
      totalUsers: 0,
      totalChats: 0,
      totalMessages: 0,
      averageResponseTime: 0,
      averageSatisfaction: 0,
      intentAccuracy: 0
    };
    
    this.realTimeStats = {
      activeUsers: 0,
      activeChats: 0,
      messagesPerMinute: 0,
      averageSessionDuration: 0
    };

    this.initializeMetrics();
  }

  /**
   * Initialize analytics metrics
   */
  async initializeMetrics() {
    try {
      await this.updateMetrics();
      console.log('📊 Analytics service initialized');
    } catch (error) {
      console.error('❌ Error initializing analytics:', error);
    }
  }

  /**
   * Track a message for analytics
   */
  async trackMessage(messageData) {
    try {
      const {
        userId,
        roomId,
        messageLength,
        responseTime,
        intent,
        confidence,
        sentiment
      } = messageData;

      // Update real-time metrics
      this.updateRealTimeMetrics(messageData);

      // Store detailed analytics
      await this.storeMessageAnalytics(messageData);

      // Update cached metrics periodically
      await this.updateMetricsIfNeeded();

    } catch (error) {
      console.error('Error tracking message:', error);
    }
  }

  /**
   * Update real-time metrics
   */
  updateRealTimeMetrics(messageData) {
    try {
      // Increment messages per minute
      this.realTimeStats.messagesPerMinute++;

      // Update average response time
      const currentAvg = this.realTimeStats.averageResponseTime;
      const messageCount = this.realTimeStats.messagesPerMinute;
      this.realTimeStats.averageResponseTime = 
        ((currentAvg * (messageCount - 1)) + messageData.responseTime) / messageCount;

    } catch (error) {
      console.error('Error updating real-time metrics:', error);
    }
  }

  /**
   * Store detailed message analytics
   */
  async storeMessageAnalytics(messageData) {
    try {
      const analyticsKey = `analytics:message:${Date.now()}`;
      const analyticsData = {
        timestamp: new Date(),
        userId: messageData.userId,
        roomId: messageData.roomId,
        messageLength: messageData.messageLength,
        responseTime: messageData.responseTime,
        intent: messageData.intent,
        confidence: messageData.confidence,
        sentiment: messageData.sentiment,
        metadata: {
          userAgent: messageData.userAgent || '',
          ipAddress: messageData.ipAddress || '',
          platform: messageData.platform || '',
          browser: messageData.browser || ''
        }
      };

      // Cache analytics data
      await setCache(analyticsKey, analyticsData, 86400); // Cache for 24 hours

    } catch (error) {
      console.error('Error storing message analytics:', error);
    }
  }

  /**
   * Get comprehensive analytics dashboard data
   */
  async getDashboardData(timeRange = '24h') {
    try {
      const cacheKey = `analytics:dashboard:${timeRange}`;
      let dashboardData = await getCache(cacheKey);

      if (!dashboardData) {
        dashboardData = await this.generateDashboardData(timeRange);
        await setCache(cacheKey, dashboardData, 300); // Cache for 5 minutes
      }

      return dashboardData;

    } catch (error) {
      console.error('Error getting dashboard data:', error);
      return this.getDefaultDashboardData();
    }
  }

  /**
   * Generate dashboard data for specified time range
   */
  async generateDashboardData(timeRange) {
    try {
      const timeFilter = this.getTimeFilter(timeRange);
      
      const [
        userStats,
        chatStats,
        messageStats,
        intentStats,
        sentimentStats,
        performanceStats,
        trendData
      ] = await Promise.all([
        this.getUserStatistics(timeFilter),
        this.getChatStatistics(timeFilter),
        this.getMessageStatistics(timeFilter),
        this.getIntentStatistics(timeFilter),
        this.getSentimentStatistics(timeFilter),
        this.getPerformanceStatistics(timeFilter),
        this.getTrendData(timeRange)
      ]);

      return {
        overview: {
          totalUsers: userStats.totalUsers,
          activeUsers: userStats.activeUsers,
          totalChats: chatStats.totalChats,
          activeChats: chatStats.activeChats,
          totalMessages: messageStats.totalMessages,
          averageResponseTime: performanceStats.averageResponseTime,
          averageSatisfaction: performanceStats.averageSatisfaction
        },
        performance: performanceStats,
        trends: trendData,
        intents: intentStats,
        sentiments: sentimentStats,
        realTime: this.realTimeStats,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Error generating dashboard data:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(timeFilter) {
    try {
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({
        lastLogin: timeFilter,
        isActive: true
      });

      const newUsers = await User.countDocuments({
        createdAt: timeFilter
      });

      const userGrowth = await this.calculateUserGrowth(timeFilter);

      return {
        totalUsers,
        activeUsers,
        newUsers,
        userGrowth,
        retentionRate: this.calculateRetentionRate(activeUsers, totalUsers)
      };

    } catch (error) {
      console.error('Error getting user statistics:', error);
      return { totalUsers: 0, activeUsers: 0, newUsers: 0, userGrowth: 0, retentionRate: 0 };
    }
  }

  /**
   * Get chat statistics
   */
  async getChatStatistics(timeFilter) {
    try {
      const totalChats = await Chat.countDocuments();
      const activeChats = await Chat.countDocuments({ status: 'active' });
      const newChats = await Chat.countDocuments({ createdAt: timeFilter });
      const endedChats = await Chat.countDocuments({
        status: 'ended',
        updatedAt: timeFilter
      });

      const averageChatDuration = await this.calculateAverageChatDuration(timeFilter);
      const chatCompletionRate = this.calculateChatCompletionRate(newChats, endedChats);

      return {
        totalChats,
        activeChats,
        newChats,
        endedChats,
        averageChatDuration,
        chatCompletionRate
      };

    } catch (error) {
      console.error('Error getting chat statistics:', error);
      return { totalChats: 0, activeChats: 0, newChats: 0, endedChats: 0, averageChatDuration: 0, chatCompletionRate: 0 };
    }
  }

  /**
   * Get message statistics
   */
  async getMessageStatistics(timeFilter) {
    try {
      const totalMessages = await Chat.aggregate([
        { $unwind: '$messages' },
        { $count: 'total' }
      ]);

      const messagesInTimeRange = await Chat.aggregate([
        { $unwind: '$messages' },
        { $match: { 'messages.createdAt': timeFilter } },
        { $count: 'total' }
      ]);

      const averageMessageLength = await this.calculateAverageMessageLength(timeFilter);
      const messagesPerChat = await this.calculateMessagesPerChat(timeFilter);

      return {
        totalMessages: totalMessages[0]?.total || 0,
        messagesInTimeRange: messagesInTimeRange[0]?.total || 0,
        averageMessageLength,
        messagesPerChat
      };

    } catch (error) {
      console.error('Error getting message statistics:', error);
      return { totalMessages: 0, messagesInTimeRange: 0, averageMessageLength: 0, messagesPerChat: 0 };
    }
  }

  /**
   * Get intent statistics
   */
  async getIntentStatistics(timeFilter) {
    try {
      const intentStats = await Chat.aggregate([
        { $unwind: '$messages' },
        { $match: { 'messages.createdAt': timeFilter } },
        {
          $group: {
            _id: '$messages.intent',
            count: { $sum: 1 },
            averageConfidence: { $avg: '$messages.confidence' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      const intentAccuracy = await this.calculateIntentAccuracy(timeFilter);
      const topIntents = intentStats.slice(0, 10);

      return {
        intentDistribution: intentStats,
        topIntents,
        intentAccuracy,
        totalIntents: intentStats.length
      };

    } catch (error) {
      console.error('Error getting intent statistics:', error);
      return { intentDistribution: [], topIntents: [], intentAccuracy: 0, totalIntents: 0 };
    }
  }

  /**
   * Get sentiment statistics
   */
  async getSentimentStatistics(timeFilter) {
    try {
      const sentimentStats = await Chat.aggregate([
        { $unwind: '$messages' },
        { $match: { 'messages.createdAt': timeFilter } },
        {
          $group: {
            _id: '$messages.sentiment',
            count: { $sum: 1 },
            averageConfidence: { $avg: '$messages.confidence' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      const sentimentTrend = await this.calculateSentimentTrend(timeFilter);
      const overallSentiment = this.calculateOverallSentiment(sentimentStats);

      return {
        sentimentDistribution: sentimentStats,
        sentimentTrend,
        overallSentiment
      };

    } catch (error) {
      console.error('Error getting sentiment statistics:', error);
      return { sentimentDistribution: [], sentimentTrend: [], overallSentiment: 'neutral' };
    }
  }

  /**
   * Get performance statistics
   */
  async getPerformanceStatistics(timeFilter) {
    try {
      const responseTimeStats = await Chat.aggregate([
        { $unwind: '$messages' },
        { $match: { 'messages.createdAt': timeFilter } },
        {
          $group: {
            _id: null,
            averageResponseTime: { $avg: '$messages.responseTime' },
            minResponseTime: { $min: '$messages.responseTime' },
            maxResponseTime: { $max: '$messages.responseTime' }
          }
        }
      ]);

      const satisfactionStats = await Chat.aggregate([
        { $unwind: '$messages' },
        { $match: { 
          'messages.createdAt': timeFilter,
          'messages.feedback.rating': { $exists: true }
        }},
        {
          $group: {
            _id: null,
            averageSatisfaction: { $avg: '$messages.feedback.rating' },
            totalRatings: { $sum: 1 }
          }
        }
      ]);

      return {
        averageResponseTime: responseTimeStats[0]?.averageResponseTime || 0,
        minResponseTime: responseTimeStats[0]?.minResponseTime || 0,
        maxResponseTime: responseTimeStats[0]?.maxResponseTime || 0,
        averageSatisfaction: satisfactionStats[0]?.averageSatisfaction || 0,
        totalRatings: satisfactionStats[0]?.totalRatings || 0
      };

    } catch (error) {
      console.error('Error getting performance statistics:', error);
      return { averageResponseTime: 0, minResponseTime: 0, maxResponseTime: 0, averageSatisfaction: 0, totalRatings: 0 };
    }
  }

  /**
   * Get trend data for charts
   */
  async getTrendData(timeRange) {
    try {
      const timeIntervals = this.getTimeIntervals(timeRange);
      const trends = [];

      for (const interval of timeIntervals) {
        const stats = await this.getIntervalStats(interval);
        trends.push({
          timestamp: interval.start,
          messages: stats.messageCount,
          users: stats.userCount,
          chats: stats.chatCount,
          satisfaction: stats.averageSatisfaction
        });
      }

      return trends;

    } catch (error) {
      console.error('Error getting trend data:', error);
      return [];
    }
  }

  /**
   * Get statistics for a specific time interval
   */
  async getIntervalStats(interval) {
    try {
      const [messageCount, userCount, chatCount, satisfaction] = await Promise.all([
        Chat.countDocuments({
          'messages.createdAt': { $gte: interval.start, $lt: interval.end }
        }),
        User.countDocuments({
          lastLogin: { $gte: interval.start, $lt: interval.end }
        }),
        Chat.countDocuments({
          createdAt: { $gte: interval.start, $lt: interval.end }
        }),
        Chat.aggregate([
          { $unwind: '$messages' },
          { $match: { 
            'messages.createdAt': { $gte: interval.start, $lt: interval.end },
            'messages.feedback.rating': { $exists: true }
          }},
          { $group: { _id: null, avg: { $avg: '$messages.feedback.rating' } } }
        ])
      ]);

      return {
        messageCount,
        userCount,
        chatCount,
        averageSatisfaction: satisfaction[0]?.avg || 0
      };

    } catch (error) {
      console.error('Error getting interval stats:', error);
      return { messageCount: 0, userCount: 0, chatCount: 0, averageSatisfaction: 0 };
    }
  }

  /**
   * Calculate user growth rate
   */
  async calculateUserGrowth(timeFilter) {
    try {
      const currentUsers = await User.countDocuments({ createdAt: timeFilter });
      const previousPeriod = new Date(timeFilter.getTime() - (timeFilter.getTime() - Date.now()));
      const previousUsers = await User.countDocuments({ createdAt: { $lt: previousPeriod } });

      if (previousUsers === 0) return 100;
      return ((currentUsers - previousUsers) / previousUsers) * 100;

    } catch (error) {
      console.error('Error calculating user growth:', error);
      return 0;
    }
  }

  /**
   * Calculate retention rate
   */
  calculateRetentionRate(activeUsers, totalUsers) {
    if (totalUsers === 0) return 0;
    return (activeUsers / totalUsers) * 100;
  }

  /**
   * Calculate average chat duration
   */
  async calculateAverageChatDuration(timeFilter) {
    try {
      const durationStats = await Chat.aggregate([
        { $match: { createdAt: timeFilter } },
        { $project: { duration: { $subtract: ['$analytics.lastActivity', '$createdAt'] } } },
        { $group: { _id: null, averageDuration: { $avg: '$duration' } } }
      ]);

      return durationStats[0]?.averageDuration || 0;

    } catch (error) {
      console.error('Error calculating average chat duration:', error);
      return 0;
    }
  }

  /**
   * Calculate chat completion rate
   */
  calculateChatCompletionRate(newChats, endedChats) {
    if (newChats === 0) return 0;
    return (endedChats / newChats) * 100;
  }

  /**
   * Calculate average message length
   */
  async calculateAverageMessageLength(timeFilter) {
    try {
      const lengthStats = await Chat.aggregate([
        { $unwind: '$messages' },
        { $match: { 'messages.createdAt': timeFilter } },
        { $group: { _id: null, averageLength: { $avg: '$messages.messageLength' } } }
      ]);

      return lengthStats[0]?.averageLength || 0;

    } catch (error) {
      console.error('Error calculating average message length:', error);
      return 0;
    }
  }

  /**
   * Calculate messages per chat
   */
  async calculateMessagesPerChat(timeFilter) {
    try {
      const messageStats = await Chat.aggregate([
        { $match: { createdAt: timeFilter } },
        { $project: { messageCount: { $size: '$messages' } } },
        { $group: { _id: null, averageMessages: { $avg: '$messageCount' } } }
      ]);

      return messageStats[0]?.averageMessages || 0;

    } catch (error) {
      console.error('Error calculating messages per chat:', error);
      return 0;
    }
  }

  /**
   * Calculate intent accuracy
   */
  async calculateIntentAccuracy(timeFilter) {
    try {
      const accuracyStats = await Chat.aggregate([
        { $unwind: '$messages' },
        { $match: { 
          'messages.createdAt': timeFilter,
          'messages.feedback.rating': { $exists: true }
        }},
        { $group: { _id: null, averageConfidence: { $avg: '$messages.confidence' } } }
      ]);

      return accuracyStats[0]?.averageConfidence || 0;

    } catch (error) {
      console.error('Error calculating intent accuracy:', error);
      return 0;
    }
  }

  /**
   * Calculate sentiment trend
   */
  async calculateSentimentTrend(timeFilter) {
    try {
      const sentimentTrend = await Chat.aggregate([
        { $unwind: '$messages' },
        { $match: { 'messages.createdAt': timeFilter } },
        {
          $group: {
            _id: {
              sentiment: '$messages.sentiment',
              date: { $dateToString: { format: '%Y-%m-%d', date: '$messages.createdAt' } }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.date': 1 } }
      ]);

      return sentimentTrend;

    } catch (error) {
      console.error('Error calculating sentiment trend:', error);
      return [];
    }
  }

  /**
   * Calculate overall sentiment
   */
  calculateOverallSentiment(sentimentStats) {
    try {
      let positiveCount = 0;
      let negativeCount = 0;
      let neutralCount = 0;

      sentimentStats.forEach(stat => {
        switch (stat._id) {
          case 'positive':
            positiveCount = stat.count;
            break;
          case 'negative':
            negativeCount = stat.count;
            break;
          case 'neutral':
            neutralCount = stat.count;
            break;
        }
      });

      const total = positiveCount + negativeCount + neutralCount;
      if (total === 0) return 'neutral';

      const positiveRatio = positiveCount / total;
      const negativeRatio = negativeCount / total;

      if (positiveRatio > 0.6) return 'positive';
      if (negativeRatio > 0.6) return 'negative';
      return 'neutral';

    } catch (error) {
      console.error('Error calculating overall sentiment:', error);
      return 'neutral';
    }
  }

  /**
   * Get time filter based on range
   */
  getTimeFilter(timeRange) {
    const now = new Date();
    const ranges = {
      '1h': new Date(now.getTime() - 60 * 60 * 1000),
      '24h': new Date(now.getTime() - 24 * 60 * 60 * 1000),
      '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      '90d': new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    };

    return ranges[timeRange] || ranges['24h'];
  }

  /**
   * Get time intervals for trend analysis
   */
  getTimeIntervals(timeRange) {
    const now = new Date();
    const intervals = [];
    const intervalCount = 24; // 24 data points

    for (let i = intervalCount - 1; i >= 0; i--) {
      const start = new Date(now.getTime() - (i * this.getIntervalDuration(timeRange)));
      const end = new Date(now.getTime() - ((i - 1) * this.getIntervalDuration(timeRange)));
      
      intervals.push({ start, end });
    }

    return intervals;
  }

  /**
   * Get interval duration based on time range
   */
  getIntervalDuration(timeRange) {
    const durations = {
      '1h': 60 * 60 * 1000 / 24, // 2.5 minutes
      '24h': 60 * 60 * 1000, // 1 hour
      '7d': 24 * 60 * 60 * 1000 / 24, // 1 day
      '30d': 30 * 24 * 60 * 60 * 1000 / 24, // 1.25 days
      '90d': 90 * 24 * 60 * 60 * 1000 / 24 // 3.75 days
    };

    return durations[timeRange] || durations['24h'];
  }

  /**
   * Update metrics if needed
   */
  async updateMetricsIfNeeded() {
    const lastUpdate = this.metrics.lastUpdate || 0;
    const now = Date.now();
    
    // Update metrics every 5 minutes
    if (now - lastUpdate > 5 * 60 * 1000) {
      await this.updateMetrics();
    }
  }

  /**
   * Update all metrics
   */
  async updateMetrics() {
    try {
      const [chatStats, userStats] = await Promise.all([
        Chat.getStatistics(),
        User.countDocuments()
      ]);

      this.metrics = {
        totalUsers: userStats,
        totalChats: chatStats.totalChats,
        totalMessages: chatStats.totalMessages,
        averageResponseTime: chatStats.averageResponseTime,
        averageSatisfaction: chatStats.averageSatisfaction,
        intentAccuracy: 0, // Placeholder for future implementation
        lastUpdate: Date.now()
      };

    } catch (error) {
      console.error('Error updating metrics:', error);
    }
  }

  /**
   * Get default dashboard data
   */
  getDefaultDashboardData() {
    return {
      overview: {
        totalUsers: 0,
        activeUsers: 0,
        totalChats: 0,
        activeChats: 0,
        totalMessages: 0,
        averageResponseTime: 0,
        averageSatisfaction: 0
      },
      performance: {
        averageResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        averageSatisfaction: 0,
        totalRatings: 0
      },
      trends: [],
      intents: { intentDistribution: [], topIntents: [], intentAccuracy: 0, totalIntents: 0 },
      sentiments: { sentimentDistribution: [], sentimentTrend: [], overallSentiment: 'neutral' },
      realTime: this.realTimeStats,
      timestamp: new Date()
    };
  }

  /**
   * Reset real-time metrics
   */
  resetRealTimeMetrics() {
    this.realTimeStats.messagesPerMinute = 0;
    this.realTimeStats.averageResponseTime = 0;
  }

  /**
   * Get service statistics
   */
  getServiceStats() {
    return {
      metrics: this.metrics,
      realTime: this.realTimeStats,
      lastUpdate: this.metrics.lastUpdate
    };
  }
}

module.exports = new AnalyticsService();
