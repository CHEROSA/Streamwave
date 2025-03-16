const express = require('express');
const { protect } = require('../middleware/auth');
const streamController = require('../controllers/stream.controller')();

// Create router
const router = express.Router();

// Add core stream routes with controller functions
// Check if functions exist in the controller before using them
if (streamController.createStream) {
  router.post('/', protect, streamController.createStream);
}

if (streamController.getStreamById) {
  router.get('/:streamId', streamController.getStreamById);
}

if (streamController.updateStream) {
  router.put('/:streamId', protect, streamController.updateStream);
}

if (streamController.deleteStream) {
  router.delete('/:streamId', protect, streamController.deleteStream);
}

if (streamController.getActiveStreams) {
  router.get('/active', streamController.getActiveStreams);
}

// Additional routes not defined in the controller

// Get stream chat messages (public endpoint)
router.get('/:streamId/chat', (req, res) => {
  // This needs to be implemented
  res.status(501).json({ message: 'Not implemented yet' });
});

// Get stream statistics
router.get('/:streamId/stats', protect, (req, res) => {
  // This needs to be implemented
  res.status(501).json({ message: 'Not implemented yet' });
});

// Start a stream
router.post('/start', protect, (req, res) => {
  // This needs to be implemented
  res.status(501).json({ message: 'Not implemented yet' });
});

module.exports = router;
