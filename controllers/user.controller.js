/**
 * User Controller
 * 
 * Controller for user-related API endpoints
 */
const UserService = require('../services/user.service');
const { generateToken } = require('../utils/jwt.util');
const logger = require('../utils/logger');

class UserController {
  /**
   * Create a new user controller
   * @param {UserService} userService - User service instance
   */
  constructor(userService = new UserService()) {
    this.userService = userService;
  }
  
  /**
   * Get user profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getProfile(req, res) {
    try {
      const userId = req.user.id;
      const user = await this.userService.findById(userId);
      
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
      logger.error(`Error getting user profile: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Server error'
      });
    }
  }
  
  /**
   * Get user by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getUserById(req, res) {
    try {
      const userId = parseInt(req.params.id, 10);
      const user = await this.userService.findById(userId);
      
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
      logger.error(`Error getting user by ID: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Server error'
      });
    }
  }
  
  /**
   * Get all users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getAllUsers(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      
      const result = await this.userService.findAll({
        page,
        limit,
        sort: req.query.sort,
        order: req.query.order
      });
      
      res.status(200).json({
        success: true,
        data: result.users,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error(`Error getting all users: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Server error'
      });
    }
  }
  
  /**
   * Create a new user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async createUser(req, res) {
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
      const user = await this.userService.create(req.body);
      
      res.status(201).json({
        success: true,
        data: user
      });
    } catch (error) {
      logger.error(`Error creating user: ${error.message}`);
      
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
  }
  
  /**
   * Update a user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async updateUser(req, res) {
    try {
      const userId = parseInt(req.params.id, 10);
      const user = await this.userService.update(userId, req.body);
      
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
      logger.error(`Error updating user: ${error.message}`);
      
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
  }
  
  /**
   * Delete a user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async deleteUser(req, res) {
    try {
      const userId = parseInt(req.params.id, 10);
      const deleted = await this.userService.delete(userId);
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      logger.error(`Error deleting user: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Server error'
      });
    }
  }
  
  /**
   * Login a user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async login(req, res) {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required'
        });
      }
      
      const user = await this.userService.authenticate(username, password);
      
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
      logger.error(`Error logging in: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Server error'
      });
    }
  }
  
  /**
   * Register a new user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async register(req, res) {
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
      const user = await this.userService.create(req.body);
      
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
  }
}

module.exports = UserController;
