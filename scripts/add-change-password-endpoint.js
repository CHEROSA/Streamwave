/**
 * Script to add a change password endpoint
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const User = require('../models/user.model');
const bcrypt = require('bcrypt');

// Add the change password function to the user controller
const userControllerPath = path.join(__dirname, '../controllers/user.controller.js');
let userControllerContent = fs.readFileSync(userControllerPath, 'utf8');

// Find the position to insert the new function (before the module.exports)
const moduleExportsPos = userControllerContent.indexOf('module.exports =');

// Add the change password function
const changePasswordFunction = `
/**
 * Change user password
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function changePassword(req, res) {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }
    
    // Check if using SQLite
    const useSQLite = process.env.USE_SQLITE === 'true';
    
    if (useSQLite) {
      const bcrypt = require('bcrypt');
      
      // Find user in SQLite
      const user = await User.findOne({ where: { id: userId } });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
      
      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      // Update password
      await user.update({ password: hashedPassword });
      
      return res.status(200).json({
        success: true,
        message: 'Password updated successfully'
      });
    } else {
      const bcrypt = require('bcrypt');
      
      // Find user in MongoDB
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
      
      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      // Update password
      user.password = hashedPassword;
      await user.save();
      
      return res.status(200).json({
        success: true,
        message: 'Password updated successfully'
      });
    }
  } catch (error) {
    logger.error(\`Error changing password: \${error.message}\`);
    return res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
}
`;

// Insert the new function before module.exports
const updatedUserControllerContent = userControllerContent.slice(0, moduleExportsPos) + 
  changePasswordFunction + 
  userControllerContent.slice(moduleExportsPos);

// Update the module.exports to include the new function
const updatedModuleExports = updatedUserControllerContent.replace(
  'module.exports = {',
  'module.exports = {\n  changePassword,'
);

// Write the updated controller back to the file
fs.writeFileSync(userControllerPath, updatedModuleExports);

// Add the route to the user routes
const userRoutesPath = path.join(__dirname, '../routes/user.routes.js');
let userRoutesContent = fs.readFileSync(userRoutesPath, 'utf8');

// Update the imports to include changePassword
const updatedImports = userRoutesContent.replace(
  'const { \n  getUserProfile, \n  updateUserProfile, \n  getUserStreams, \n  followUser, \n  unfollowUser,\n  getUserFollowers,\n  getUserFollowing\n} = require(\'../controllers/user.controller\');',
  'const { \n  getUserProfile, \n  updateUserProfile, \n  getUserStreams, \n  followUser, \n  unfollowUser,\n  getUserFollowers,\n  getUserFollowing,\n  changePassword\n} = require(\'../controllers/user.controller\');'
);

// Find the position to insert the new route (before module.exports)
const routerExportsPos = updatedImports.indexOf('module.exports =');

// Add the change password route
const changePasswordRoute = `
// Change password
router.patch('/change-password', authenticate, changePassword);
`;

// Insert the new route before module.exports
const updatedUserRoutesContent = updatedImports.slice(0, routerExportsPos) + 
  changePasswordRoute + 
  updatedImports.slice(routerExportsPos);

// Write the updated routes back to the file
fs.writeFileSync(userRoutesPath, updatedUserRoutesContent);

console.log('Added change password endpoint successfully!');
