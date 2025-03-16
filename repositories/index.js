/**
 * Repository Index
 * 
 * Exports the repository factory and all repositories for easy access
 * throughout the application.
 */

// Export the repository factory
const repositoryFactory = require('./repository.factory');

// Export individual repositories for direct access
const userRepository = require('./user.repository');
const streamRepository = require('./stream.repository');
const chatRepository = require('./chat.repository');
const paymentRepository = require('./payment.repository');

module.exports = {
  // Repository factory
  repositoryFactory,

  // Individual repositories
  userRepository,
  streamRepository,
  chatRepository,
  paymentRepository,

  // Helper functions to get repositories through factory
  getUserRepository: () => repositoryFactory.getUserRepository(),
  getStreamRepository: () => repositoryFactory.getStreamRepository(),
  getChatRepository: () => repositoryFactory.getChatRepository(),
  getPaymentRepository: () => repositoryFactory.getPaymentRepository()
};