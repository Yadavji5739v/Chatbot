const winston = require('winston');

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'chatbot-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?._id,
    timestamp: new Date().toISOString()
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  // Rate limiting errors
  if (err.type === 'entity.too.large') {
    const message = 'Request entity too large';
    error = { message, statusCode: 413 };
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File size too large';
    error = { message, statusCode: 413 };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field';
    error = { message, statusCode: 400 };
  }

  // Network errors
  if (err.code === 'ECONNREFUSED') {
    const message = 'Service temporarily unavailable';
    error = { message, statusCode: 503 };
  }

  if (err.code === 'ETIMEDOUT') {
    const message = 'Request timeout';
    error = { message, statusCode: 408 };
  }

  // Default error
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  // Don't leak error details in production
  const response = {
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: error
    })
  };

  res.status(statusCode).json(response);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Not found middleware
 * Handles 404 errors for undefined routes
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  error.statusCode = 404;
  next(error);
};

/**
 * Validation error formatter
 * Formats validation errors for consistent response
 */
const formatValidationErrors = (errors) => {
  const formatted = {};
  
  Object.keys(errors).forEach(key => {
    formatted[key] = errors[key].message;
  });
  
  return formatted;
};

/**
 * Business logic error class
 * For throwing application-specific errors
 */
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error types for common scenarios
 */
const ErrorTypes = {
  VALIDATION: (message) => new AppError(message, 400),
  UNAUTHORIZED: (message = 'Unauthorized access') => new AppError(message, 401),
  FORBIDDEN: (message = 'Access forbidden') => new AppError(message, 403),
  NOT_FOUND: (message = 'Resource not found') => new AppError(message, 404),
  CONFLICT: (message = 'Resource conflict') => new AppError(message, 409),
  RATE_LIMIT: (message = 'Too many requests') => new AppError(message, 429),
  INTERNAL: (message = 'Internal server error') => new AppError(message, 500),
  SERVICE_UNAVAILABLE: (message = 'Service unavailable') => new AppError(message, 503)
};

/**
 * Error response formatter
 * Formats error responses consistently
 */
const formatErrorResponse = (error, req) => {
  const baseResponse = {
    success: false,
    message: error.message,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };

  // Add request ID if available
  if (req.id) {
    baseResponse.requestId = req.id;
  }

  // Add user info if available
  if (req.user) {
    baseResponse.userId = req.user._id;
    baseResponse.userRole = req.user.role;
  }

  // Add validation errors if available
  if (error.errors && Object.keys(error.errors).length > 0) {
    baseResponse.errors = formatValidationErrors(error.errors);
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    baseResponse.stack = error.stack;
  }

  return baseResponse;
};

/**
 * Request ID middleware
 * Adds unique ID to each request for tracking
 */
const addRequestId = (req, res, next) => {
  req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
};

/**
 * Error boundary for unhandled errors
 */
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = {
  errorHandler,
  asyncHandler,
  notFound,
  formatValidationErrors,
  AppError,
  ErrorTypes,
  formatErrorResponse,
  addRequestId,
  logger
};
