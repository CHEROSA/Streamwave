/**
 * Validation Middleware
 * 
 * This middleware provides consistent request validation using express-validator
 * and our standardized error handling utilities.
 */
const { body, validationResult, param, query } = require('express-validator');
const { createError } = require('../utils/error-utilities');
const { enhancedAsyncHandler } = require('../utils/error-handler');

/**
 * Run validation and throw standardized errors if validation fails
 * @returns {Function} Express middleware
 */
const validate = (validations) => {
  return enhancedAsyncHandler(async (req, res, next) => {
    // Execute all validations
    await Promise.all(validations.map(validation => validation.run(req)));
    
    // Check if there are validation errors
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      // Format errors and throw a validation error
      const formattedErrors = errors.array().reduce((acc, error) => {
        acc[error.param] = error.msg;
        return acc;
      }, {});
      
      throw createError('VALIDATION', 'Validation failed', formattedErrors);
    }
    
    next();
  }, 'VALIDATION');
};

/**
 * Stream validation rules
 */
const streamValidation = {
  create: [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('isPrivate').optional().isBoolean().withMessage('isPrivate must be a boolean'),
    body('tags').optional().isArray().withMessage('Tags must be an array')
  ],
  update: [
    param('streamId').notEmpty().withMessage('Stream ID is required'),
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('isPrivate').optional().isBoolean().withMessage('isPrivate must be a boolean'),
    body('tags').optional().isArray().withMessage('Tags must be an array')
  ],
  getById: [
    param('streamId').notEmpty().withMessage('Stream ID is required')
  ]
};

/**
 * User validation rules
 */
const userValidation = {
  register: [
    body('username')
      .trim()
      .notEmpty().withMessage('Username is required')
      .isLength({ min: 3, max: 30 }).withMessage('Username must be between 3 and 30 characters'),
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Invalid email format'),
    body('password')
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  ],
  login: [
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Invalid email format'),
    body('password')
      .notEmpty().withMessage('Password is required')
  ],
  updateProfile: [
    body('displayName').optional().trim(),
    body('bio').optional().trim(),
    body('avatar').optional().trim().isURL().withMessage('Avatar must be a valid URL'),
    body('socialLinks').optional().isObject().withMessage('Social links must be an object')
  ]
};

/**
 * Payment validation rules
 */
const paymentValidation = {
  createPaymentIntent: [
    body('amount')
      .notEmpty().withMessage('Amount is required')
      .isInt({ min: 1 }).withMessage('Amount must be a positive integer'),
    body('currency')
      .optional()
      .isString().withMessage('Currency must be a string')
      .isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code')
  ],
  purchaseGift: [
    body('giftId').notEmpty().withMessage('Gift ID is required'),
    body('receiverId').notEmpty().withMessage('Receiver ID is required'),
    body('streamId').notEmpty().withMessage('Stream ID is required')
  ]
};

module.exports = {
  validate,
  streamValidation,
  userValidation,
  paymentValidation
}; 