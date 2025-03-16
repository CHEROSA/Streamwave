const { generateToken } = require('../config/livekit');
const { RoomServiceClient, Room, createRoomCreateOptions } = require('livekit-server-sdk');
const logger = require('../utils/logger');
const config = require('../config');
const streamRepository = require('../repositories/stream.repository');
const userRepository = require('../repositories/user.repository');
const { asyncHandler } = require('../middleware/errorHandler');

// Initialize LiveKit Room Service client
const livekitHost = process.env.LIVEKIT_HOST || 'http://localhost:7880';
const livekitApiKey = process.env.LIVEKIT_API_KEY || 'devkey';
const livekitApiSecret = process.env.LIVEKIT_SECRET || 'secret';

const roomService = new RoomServiceClient(livekitHost, livekitApiKey, livekitApiSecret);

/**
 * Controller for LiveKit WebRTC streaming functionality
 */
const livekitController = {
  /**
   * Generate a token for joining a LiveKit room
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  generateToken: asyncHandler(async (req, res) => {
    const { userId, roomName, metadata, isHost = false } = req.body;
    
    if (!userId || !roomName) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID and room name are required' 
      });
    }
    
    // Get user information
    const user = await userRepository.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Only update stream metadata if this is the host
    if (isHost) {
      // Get the stream by room name (which is the stream ID)
      const stream = await streamRepository.findById(roomName);
      
      if (stream) {
        // Verify the stream belongs to this user
        if (stream.userId.toString() !== userId.toString()) {
          return res.status(403).json({
            success: false,
            message: 'You do not have permission to host this stream'
          });
        }
        
        // Update stream status to live
        await streamRepository.update(roomName, {
          isLive: true,
          status: 'live',
          actualStartTime: new Date(),
          settings: {
            ...stream.settings,
            liveKitRoom: roomName
          }
        });
        
        logger.info(`Stream ${roomName} is now live with LiveKit room`);
      }
    }
    
    // Generate the token with appropriate permissions
    const token = await generateToken(userId, roomName, {
      name: user.username || user.displayName,
      metadata: JSON.stringify({
        ...metadata,
        userId,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatarUrl,
        isHost
      }),
      canPublish: isHost, // Only hosts can publish video/audio
      canSubscribe: true, // Everyone can subscribe to streams
      video: isHost,
      audio: isHost
    });
    
    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl
      },
      isHost
    });
  }),
  
  /**
   * Create a new LiveKit room for streaming
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  createRoom: asyncHandler(async (req, res) => {
    const { streamId, metadata } = req.body;
    
    if (!streamId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Stream ID is required' 
      });
    }
    
    try {
      // Create room options
      const roomOptions = createRoomCreateOptions({
        name: streamId,
        emptyTimeout: 300, // 5 minutes
        maxParticipants: 100,
        metadata: metadata ? JSON.stringify(metadata) : undefined
      });
      
      // Create the LiveKit room
      const room = await roomService.createRoom(roomOptions);
      
      // Update stream with LiveKit room info
      await streamRepository.update(streamId, {
        settings: {
          liveKitRoom: streamId,
          liveKitEnabled: true
        }
      });
      
      return res.status(201).json({
        success: true,
        room: {
          name: room.name,
          metadata: room.metadata,
          createdAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error(`Error creating LiveKit room: ${error.message}`);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create room' 
      });
    }
  }),
  
  /**
   * End a LiveKit room and mark stream as ended
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  endRoom: asyncHandler(async (req, res) => {
    const { roomName } = req.params;
    
    if (!roomName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Room name is required' 
      });
    }
    
    try {
      // End the LiveKit room
      await roomService.deleteRoom(roomName);
      
      // Update stream status to ended
      await streamRepository.update(roomName, {
        isLive: false,
        status: 'ended',
        endTime: new Date(),
        duration: await streamRepository.calculateStreamDuration(roomName)
      });
      
      return res.status(200).json({
        success: true,
        message: `Stream and LiveKit room ${roomName} have been ended`
      });
    } catch (error) {
      logger.error(`Error ending LiveKit room: ${error.message}`);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to end room' 
      });
    }
  }),
  
  /**
   * Get active LiveKit room participants
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getRoomParticipants: asyncHandler(async (req, res) => {
    const { roomName } = req.params;
    
    if (!roomName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Room name is required' 
      });
    }
    
    try {
      // Get room participants from LiveKit
      const participants = await roomService.listParticipants(roomName);
      
      // Format the response
      const formattedParticipants = participants.map(p => ({
        id: p.identity,
        name: p.name,
        metadata: p.metadata ? JSON.parse(p.metadata) : {},
        joinedAt: p.joinedAt,
        isPublisher: p.state === Room.ParticipantState.ACTIVE && p.permission?.canPublish
      }));
      
      return res.status(200).json({
        success: true,
        participants: formattedParticipants
      });
    } catch (error) {
      logger.error(`Error getting LiveKit room participants: ${error.message}`);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get room participants' 
      });
    }
  }),
  
  /**
   * Kick a participant from the LiveKit room
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  kickParticipant: asyncHandler(async (req, res) => {
    const { roomName, participantId } = req.params;
    
    if (!roomName || !participantId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Room name and participant ID are required' 
      });
    }
    
    try {
      // Verify the requester is the stream owner
      const stream = await streamRepository.findById(roomName);
      if (stream.userId.toString() !== req.user.id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Only the stream owner can kick participants'
        });
      }
      
      // Remove the participant from the room
      await roomService.removeParticipant(roomName, participantId);
      
      return res.status(200).json({
        success: true,
        message: `Participant ${participantId} removed from room ${roomName}`
      });
    } catch (error) {
      logger.error(`Error kicking participant from LiveKit room: ${error.message}`);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to kick participant' 
      });
    }
  })
};

module.exports = livekitController;