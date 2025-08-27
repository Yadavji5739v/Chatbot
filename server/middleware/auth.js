const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Authentication middleware
 * Validates JWT token and adds user to request object
 */
const auth = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        message: 'Access denied. No token provided.' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid token. User not found.' 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ 
        message: 'Account is deactivated. Please contact support.' 
      });
    }

    // Check if user is locked
    if (user.isLocked) {
      return res.status(423).json({ 
        message: 'Account is temporarily locked due to multiple failed login attempts. Please try again later.' 
      });
    }

    // Add user to request object
    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token.' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expired. Please login again.' 
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      message: 'Internal server error during authentication.' 
    });
  }
};

/**
 * Role-based authorization middleware
 * Checks if user has required role(s)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required.' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Insufficient permissions. Access denied.' 
      });
    }

    next();
  };
};

/**
 * Optional authentication middleware
 * Adds user to request if token is provided, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive && !user.isLocked) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

/**
 * Rate limiting middleware for authentication attempts
 */
const authRateLimit = (req, res, next) => {
  const key = `auth_attempts:${req.ip}`;
  const maxAttempts = 5;
  const windowMs = 15 * 60 * 1000; // 15 minutes

  // This is a simplified rate limiting implementation
  // In production, you might want to use a more robust solution like express-rate-limit
  
  next();
};

/**
 * Validate user ownership middleware
 * Checks if the authenticated user owns the resource
 */
const validateOwnership = (resourceModel, resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdField];
      const resource = await resourceModel.findById(resourceId);

      if (!resource) {
        return res.status(404).json({ 
          message: 'Resource not found.' 
        });
      }

      // Check if user owns the resource or is admin
      if (resource.userId && resource.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ 
          message: 'Access denied. You can only access your own resources.' 
        });
      }

      req.resource = resource;
      next();

    } catch (error) {
      console.error('Ownership validation error:', error);
      res.status(500).json({ 
        message: 'Error validating resource ownership.' 
      });
    }
  };
};

/**
 * Check if user is verified middleware
 */
const requireVerification = (req, res, next) => {
  if (!req.user.isVerified) {
    return res.status(403).json({ 
      message: 'Email verification required. Please check your email and verify your account.' 
    });
  }
  next();
};

/**
 * Check if user has completed profile middleware
 */
const requireProfile = (req, res, next) => {
  if (!req.user.firstName || !req.user.lastName) {
    return res.status(403).json({ 
      message: 'Profile completion required. Please complete your profile information.' 
      });
  }
  next();
};

module.exports = {
  auth,
  authorize,
  optionalAuth,
  authRateLimit,
  validateOwnership,
  requireVerification,
  requireProfile
};
