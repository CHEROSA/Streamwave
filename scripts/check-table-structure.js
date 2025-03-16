/**
 * Check Table Structure Script
 * 
 * This script checks the structure of existing tables in the database.
 */
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

// Load environment variables
dotenv.config();

// MySQL configuration
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE
};

/**
 * Check the structure of existing tables
 */
async function checkTableStructure() {
  let connection;
  
  try {
    logger.info('Connecting to MySQL database...');
    connection = await mysql.createConnection(MYSQL_CONFIG);
    logger.info('Connected to MySQL database');
    
    // Get all tables
    const [tables] = await connection.query('SHOW TABLES');
    const tableNames = tables.map(table => Object.values(table)[0]);
    
    logger.info(`Found ${tableNames.length} tables: ${tableNames.join(', ')}`);
    
    // Check structure of key tables
    const keyTables = ['users', 'streams', 'transactions', 'user_followers', 'chat_messages', 'gifts'];
    
    for (const tableName of keyTables) {
      if (tableNames.includes(tableName)) {
        const [columns] = await connection.query(`DESCRIBE ${tableName}`);
        
        logger.info(`Table '${tableName}' structure:`);
        columns.forEach(column => {
          logger.info(`  ${column.Field} (${column.Type}) ${column.Null === 'YES' ? 'NULL' : 'NOT NULL'} ${column.Key} ${column.Default ? `DEFAULT '${column.Default}'` : ''}`);
        });
      } else {
        logger.warn(`Table '${tableName}' does not exist`);
      }
    }
    
  } catch (error) {
    logger.error(`Error checking table structure: ${error.message}`);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      logger.info('Database connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  checkTableStructure().catch(error => {
    logger.error(`Failed to check table structure: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  checkTableStructure
}; 