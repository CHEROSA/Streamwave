/**
 * Create the PostgreSQL database
 * Run with: node src/scripts/create-db.js
 */

require('dotenv').config();
const { Client } = require('pg');
const logger = require('../utils/logger');

async function createDatabase() {
  // Connect to the default 'postgres' database first
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    database: 'postgres'
  });

  try {
    await client.connect();
    logger.info('Connected to PostgreSQL');

    // Check if database exists
    const checkResult = await client.query(
      "SELECT datname FROM pg_database WHERE datname = $1",
      [process.env.POSTGRES_DB || 'streamwave']
    );

    if (checkResult.rows.length === 0) {
      // Database doesn't exist, create it
      logger.info(`Creating database: ${process.env.POSTGRES_DB || 'streamwave'}`);
      await client.query(`CREATE DATABASE ${process.env.POSTGRES_DB || 'streamwave'}`);
      logger.info('Database created successfully');
    } else {
      logger.info('Database already exists');
    }

    logger.info('Database setup completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error setting up database:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createDatabase();
