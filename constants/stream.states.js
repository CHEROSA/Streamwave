/**
 * Stream States
 * 
 * This file defines the possible states of a stream in the system.
 */

const StreamState = {
  NEW: 'NEW',
  SCHEDULED: 'SCHEDULED',
  LIVE: 'LIVE',
  PROCESSING: 'PROCESSING',
  ENDED: 'ENDED'
};

module.exports = {
  StreamState
}; 