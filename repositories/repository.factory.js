/**
 * Repository Factory
 * 
 * This module provides a factory for creating and accessing repositories.
 * It ensures that only one instance of each repository is created.
 */

const ChatRepository = require('./chat.repository');
const UserRepository = require('./user.repository');
const StreamRepository = require('./stream.repository');
const PaymentRepository = require('./payment.repository');

// Repository instances
const repositories = {
  chat: null,
  user: null,
  stream: null,
  payment: null
};

/**
 * Get the chat repository instance
 * @returns {ChatRepository} The chat repository instance
 */
const getChatRepository = () => {
  if (!repositories.chat) {
    repositories.chat = ChatRepository;
  }
  return repositories.chat;
};

/**
 * Get the user repository instance
 * @returns {UserRepository} The user repository instance
 */
const getUserRepository = () => {
  if (!repositories.user) {
    repositories.user = UserRepository;
  }
  return repositories.user;
};

/**
 * Get the stream repository instance
 * @returns {StreamRepository} The stream repository instance
 */
const getStreamRepository = () => {
  if (!repositories.stream) {
    repositories.stream = StreamRepository;
  }
  return repositories.stream;
};

/**
 * Get the payment repository instance
 * @returns {PaymentRepository} The payment repository instance
 */
const getPaymentRepository = () => {
  if (!repositories.payment) {
    repositories.payment = PaymentRepository;
  }
  return repositories.payment;
};

module.exports = {
  getChatRepository,
  getUserRepository,
  getStreamRepository,
  getPaymentRepository
};