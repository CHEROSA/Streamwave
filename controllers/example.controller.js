/**
 * Example Controller
 * 
 * This controller demonstrates proper error handling patterns using our
 * enhanced error handling utilities. Use this as a reference for
 * implementing other controllers.
 */
const express = require('express');
const { enhancedAsyncHandler } = require('../utils/error-handler');
const { createError, assert, ERROR_TYPES } = require('../utils/error-utilities');
const { validate, streamValidation } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const repositoryFactory = require('../repositories/repository.factory');

// Create Express router
const router = express.Router();

// Get repositories
const streamRepository = repositoryFactory.getStreamRepository();
const userRepository = repositoryFactory.getUserRepository();

/**
 * Example of handling validation errors
 * GET /api/example/validate/:id
 */
const validateExample = enhancedAsyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Use assert for simple validations
  assert(id, 'MISSING_FIELD', 'ID is required');
  assert(/^[0-9a-fA-F]{24}$/.test(id), 'INVALID_INPUT', 'Invalid ID format');
  
  // Example of validation passing
  res.json({
    success: true,
    message: 'Validation passed',
    id
  });
}, 'VALIDATION');

/**
 * Example of handling not found errors
 * GET /api/example/not-found/:id
 */
const notFoundExample = enhancedAsyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Try to find a resource
  const stream = await streamRepository.findById(id);
  
  // Throw appropriate error when not found
  if (!stream) {
    throw createError(
      'NOT_FOUND',
      `Stream with ID ${id} not found`,
      { resourceType: 'stream', id }
    );
  }
  
  res.json({
    success: true,
    stream
  });
}, 'NOT_FOUND');

/**
 * Example of handling authorization errors
 * GET /api/example/auth/:streamId
 */
const authorizationExample = enhancedAsyncHandler(async (req, res) => {
  const { streamId } = req.params;
  const userId = req.user.id;
  
  // Find the resource
  const stream = await streamRepository.findById(streamId);
  
  // Handle not found separately from authorization
  if (!stream) {
    throw createError('NOT_FOUND', 'Stream not found');
  }
  
  // Check authorization
  if (stream.userId.toString() !== userId) {
    throw createError(
      'AUTHORIZATION',
      'You do not have permission to access this stream',
      { streamId, userId }
    );
  }
  
  res.json({
    success: true,
    message: 'Authorization successful',
    stream
  });
}, 'AUTHORIZATION');

/**
 * Example of handling business logic errors
 * POST /api/example/business
 */
const businessLogicExample = enhancedAsyncHandler(async (req, res) => {
  const { action, amount } = req.body;
  
  // Example of a business rule check
  if (action === 'withdraw' && amount > 1000) {
    throw createError(
      'BUSINESS_RULE',
      'Withdrawal amount exceeds daily limit',
      { 
        limit: 1000, 
        requested: amount,
        allowedActions: ['deposit', 'transfer']
      }
    );
  }
  
  // Example of a state validation
  if (action === 'close' && amount > 0) {
    throw createError(
      'INVALID_STATE',
      'Cannot close account with positive balance',
      { currentBalance: amount }
    );
  }
  
  res.json({
    success: true,
    message: 'Operation successful',
    action,
    amount
  });
}, 'BUSINESS_RULE');

/**
 * Example of handling external service errors
 * POST /api/example/external
 */
const externalServiceExample = enhancedAsyncHandler(async (req, res) => {
  const { service } = req.body;
  
  // Simulate calling an external service
  if (service === 'payment') {
    try {
      // This is where you would make an actual external API call
      // const result = await paymentService.processPayment(...);
      
      // Simulate an error
      throw new Error('Payment service is currently unavailable');
    } catch (error) {
      // Wrap and rethrow with appropriate type
      throw createError(
        'EXTERNAL_SERVICE',
        'Failed to process payment',
        { service, originalError: error.message },
        error
      );
    }
  }
  
  res.json({
    success: true,
    message: 'External service call successful',
    service
  });
}, 'EXTERNAL_SERVICE');

/**
 * Example of using validation middleware
 * POST /api/example/streams
 */
const createStreamExample = enhancedAsyncHandler(async (req, res) => {
  const { title, description, category, isPrivate, tags } = req.body;
  const userId = req.user.id;
  
  // Create stream (validation already done by middleware)
  const stream = await streamRepository.create({
    userId,
    title,
    description: description || '',
    category: category || 'general',
    isPrivate: isPrivate || false,
    tags: tags || []
  });
  
  res.status(201).json({
    success: true,
    message: 'Stream created successfully',
    stream
  });
});

// Set up routes with appropriate middleware
router.get('/validate/:id', validateExample);
router.get('/not-found/:id', notFoundExample);
router.get('/auth/:streamId', authenticate, authorizationExample);
router.post('/business', enhancedAsyncHandler(businessLogicExample));
router.post('/external', externalServiceExample);
router.post('/streams', authenticate, validate(streamValidation.create), createStreamExample);

module.exports = {
  router,
  validateExample,
  notFoundExample,
  authorizationExample,
  businessLogicExample,
  externalServiceExample,
  createStreamExample
}; 