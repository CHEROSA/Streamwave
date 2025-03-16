const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Import models directly
const User = require('../models/user.model');
const Stream = require('../models/stream.model');
const ChatMessage = require('../models/chatMessage.model');
const StreamMetadata = require('../models/streamMetadata.model');
const Payment = require('../models/payment.model');
const Transaction = require('../models/transaction.model');
const Gift = require('../models/gift.model');
const Token = require('../models/token.model');
const StreamViewer = require('../models/streamViewer.model');

// Database configuration
const config = {
  development: {
    username: process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'streamwave_dev',
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: (msg) => logger.debug(msg)
  },
  test: {
    username: process.env.TEST_DB_USER || 'root',
    password: process.env.TEST_DB_PASSWORD || '',
    database: process.env.TEST_DB_NAME || 'streamwave_test',
    host: process.env.TEST_DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false
  },
  production: {
    username: process.env.MYSQL_USER || process.env.DB_USER,
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME,
    host: process.env.MYSQL_HOST || process.env.DB_HOST,
    dialect: 'mysql',
    logging: false
  }
};

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging
  }
);

const db = {
  sequelize,
  Sequelize,
  models: {}
};

// Initialize models
const models = {
  User: User.init(sequelize, DataTypes),
  Stream: Stream.init(sequelize, DataTypes),
  ChatMessage: ChatMessage(sequelize, DataTypes),
  StreamMetadata: StreamMetadata(sequelize, DataTypes),
  Payment: Payment(sequelize, DataTypes),
  Transaction: Transaction(sequelize, DataTypes),
  Gift: Gift(sequelize, DataTypes),
  Token: Token(sequelize, DataTypes),
  StreamViewer: StreamViewer(sequelize, DataTypes)
};

// Add models to db object
Object.keys(models).forEach(modelName => {
  db.models[modelName] = models[modelName];
});

// Run associations if they exist
Object.keys(models).forEach(modelName => {
  if (db.models[modelName].associate) {
    db.models[modelName].associate(db.models);
  }
});

module.exports = db;