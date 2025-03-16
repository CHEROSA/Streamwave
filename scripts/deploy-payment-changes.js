/**
 * Deploy Payment Changes
 * 
 * This script deploys all payment-related changes to the database.
 * It combines initialization of payment tables and adding payment fields to users.
 */
require('dotenv').config();
const db = require('../config/database');
const logger = require('../utils/logger');
const paymentModel = require('../models/payment.model');
const addPaymentFields = require('./add-payment-fields');

async function deployPaymentChanges() {
  try {
    console.log('=== PAYMENT SYSTEM DEPLOYMENT ===');
    console.log('Connecting to database...');
    await db.connectDB();
    
    // Step 1: Initialize the payment schema (creating virtual_gifts table)
    console.log('\nSTEP 1: Initializing payment schema...');
    try {
      await paymentModel.initializeSchema();
      console.log('Payment schema initialized successfully.');
    } catch (error) {
      console.error('Error initializing payment schema:', error.message);
      console.log('Continuing with next steps...');
    }
    
    // Step 2: Add payment fields to users table
    console.log('\nSTEP 2: Adding payment fields to users table...');
    try {
      await addPaymentFields();
      console.log('Payment fields added to users table successfully.');
    } catch (error) {
      console.error('Error adding payment fields to users table:', error.message);
      console.log('Continuing with next steps...');
    }
    
    // Step 3: Ensure we have at least one sample virtual gift
    console.log('\nSTEP 3: Checking for sample virtual gifts...');
    try {
      const existingGifts = await db.query('SELECT COUNT(*) as count FROM virtual_gifts');
      
      if (existingGifts[0].count === 0) {
        console.log('No gifts found, creating sample gifts...');
        
        // Create sample gifts
        const giftData = [
          {
            name: 'Super Star',
            description: 'A sparkling star to show your support',
            price: 5.00,
            iconUrl: '/assets/gifts/star.png',
            coins: 500,
            category: 'basics',
            isActive: true
          },
          {
            name: 'Diamond',
            description: 'Premium gift for your favorite streamer',
            price: 50.00,
            iconUrl: '/assets/gifts/diamond.png',
            coins: 5000,
            category: 'premium',
            isActive: true
          },
          {
            name: 'Heart',
            description: 'Show your love with a heart',
            price: 1.00,
            iconUrl: '/assets/gifts/heart.png',
            coins: 100,
            category: 'basics',
            isActive: true
          }
        ];
        
        for (const gift of giftData) {
          await paymentModel.createGift(gift);
          console.log(`Created gift: ${gift.name}`);
        }
        
        console.log('Sample gifts created successfully.');
      } else {
        console.log(`Found ${existingGifts[0].count} existing gifts, skipping sample gift creation.`);
      }
    } catch (error) {
      console.error('Error creating sample gifts:', error.message);
    }
    
    // Step 4: Validate the changes
    console.log('\nSTEP 4: Validating changes...');
    
    // Check virtual_gifts table
    try {
      const giftColumns = await db.query('DESCRIBE virtual_gifts');
      console.log(`✅ virtual_gifts table exists with ${giftColumns.length} columns`);
    } catch (error) {
      console.error('❌ virtual_gifts table check failed:', error.message);
    }
    
    // Check users payment fields
    try {
      const userColumns = await db.query('DESCRIBE users');
      const paymentFields = ['earningsBalance', 'totalEarnings', 'lastPayoutDate'];
      
      const foundFields = paymentFields.filter(field => 
        userColumns.some(col => col.Field === field)
      );
      
      if (foundFields.length === paymentFields.length) {
        console.log(`✅ All ${paymentFields.length} payment fields exist in users table`);
      } else {
        const missingFields = paymentFields.filter(f => !foundFields.includes(f));
        console.log(`❌ Missing payment fields in users table: ${missingFields.join(', ')}`);
      }
    } catch (error) {
      console.error('❌ Users table check failed:', error.message);
    }
    
    console.log('\n=== DEPLOYMENT COMPLETE ===');
    return true;
  } catch (error) {
    console.error('Error during payment system deployment:', error);
    throw error;
  } finally {
    console.log('\nClosing database connection...');
    await db.closeConnection();
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  deployPaymentChanges()
    .then(() => {
      console.log('Payment system deployment completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Payment system deployment failed:', error);
      process.exit(1);
    });
} else {
  // Export for use in other scripts
  module.exports = deployPaymentChanges;
} 