/**
 * Diagnostic script to help identify server startup issues
 * Run with: node src/scripts/diagnose.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

// Create a data directory if it doesn't exist
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function checkSQLite() {
  console.log('\n----- SQLite Check -----');
  try {
    const sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: path.join(dataDir, 'streamwave.sqlite'),
      logging: false
    });

    await sequelize.authenticate();
    console.log('✅ SQLite connection successful');
    
    // Create a test table
    const Test = sequelize.define('Test', {
      name: Sequelize.STRING
    });
    
    await sequelize.sync({ force: true });
    await Test.create({ name: 'test' });
    const count = await Test.count();
    console.log(`✅ SQLite test table created and record inserted (count: ${count})`);
    
    return true;
  } catch (error) {
    console.error('❌ SQLite error:', error.message);
    return false;
  }
}

async function checkMongoDB() {
  console.log('\n----- MongoDB Check -----');
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://svipliveofficial:rxcM36aDfEVaSquy@cluster0.7v7nf.mongodb.net/streamwave?retryWrites=true&w=majority');
    console.log('✅ MongoDB connection successful');
    
    // Create a test collection and document
    const Test = mongoose.model('Test', new mongoose.Schema({ name: String }));
    await Test.deleteMany({});
    await Test.create({ name: 'test' });
    const count = await Test.countDocuments();
    console.log(`✅ MongoDB test collection created and document inserted (count: ${count})`);
    
    await mongoose.disconnect();
    return true;
  } catch (error) {
    console.error('❌ MongoDB error:', error.message);
    return false;
  }
}

async function checkImports() {
  console.log('\n----- Import Check -----');
  try {
    // Check critical imports
    const importChecks = [
      { name: 'express', path: 'express' },
      { name: 'sequelize', path: 'sequelize' },
      { name: 'mongoose', path: 'mongoose' },
      { name: 'ioredis', path: 'ioredis' },
      { name: 'socket.io', path: 'socket.io' },
      { name: 'jsonwebtoken', path: 'jsonwebtoken' },
      { name: 'bcryptjs', path: 'bcryptjs' },
      { name: 'stripe', path: 'stripe' }
    ];
    
    for (const check of importChecks) {
      try {
        require(check.path);
        console.log(`✅ ${check.name} imported successfully`);
      } catch (error) {
        console.error(`❌ ${check.name} import failed:`, error.message);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Import check error:', error.message);
    return false;
  }
}

async function checkFiles() {
  console.log('\n----- File Check -----');
  const criticalFiles = [
    { path: 'src/index.js', name: 'Main server file' },
    { path: 'src/config/database.js', name: 'Database configuration' },
    { path: 'src/config/redis.js', name: 'Redis configuration' },
    { path: 'src/routes/index.js', name: 'Routes index' },
    { path: 'src/controllers/payment.controller.js', name: 'Payment controller' },
    { path: 'src/services/btcpay.js', name: 'BTCPay service' },
    { path: 'src/services/stripe.js', name: 'Stripe service' }
  ];
  
  for (const file of criticalFiles) {
    const filePath = path.join(__dirname, '../../', file.path);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file.name} exists: ${file.path}`);
    } else {
      console.error(`❌ ${file.name} missing: ${file.path}`);
    }
  }
}

async function main() {
  console.log('StreamWave Backend Diagnostic Tool');
  console.log('=================================');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Node Version: ${process.version}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  await checkImports();
  await checkFiles();
  await checkSQLite();
  await checkMongoDB();
  
  console.log('\n----- Diagnostic Complete -----');
}

main().catch(console.error);
