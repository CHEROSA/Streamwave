const { AccessToken } = require('livekit-server-sdk');
require('dotenv').config();

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_SECRET = process.env.LIVEKIT_SECRET || 'secret';
const LIVEKIT_HOST = process.env.LIVEKIT_HOST || 'http://localhost:7880';

/**
 * Generates a JWT token for LiveKit room access
 * @param {string} identity - User identity (usually user ID)
 * @param {string} roomName - Name of the room to join
 * @param {Object} options - Additional token options
 * @param {string} options.name - User display name
 * @param {string} options.metadata - User metadata (JSON string)
 * @param {boolean} options.canPublish - Whether user can publish streams
 * @param {boolean} options.canSubscribe - Whether user can subscribe to streams
 * @param {boolean} options.video - Whether to enable video
 * @param {boolean} options.audio - Whether to enable audio
 * @returns {Promise<string>} JWT token
 */
async function generateToken(identity, roomName, options = {}) {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_SECRET, {
        identity,
        name: options.name,
        metadata: options.metadata,
    });
    
    token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: options.canPublish === undefined ? true : options.canPublish,
        canSubscribe: options.canSubscribe === undefined ? true : options.canSubscribe,
        canPublishData: true,
        hidden: false,
    });
    
    return await token.toJwt();
}

module.exports = { 
    generateToken,
    LIVEKIT_API_KEY,
    LIVEKIT_SECRET,
    LIVEKIT_HOST
};
