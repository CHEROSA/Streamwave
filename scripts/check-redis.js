/**
 * Redis Connection Test
 * 
 * This script tests the connection to Redis, which is required for the WebSocket service.
 */
const Redis = require('ioredis');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Default Redis URL
let REDIS_URL = 'redis://localhost:6379';

console.log('🔍 Redis Connection Test');
console.log('------------------------');

// Ask for Redis URL
rl.question(`Enter Redis URL (default: ${REDIS_URL}): `, (answer) => {
  if (answer.trim()) {
    REDIS_URL = answer.trim();
  }
  
  console.log(`\n📡 Attempting to connect to Redis at: ${REDIS_URL}`);
  
  // Create Redis client
  const redis = new Redis(REDIS_URL, {
    connectTimeout: 10000,
    retryStrategy: (times) => {
      if (times > 3) {
        return null; // Stop retrying after 3 attempts
      }
      return Math.min(times * 1000, 3000);
    }
  });
  
  // Connection successful
  redis.on('connect', () => {
    console.log(`\n✅ SUCCESS: Connected to Redis server`);
    
    // Test basic Redis operations
    console.log('\n📤 Testing Redis operations...');
    
    // Set a test key
    redis.set('test:connection', 'success')
      .then(() => redis.get('test:connection'))
      .then((value) => {
        console.log(`Set and Get operation successful: ${value}`);
        return redis.del('test:connection');
      })
      .then(() => {
        console.log('Delete operation successful');
        console.log('\n👍 Redis is working correctly!');
        
        // Quit Redis connection
        redis.quit();
        rl.close();
        process.exit(0);
      })
      .catch((err) => {
        console.error('\n❌ Redis operation error:', err);
        redis.quit();
        rl.close();
        process.exit(1);
      });
  });
  
  // Connection error
  redis.on('error', (error) => {
    console.error('\n❌ REDIS CONNECTION ERROR:');
    console.error(`Message: ${error.message}`);
    console.error('\nPossible causes:');
    console.error('1. Redis server is not running');
    console.error('2. Redis URL is incorrect');
    console.error('3. Redis server is refusing connections');
    console.error('4. Firewall is blocking the connection');
    console.error('\nSolutions:');
    console.error('1. Install and start Redis server:');
    console.error('   - Windows: https://github.com/microsoftarchive/redis/releases');
    console.error('   - Docker: docker run --name redis -p 6379:6379 -d redis');
    console.error('2. Check Redis configuration');
    
    setTimeout(() => {
      redis.quit();
      rl.close();
      process.exit(1);
    }, 1000);
  });
  
  // Set a timeout for the connection attempt
  setTimeout(() => {
    if (redis.status !== 'ready') {
      console.error('\n⏱️ CONNECTION TIMEOUT: Failed to connect to Redis within 10 seconds');
      redis.quit();
      rl.close();
      process.exit(1);
    }
  }, 10000);
});
