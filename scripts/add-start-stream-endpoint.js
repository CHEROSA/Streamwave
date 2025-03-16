/**
 * Script to add a start stream endpoint
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const User = require('../models/user.model');

// Add the start stream function to the stream controller
const streamControllerPath = path.join(__dirname, '../controllers/stream.controller.js');
let streamControllerContent = fs.readFileSync(streamControllerPath, 'utf8');

// Find the position to insert the new function (before the module.exports)
const moduleExportsPos = streamControllerContent.indexOf('module.exports =');

// Add the start stream function
const startStreamFunction = `
/**
 * Start a stream with the user's stream key
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const startStream = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description, category, tags, thumbnail } = req.body;
    
    // Get the user's stream key
    const useSQLite = process.env.USE_SQLITE === 'true';
    let user;
    
    // Use consolidated user model
    const User = require('../models/user.model');
    
    // Adjust query based on database type
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
    
    // Create stream in database
    const stream = await Stream.create({
      userId,
      title: title || 'Untitled Stream',
      description: description || '',
      thumbnail: thumbnail || '',
      isPrivate: false,
      category: category || 'General',
      tags: tags || [],
      status: 'live',
      startTime: new Date(),
      rtmpUrl: \`rtmp://streaming.streamwave.com/live/\${user.streamKey}\`,
      liveKitRoom: \`stream-\${userId}-\${Date.now()}\`
    });
    
    // Create stream metadata
    await StreamMetadata.create({
      streamId: stream.id,
      userId,
      status: 'live',
      startedAt: new Date()
    });
    
    // Store active stream in Redis for quick access
    await redisClient.hSet('active_streams', stream.id, JSON.stringify({
      id: stream.id,
      userId,
      title: title || 'Untitled Stream',
      thumbnail: thumbnail || '',
      startTime: new Date(),
      viewerCount: 0
    }));
    
    return res.status(201).json({
      success: true,
      message: 'Stream started successfully',
      stream: {
        id: stream.id,
        title: stream.title,
        description: stream.description,
        thumbnail: stream.thumbnail,
        category: stream.category,
        tags: stream.tags,
        status: stream.status,
        startTime: stream.startTime,
        rtmpUrl: stream.rtmpUrl,
        liveKitRoom: stream.liveKitRoom
      }
    });
  } catch (error) {
    logger.error(\`Error starting stream: \${error.message}\`);
    return res.status(500).json({
      success: false,
      message: 'Failed to start stream',
      error: error.message
    });
  }
};
`;

// Insert the new function before module.exports
const updatedStreamControllerContent = streamControllerContent.slice(0, moduleExportsPos) + 
  startStreamFunction + 
  streamControllerContent.slice(moduleExportsPos);

// Update the module.exports to include the new function
const updatedModuleExports = updatedStreamControllerContent.replace(
  'module.exports = {',
  'module.exports = {\n  startStream,'
);

// Write the updated controller back to the file
fs.writeFileSync(streamControllerPath, updatedModuleExports);

// Add the route to the stream routes
const streamRoutesPath = path.join(__dirname, '../routes/stream.routes.js');
let streamRoutesContent = fs.readFileSync(streamRoutesPath, 'utf8');

// Find the position to insert the new route (before module.exports)
const routerExportsPos = streamRoutesContent.indexOf('module.exports =');

// Add the start stream route
const startStreamRoute = `
// Start a stream
router.post('/start', authenticate, startStream);
`;

// Insert the new route before module.exports
const updatedStreamRoutesContent = streamRoutesContent.slice(0, routerExportsPos) + 
  startStreamRoute + 
  streamRoutesContent.slice(routerExportsPos);

// Write the updated routes back to the file
fs.writeFileSync(streamRoutesPath, updatedStreamRoutesContent);

console.log('Added start stream endpoint successfully!');
