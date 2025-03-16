/**
 * Script to add a verify streamer endpoint
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Add the verify streamer function to the user controller
const userControllerPath = path.join(__dirname, '../controllers/user.controller.js');
let userControllerContent = fs.readFileSync(userControllerPath, 'utf8');

// Find the position to insert the new function (before the module.exports)
const moduleExportsPos = userControllerContent.indexOf('module.exports =');

// Add the verify streamer function
const verifyStreamerFunction = `
/**
 * Verify user as a streamer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function verifyStreamer(req, res) {
  try {
    const userId = req.user.id;
    
    // Check if using SQLite
    const useSQLite = process.env.USE_SQLITE === 'true';
    
    if (useSQLite) {
      const { User } = require('../models/user.model');
      
      // Find user in SQLite
      const user = await User.findOne({ where: { id: userId } });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Update user to be a streamer
      await user.update({ 
        isStreamer: true,
        isVerified: true
      });
      
      // Refresh user data
      const updatedUser = await User.findOne({
        where: { id: userId },
        attributes: { exclude: ['password'] }
      });
      
      return res.status(200).json({
        success: true,
        message: 'User verified as streamer successfully',
        user: updatedUser
      });
    } else {
      const User = require('../models/user.model');
      
      // Find user in MongoDB
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Update user to be a streamer
      user.isStreamer = true;
      user.isVerified = true;
      await user.save();
      
      // Get updated user without password
      const updatedUser = await User.findById(userId).select('-password');
      
      return res.status(200).json({
        success: true,
        message: 'User verified as streamer successfully',
        user: updatedUser
      });
    }
  } catch (error) {
    logger.error(\`Error verifying streamer: \${error.message}\`);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify streamer',
      error: error.message
    });
  }
}
`;

// Insert the new function before module.exports
const updatedUserControllerContent = userControllerContent.slice(0, moduleExportsPos) + 
  verifyStreamerFunction + 
  userControllerContent.slice(moduleExportsPos);

// Update the module.exports to include the new function
const updatedModuleExports = updatedUserControllerContent.replace(
  'module.exports = {',
  'module.exports = {\n  verifyStreamer,'
);

// Write the updated controller back to the file
fs.writeFileSync(userControllerPath, updatedModuleExports);

// Add the route to the user routes
const userRoutesPath = path.join(__dirname, '../routes/user.routes.js');
let userRoutesContent = fs.readFileSync(userRoutesPath, 'utf8');

// Update the imports to include verifyStreamer
const updatedImports = userRoutesContent.replace(
  'const { \n  getUserProfile, \n  updateUserProfile, \n  getUserStreams, \n  followUser, \n  unfollowUser,\n  getUserFollowers,\n  getUserFollowing,\n  changePassword\n} = require(\'../controllers/user.controller\');',
  'const { \n  getUserProfile, \n  updateUserProfile, \n  getUserStreams, \n  followUser, \n  unfollowUser,\n  getUserFollowers,\n  getUserFollowing,\n  changePassword,\n  verifyStreamer\n} = require(\'../controllers/user.controller\');'
);

// Find the position to insert the new route (before module.exports)
const routerExportsPos = updatedImports.indexOf('module.exports =');

// Add the verify streamer route
const verifyStreamerRoute = `
// Verify user as a streamer
router.patch('/verify-streamer', authenticate, verifyStreamer);
`;

// Insert the new route before module.exports
const updatedUserRoutesContent = updatedImports.slice(0, routerExportsPos) + 
  verifyStreamerRoute + 
  updatedImports.slice(routerExportsPos);

// Write the updated routes back to the file
fs.writeFileSync(userRoutesPath, updatedUserRoutesContent);

console.log('Added verify streamer endpoint successfully!');
