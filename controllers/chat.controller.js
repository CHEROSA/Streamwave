const chatService = require('../services/chat.service');

/**
 * Get messages for a stream
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getStreamMessages = async (req, res, next) => {
  try {
    const { streamId } = req.params;
    const messages = await chatService.getStreamMessages(streamId);
    res.json(messages);
  } catch (error) {
    next(error);
  }
};

/**
 * Send a message to a stream
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const sendMessage = async (req, res, next) => {
  try {
    const { streamId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const message = await chatService.createMessage(streamId, userId, content);
    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a message
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const success = await chatService.deleteMessage(messageId);
    
    if (!success) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStreamMessages,
  sendMessage,
  deleteMessage
}; 