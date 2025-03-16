/**
 * Cache Utilities
 * 
 * Provides utility functions for the cache manager
 */
const crypto = require('crypto');

/**
 * Create a deterministic hash for an object
 * @param {Object} obj - Object to hash
 * @returns {string} - Hash string
 */
const createHash = (obj) => {
  // Sort keys to ensure consistent hashing regardless of property order
  const sortedObj = sortObjectKeys(obj);
  
  // Create hash from stringified object
  const hash = crypto.createHash('md5')
    .update(JSON.stringify(sortedObj))
    .digest('hex');
    
  return hash;
};

/**
 * Sort object keys recursively to ensure consistent stringification
 * @param {*} obj - Object to sort keys for
 * @returns {*} - Object with sorted keys
 */
const sortObjectKeys = (obj) => {
  // If not an object or null, return as is
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  
  // Sort keys and create new object
  return Object.keys(obj)
    .sort()
    .reduce((sorted, key) => {
      sorted[key] = sortObjectKeys(obj[key]);
      return sorted;
    }, {});
};

module.exports = {
  createHash
};