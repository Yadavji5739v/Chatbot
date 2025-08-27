const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { asyncHandler, ErrorTypes } = require('../middleware/errorHandler');
const { authRateLimit } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', authRateLimit, asyncHandler(async (req, res) => {
  const { username, email, password, firstName, lastName } = req.body;

  // Check if user already exists
  const existingUser = await User.findByEmailOrUsername(email);
  if (existingUser) {
    throw ErrorTypes.CONFLICT('User with this email or username already exists');
  }

  // Create new user
  const user = new User({
    username,
    email,
    password,
    firstName,
    lastName
  });

  await user.save();

  // Generate JWT token
  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Remove password from response
  const userResponse = user.toObject();
  delete userResponse.password;

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: userResponse,
      token
    }
  });
}));

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post('/login', authRateLimit, asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    throw ErrorTypes.VALIDATION('Please provide email/username and password');
  }

  // Find user by email or username
  const user = await User.findByEmailOrUsername(identifier);
  if (!user) {
    throw ErrorTypes.UNAUTHORIZED('Invalid credentials');
  }

  // Check if account is locked
  if (user.isLocked) {
    throw ErrorTypes.FORBIDDEN('Account is temporarily locked. Please try again later.');
  }

  // Check if account is active
  if (!user.isActive) {
    throw ErrorTypes.FORBIDDEN('Account is deactivated. Please contact support.');
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    // Increment login attempts
    await user.incLoginAttempts();
    throw ErrorTypes.UNAUTHORIZED('Invalid credentials');
  }

  // Reset login attempts on successful login
  await user.resetLoginAttempts();

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Generate JWT token
  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Remove password from response
  const userResponse = user.toObject();
  delete userResponse.password;

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: userResponse,
      token
    }
  });
}));

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw ErrorTypes.VALIDATION('Token is required');
  }

  try {
    // Verify current token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.isActive) {
      throw ErrorTypes.UNAUTHORIZED('Invalid token');
    }

    // Generate new token
    const newToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken,
        user
      }
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw ErrorTypes.UNAUTHORIZED('Invalid token');
    }
    if (error.name === 'TokenExpiredError') {
      throw ErrorTypes.UNAUTHORIZED('Token expired');
    }
    throw error;
  }
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post('/logout', asyncHandler(async (req, res) => {
  // In a stateless JWT system, logout is handled client-side
  // This endpoint can be used for logging purposes or future enhancements
  
  res.json({
    success: true,
    message: 'Logout successful'
  });
}));

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  
  res.json({
    success: true,
    data: { user }
  });
}));

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', asyncHandler(async (req, res) => {
  const { firstName, lastName, avatar, preferences } = req.body;
  
  const updateData = {};
  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;
  if (avatar !== undefined) updateData.avatar = avatar;
  if (preferences !== undefined) updateData.preferences = preferences;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    updateData,
    { new: true, runValidators: true }
  ).select('-password');

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: { user }
  });
}));

/**
 * @route   PUT /api/auth/password
 * @desc    Change user password
 * @access  Private
 */
router.put('/password', asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw ErrorTypes.VALIDATION('Current password and new password are required');
  }

  const user = await User.findById(req.user._id);
  
  // Verify current password
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    throw ErrorTypes.UNAUTHORIZED('Current password is incorrect');
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
}));

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email
 * @access  Public
 */
router.post('/forgot-password', authRateLimit, asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw ErrorTypes.VALIDATION('Email is required');
  }

  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal if email exists or not
    return res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent'
    });
  }

  // Generate reset token
  const resetToken = require('crypto').randomBytes(32).toString('hex');
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save();

  // TODO: Send password reset email
  // For now, just return success message
  res.json({
    success: true,
    message: 'Password reset link sent to your email'
  });
}));

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    throw ErrorTypes.VALIDATION('Token and new password are required');
  }

  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) {
    throw ErrorTypes.VALIDATION('Invalid or expired reset token');
  }

  // Update password and clear reset token
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  res.json({
    success: true,
    message: 'Password reset successfully'
  });
}));

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify email with token
 * @access  Public
 */
router.post('/verify-email', asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw ErrorTypes.VALIDATION('Verification token is required');
  }

  const user = await User.findOne({
    verificationToken: token,
    verificationExpires: { $gt: Date.now() }
  });

  if (!user) {
    throw ErrorTypes.VALIDATION('Invalid or expired verification token');
  }

  // Mark email as verified
  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationExpires = undefined;
  await user.save();

  res.json({
    success: true,
    message: 'Email verified successfully'
  });
}));

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend email verification
 * @access  Public
 */
router.post('/resend-verification', authRateLimit, asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw ErrorTypes.VALIDATION('Email is required');
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw ErrorTypes.NOT_FOUND('User not found');
  }

  if (user.isVerified) {
    throw ErrorTypes.CONFLICT('Email is already verified');
  }

  // Generate new verification token
  const verificationToken = require('crypto').randomBytes(32).toString('hex');
  user.verificationToken = verificationToken;
  user.verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await user.save();

  // TODO: Send verification email
  res.json({
    success: true,
    message: 'Verification email sent'
  });
}));

/**
 * @route   DELETE /api/auth/account
 * @desc    Delete user account
 * @access  Private
 */
router.delete('/account', asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    throw ErrorTypes.VALIDATION('Password is required to delete account');
  }

  const user = await User.findById(req.user._id);
  
  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw ErrorTypes.UNAUTHORIZED('Password is incorrect');
  }

  // Deactivate account instead of deleting
  user.isActive = false;
  await user.save();

  res.json({
    success: true,
    message: 'Account deactivated successfully'
  });
}));

module.exports = router;
