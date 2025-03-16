/**
 * Auth Controller
 * 
 * Controller for authentication-related API endpoints
 */
const UserService = require('../services/user.service');
const { generateToken, verifyToken } = require('../utils/jwt.util');
const logger = require('../utils/logger');

// Create user service instance
const userService = new UserService();

/**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const registerUser = async (req, res) => {
  try {
    // Validate request body
    const { username, email, password } = req.body;
    
    if (!username || username.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Username must be at least 3 characters long'
      });
    }
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Valid email is required'
      });
    }
    
    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }
    
    // Create user
    const user = await userService.create(req.body);
    
    // Generate JWT token
    const token = generateToken({ userId: user.id });
    
    res.status(201).json({
      success: true,
      data: {
        user,
        token
      }
    });
  } catch (error) {
    logger.error(`Error registering user: ${error.message}`);
    
    // Handle specific errors
    if (error.message.includes('already exists')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

/**
 * Authenticate a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const authenticateUser = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }
    
    const user = await userService.authenticate(username, password);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Generate JWT token
    const token = generateToken({ userId: user.id });
    
    res.status(200).json({
      success: true,
      data: {
        user,
        token
      }
    });
  } catch (error) {
    logger.error(`Error authenticating user: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

/**
 * Refresh JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const refreshToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }
    
    // Verify token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
    
    // Get user
    const user = await userService.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Generate new token
    const newToken = generateToken({ userId: user.id });
    
    res.status(200).json({
      success: true,
      data: {
        token: newToken
      }
    });
  } catch (error) {
    logger.error(`Error refreshing token: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

/**
 * Logout user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const logoutUser = async (req, res) => {
  // JWT tokens are stateless, so we don't need to do anything server-side
  // The client should remove the token from storage
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

/**
 * Get current user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await userService.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error(`Error getting current user: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

module.exports = {
  registerUser,
  authenticateUser,
  refreshToken,
  logoutUser,
  getCurrentUser
};
