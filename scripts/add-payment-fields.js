/**
 * Add Payment Fields to Users Table
 * 
 * This script adds the missing payment-related fields to the users table
 */
require('dotenv').config();
const db = require('../config/database');
const logger = require('../utils/logger');

async function addPaymentFieldsToUsers() {
  try {
    console.log('Connecting to database...');
    await db.connectDB();

    // Check for existing fields first
    console.log('Checking for existing payment fields in users table...');
    const userColumns = await db.query('DESCRIBE users');
    const columnsToAdd = [];

    // Check earningsBalance
    if (!userColumns.some(col => col.Field === 'earningsBalance')) {
      columnsToAdd.push("ADD COLUMN earningsBalance DECIMAL(10, 2) DEFAULT 0.00 AFTER socialLinks");
    }

    // Check totalEarnings
    if (!userColumns.some(col => col.Field === 'totalEarnings')) {
      columnsToAdd.push("ADD COLUMN totalEarnings DECIMAL(10, 2) DEFAULT 0.00 AFTER earningsBalance");
    }

    // Check lastPayoutDate
    if (!userColumns.some(col => col.Field === 'lastPayoutDate')) {
      columnsToAdd.push("ADD COLUMN lastPayoutDate DATETIME NULL AFTER totalEarnings");
    }

    // If there are columns to add, create and execute ALTER TABLE statement
    if (columnsToAdd.length > 0) {
      console.log(`Adding ${columnsToAdd.length} missing payment fields to users table...`);
      const alterStatement = `ALTER TABLE users ${columnsToAdd.join(', ')}`;
      
      console.log(`Executing: ${alterStatement}`);
      await db.query(alterStatement);
      console.log('Payment fields added successfully!');
    } else {
      console.log('All payment fields already exist in users table. No changes needed.');
    }

    return true;
  } catch (error) {
    console.error('Error adding payment fields to users table:', error);
    throw error;
  } finally {
    console.log('Closing database connection...');
    await db.closeConnection();
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  addPaymentFieldsToUsers()
    .then(() => {
      console.log('Successfully added payment fields to users table');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to add payment fields to users table:', error);
      process.exit(1);
    });
} else {
  // Export for use in other scripts
  module.exports = addPaymentFieldsToUsers;
} 