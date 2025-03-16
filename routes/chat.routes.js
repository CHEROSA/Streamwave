const express = require('express');
const { authenticate } = require('../middlewares/auth.middleware');
const { getStreamMessages, sendMessage, deleteMessage } = require('../controllers/chat.controller');

const router = express.Router();

// Get messages for a stream
router.get('/:streamId/messages', authenticate, getStreamMessages);

// Send a message to a stream
router.post('/:streamId/messages', authenticate, sendMessage);

// Delete a message
router.delete('/messages/:messageId', authenticate, deleteMessage);

module.exports = router; 