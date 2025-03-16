/**
 * Check Database Tables
 * 
 * This script checks the structure of the database tables
 */
require('dotenv').config();
const db = require('../config/database');

async function checkDatabaseTables() {
  try {
    console.log('Connecting to database...');
    await db.connectDB();
    
    // Get all tables
    console.log('Fetching tables...');
    const tables = await db.query('SHOW TABLES');
    console.log('Tables in database:');
    console.log(tables.map(t => Object.values(t)[0]).join(', '));
    
    // Check virtual_gifts structure
    console.log('\nChecking virtual_gifts table structure:');
    try {
      const virtualGiftsColumns = await db.query('DESCRIBE virtual_gifts');
      console.log('virtual_gifts table exists with columns:');
      virtualGiftsColumns.forEach(col => {
        console.log(`- ${col.Field} (${col.Type}, ${col.Null === 'YES' ? 'nullable' : 'not nullable'}, ${col.Key ? 'key: ' + col.Key : 'not a key'})`);
      });
    } catch (error) {
      console.log('virtual_gifts table does not exist or error:', error.message);
    }
    
    // Check transactions structure
    console.log('\nChecking transactions table structure:');
    try {
      const transactionsColumns = await db.query('DESCRIBE transactions');
      console.log('transactions table exists with columns:');
      transactionsColumns.forEach(col => {
        console.log(`- ${col.Field} (${col.Type}, ${col.Null === 'YES' ? 'nullable' : 'not nullable'}, ${col.Key ? 'key: ' + col.Key : 'not a key'})`);
      });
    } catch (error) {
      console.log('transactions table does not exist or error:', error.message);
    }
    
    // Check users table for payment fields
    console.log('\nChecking users table for payment fields:');
    try {
      const userColumns = await db.query('DESCRIBE users');
      const paymentFields = ['earningsBalance', 'totalEarnings', 'lastPayoutDate'];
      
      const foundPaymentFields = paymentFields.filter(field => 
        userColumns.some(col => col.Field === field)
      );
      
      if (foundPaymentFields.length === paymentFields.length) {
        console.log('All payment fields exist in users table:');
        paymentFields.forEach(field => {
          const col = userColumns.find(c => c.Field === field);
          console.log(`- ${col.Field} (${col.Type}, ${col.Null === 'YES' ? 'nullable' : 'not nullable'})`);
        });
      } else {
        console.log('Missing payment fields in users table:');
        const missingFields = paymentFields.filter(field => !foundPaymentFields.includes(field));
        missingFields.forEach(field => console.log(`- ${field}`));
      }
    } catch (error) {
      console.log('users table does not exist or error:', error.message);
    }
    
    return true;
  } catch (error) {
    console.error('Error checking database tables:', error);
    throw error;
  } finally {
    console.log('\nClosing database connection...');
    await db.closeConnection();
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  checkDatabaseTables()
    .then(() => {
      console.log('Successfully checked database tables');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to check database tables:', error);
      process.exit(1);
    });
} else {
  // Export for use in other scripts
  module.exports = checkDatabaseTables;
} 