/**
 * Script to create a test user in the MySQL database
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../config/database');
const logger = require('../utils/logger');

async function createTestUser() {
  console.log('Starting test user creation...');
  console.log('Database connection configuration:', {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    database: process.env.MYSQL_DATABASE
  });

  // Test user data
  const userData = {
    username: 'testuser',
    email: 'test123@test.com',
    password: await bcrypt.hash('password123', 10),
    displayName: 'Test User',
    isActive: true,
    role: 'user'
  };

  console.log('User data prepared:', {
    username: userData.username,
    email: userData.email,
    displayName: userData.displayName,
    // Don't log password hash
  });

  try {
    // Connect to the database
    console.log('Connecting to database...');
    await db.connectDB();
    console.log('Successfully connected to database.');
    
    // Check if user already exists
    console.log('Checking if user already exists...');
    const checkSql = 'SELECT * FROM users WHERE email = ?';
    const userExists = await db.query(checkSql, [userData.email]);

    if (userExists.length > 0) {
      console.log(`Test user with email ${userData.email} already exists with ID: ${userExists[0].id}`);
      return userExists[0];
    }

    // Create columns and values for SQL
    const columns = Object.keys(userData).join(', ');
    const placeholders = Object.keys(userData).map(() => '?').join(', ');
    const values = Object.values(userData);
    
    // Insert the user
    console.log('Inserting new user...');
    const sql = `INSERT INTO users (${columns}) VALUES (${placeholders})`;
    const result = await db.query(sql, values);
    
    console.log(`Test user created with ID: ${result.insertId}`);
    
    // Get the created user
    console.log('Retrieving created user...');
    const user = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    return user[0];
  } catch (error) {
    console.error(`Error creating test user: ${error.message}`);
    console.error(error.stack);
    throw error;
  } finally {
    console.log('Closing database connection...');
    await db.closeConnection();
    console.log('Database connection closed.');
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  console.log('Running test user creation script directly...');
  createTestUser()
    .then((user) => {
      console.log('Test user created or verified successfully:');
      console.log(`ID: ${user.id}`);
      console.log(`Username: ${user.username}`);
      console.log(`Email: ${user.email}`);
      console.log(`Password: password123`);
      console.log('You can now use these credentials to log in.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to create test user:', error);
      process.exit(1);
    });
} else {
  // Export for use in other scripts
  module.exports = createTestUser;
} 