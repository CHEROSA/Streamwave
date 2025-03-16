const express = require('express');
const { protect } = require('../middleware/auth');
const UserController = require('../controllers/user.controller');

// Create router
const router = express.Router();

// Create controller instance
const userController = new UserController();

// Add core user routes with proper middleware
router.get('/profile', protect, userController.getProfile.bind(userController));
router.get('/:id', protect, userController.getUserById.bind(userController));
router.get('/', protect, userController.getAllUsers.bind(userController));
router.post('/', userController.createUser.bind(userController));
router.put('/:id', protect, userController.updateUser.bind(userController));
router.delete('/:id', protect, userController.deleteUser.bind(userController));

// Additional routes not defined in the controller

// Follow a user
router.post('/follow/:userId', protect, (req, res) => {
  // This needs to be implemented
  res.status(501).json({ message: 'Not implemented yet' });
});

// Unfollow a user
router.delete('/follow/:userId', protect, (req, res) => {
  // This needs to be implemented
  res.status(501).json({ message: 'Not implemented yet' });
});

// Get user's followers (public endpoint)
router.get('/:userId/followers', (req, res) => {
  // This needs to be implemented
  res.status(501).json({ message: 'Not implemented yet' });
});

// Get users that a user is following (public endpoint)
router.get('/:userId/following', (req, res) => {
  // This needs to be implemented
  res.status(501).json({ message: 'Not implemented yet' });
});

// Verify user as a streamer
router.patch('/verify-streamer', protect, (req, res) => {
  // This needs to be implemented
  res.status(501).json({ message: 'Not implemented yet' });
});

// Regenerate stream key
router.post('/regenerate-stream-key', protect, (req, res) => {
  // This needs to be implemented
  res.status(501).json({ message: 'Not implemented yet' });
});

module.exports = router;
