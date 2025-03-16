/**
 * Add Missing Tables Script
 * 
 * This script adds missing tables to the existing MySQL database.
 * It checks which tables already exist and only creates the ones that are missing.
 */
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

// Load environment variables
dotenv.config();

// MySQL configuration
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  multipleStatements: true // Enable multiple statements for schema initialization
};

/**
 * Get existing tables in the database
 */
async function getExistingTables(connection) {
  try {
    const [tables] = await connection.query('SHOW TABLES');
    return tables.map(table => Object.values(table)[0]);
  } catch (error) {
    logger.error(`Error getting existing tables: ${error.message}`);
    throw error;
  }
}

/**
 * Extract CREATE TABLE statements from SQL file
 */
function extractCreateTableStatements(sql) {
  const statements = [];
  const regex = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`?(\w+)`?/gi;
  let match;
  let currentStatement = '';
  let inStatement = false;
  let bracketCount = 0;
  
  // Split SQL by lines
  const lines = sql.split('\n');
  
  for (const line of lines) {
    // Skip comments
    if (line.trim().startsWith('--')) continue;
    
    // Check if line contains CREATE TABLE
    if (!inStatement && line.toUpperCase().includes('CREATE TABLE')) {
      inStatement = true;
      currentStatement = line;
      bracketCount += (line.match(/\(/g) || []).length;
      bracketCount -= (line.match(/\)/g) || []).length;
    } else if (inStatement) {
      currentStatement += '\n' + line;
      bracketCount += (line.match(/\(/g) || []).length;
      bracketCount -= (line.match(/\)/g) || []).length;
      
      // If brackets are balanced and we have a semicolon, the statement is complete
      if (bracketCount === 0 && line.includes(';')) {
        statements.push(currentStatement);
        inStatement = false;
        currentStatement = '';
      }
    }
  }
  
  return statements;
}

/**
 * Extract table name from CREATE TABLE statement
 */
function extractTableName(createStatement) {
  const match = createStatement.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`?(\w+)`?/i);
  return match ? match[1] : null;
}

/**
 * Add missing tables to the database
 */
async function addMissingTables() {
  let connection;
  
  try {
    logger.info('Connecting to MySQL database...');
    connection = await mysql.createConnection(MYSQL_CONFIG);
    logger.info('Connected to MySQL database');
    
    // Get existing tables
    const existingTables = await getExistingTables(connection);
    logger.info(`Existing tables: ${existingTables.join(', ')}`);
    
    // Get schema directory
    const schemaDir = path.join(__dirname, '../config/schema');
    
    // Read all .sql files
    const files = await fs.readdir(schemaDir);
    const sqlFiles = files.filter(file => file.endsWith('.sql'));
    
    // Sort files to ensure they're executed in the right order
    sqlFiles.sort();
    
    // Process each SQL file
    for (const file of sqlFiles) {
      logger.info(`Processing schema file: ${file}`);
      const sqlPath = path.join(schemaDir, file);
      const sql = await fs.readFile(sqlPath, 'utf8');
      
      // Extract CREATE TABLE statements
      const createStatements = extractCreateTableStatements(sql);
      
      // Process each CREATE TABLE statement
      for (const statement of createStatements) {
        const tableName = extractTableName(statement);
        
        if (tableName && !existingTables.includes(tableName)) {
          logger.info(`Creating missing table: ${tableName}`);
          await connection.query(statement);
          logger.info(`Table ${tableName} created successfully`);
        } else if (tableName) {
          logger.info(`Table ${tableName} already exists, skipping`);
        }
      }
    }
    
    logger.info('All missing tables have been added successfully');
  } catch (error) {
    logger.error(`Error adding missing tables: ${error.message}`);
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
  addMissingTables().catch(error => {
    logger.error(`Failed to add missing tables: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  addMissingTables
}; 