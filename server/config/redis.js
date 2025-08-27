const redis = require('redis');

let redisClient = null;

const connectRedis = async () => {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          console.error('Redis server refused connection');
          return new Error('Redis server refused connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          console.error('Retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          console.error('Max retry attempts reached');
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });

    redisClient.on('connect', () => {
      console.log('🔴 Redis Connected');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis Ready');
    });

    redisClient.on('error', (err) => {
      console.error('Redis Error:', err);
    });

    redisClient.on('end', () => {
      console.log('Redis connection ended');
    });

    await redisClient.connect();

  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    // Don't exit process for Redis connection failure
    // The app can still function without Redis
  }
};

const getRedisClient = () => {
  return redisClient;
};

const setCache = async (key, value, expireTime = 3600) => {
  try {
    if (redisClient && redisClient.isReady) {
      await redisClient.setEx(key, expireTime, JSON.stringify(value));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Redis set error:', error);
    return false;
  }
};

const getCache = async (key) => {
  try {
    if (redisClient && redisClient.isReady) {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    }
    return null;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
};

const deleteCache = async (key) => {
  try {
    if (redisClient && redisClient.isReady) {
      await redisClient.del(key);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Redis delete error:', error);
    return false;
  }
};

const clearCache = async () => {
  try {
    if (redisClient && redisClient.isReady) {
      await redisClient.flushAll();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Redis clear error:', error);
    return false;
  }
};

module.exports = {
  connectRedis,
  getRedisClient,
  setCache,
  getCache,
  deleteCache,
  clearCache
};
