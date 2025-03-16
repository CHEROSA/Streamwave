/**
 * Script to add a regenerate stream key endpoint
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/user.model');

// Add the regenerate stream key function to the user controller
const userControllerPath = path.join(__dirname, '../controllers/user.controller.js');
let userControllerContent = fs.readFileSync(userControllerPath, 'utf8');

// Find the position to insert the new function (before the module.exports)
const moduleExportsPos = userControllerContent.indexOf('module.exports =');

// Add the regenerate stream key function
const regenerateStreamKeyFunction = `
/**
 * Regenerate user's stream key
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function regenerateStreamKey(req, res) {
  try {
    const userId = req.user.id;
    const newStreamKey = uuidv4();
    
    // Check if using SQLite
    const useSQLite = process.env.USE_SQLITE === 'true';
    
    let user;
    
    // Use consolidated user model
    const User = require('../models/user.model');

    if (useSQLite) {
      user = await User.findOne({ where: { id: userId } });
    } else {
      user = await User.findById(userId);
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if user is a streamer
    if (!user.isStreamer) {
      return res.status(403).json({
        success: false,
        message: 'User is not a verified streamer'
      });
    }
    
    // Update user's stream key
    if (useSQLite) {
      await user.update({ streamKey: newStreamKey });
      
      // Refresh user data
      const updatedUser = await User.findOne({
        where: { id: userId },
        attributes: { exclude: ['password'] }
      });
      
      return res.status(200).json({
        success: true,
        message: 'Stream key regenerated successfully',
        user: updatedUser
      });
    } else {
      user.streamKey = newStreamKey;
      await user.save();
      
      // Get updated user without password
      const updatedUser = await User.findById(userId).select('-password');
      
      return res.status(200).json({
        success: true,
        message: 'Stream key regenerated successfully',
        user: updatedUser
      });
    }
  } catch (error) {
    logger.error(\`Error regenerating stream key: \${error.message}\`);
    return res.status(500).json({
      success: false,
      message: 'Failed to regenerate stream key',
      error: error.message
    });
  }
}
`;

// Insert the new function before module.exports
const updatedUserControllerContent = userControllerContent.slice(0, moduleExportsPos) + 
  regenerateStreamKeyFunction + 
  userControllerContent.slice(moduleExportsPos);

// Update the module.exports to include the new function
const updatedModuleExports = updatedUserControllerContent.replace(
  'module.exports = {',
  'module.exports = {\n  regenerateStreamKey,'
);

// Write the updated controller back to the file
fs.writeFileSync(userControllerPath, updatedModuleExports);

// Add the route to the user routes
const userRoutesPath = path.join(__dirname, '../routes/user.routes.js');
let userRoutesContent = fs.readFileSync(userRoutesPath, 'utf8');

// Update the imports to include regenerateStreamKey
const updatedImports = userRoutesContent.replace(
  'const { \n  getUserProfile, \n  updateUserProfile, \n  getUserStreams, \n  followUser, \n  unfollowUser,\n  getUserFollowers,\n  getUserFollowing,\n  changePassword,\n  verifyStreamer\n} = require(\'../controllers/user.controller\');',
  'const { \n  getUserProfile, \n  updateUserProfile, \n  getUserStreams, \n  followUser, \n  unfollowUser,\n  getUserFollowers,\n  getUserFollowing,\n  changePassword,\n  verifyStreamer,\n  regenerateStreamKey\n} = require(\'../controllers/user.controller\');'
);

// Find the position to insert the new route (before module.exports)
const routerExportsPos = updatedImports.indexOf('module.exports =');

// Add the regenerate stream key route
const regenerateStreamKeyRoute = `
// Regenerate stream key
router.post('/regenerate-stream-key', authenticate, regenerateStreamKey);
`;

// Insert the new route before module.exports
const updatedUserRoutesContent = updatedImports.slice(0, routerExportsPos) + 
  regenerateStreamKeyRoute + 
  updatedImports.slice(routerExportsPos);

// Write the updated routes back to the file
fs.writeFileSync(userRoutesPath, updatedUserRoutesContent);

console.log('Added regenerate stream key endpoint successfully!');
