/**
 * Database Configuration Wrapper
 * 
 * This is a wrapper around the database.js file to maintain compatibility
 * with tests that expect a database.config.js file.
 */
const database = require('./database');

// Re-export all database methods
module.exports = database; 