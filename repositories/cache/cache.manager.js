/**
 * Cache Manager
 * 
 * Provides caching functionality with advanced caching strategies
 * including LRU eviction, access frequency tracking, and dynamic TTL.
 */
const { Redis } = require('ioredis');
const { safeRedisOperation, isRedisEnabled } = require('../../config/redis.config');
const logger = require('../../utils/logger');
const cacheUtils = require('./cache.utils');

// In-memory cache as fallback when Redis is not available
// Using class properties instead of module-level variables for better testability
let memoryCache = new Map();
let memoryCacheAccessCount = new Map();
let memoryCacheLastAccess = new Map();

// Max size limits for memory cache (for automatic eviction)
const DEFAULT_MAX_ITEMS = 1000;
const DEFAULT_CACHE_TTL = 3600; // 1 hour in seconds

// Cache strategy constants
const CACHE_STRATEGIES = {
  LRU: 'lru',
  MRU: 'mru',
  LFU: 'lfu', // Least Frequently Used
  TTL: 'ttl', // Just rely on TTL expiry
  NONE: 'none' // No automatic eviction
};

/**
 * Cache Manager class
 * Provides methods to get, set, and delete cached data with multiple strategies
 */
class CacheManager {
  constructor(options = {}) {
    this.strategy = process.env.CACHE_STRATEGY || CACHE_STRATEGIES.LRU;
    this.maxItems = parseInt(process.env.CACHE_MAX_ITEMS) || DEFAULT_MAX_ITEMS;
    this.defaultTTL = parseInt(process.env.CACHE_DEFAULT_TTL) || DEFAULT_CACHE_TTL;
    this.entityAccessPatterns = new Map(); // Tracks access patterns by entity type
    
    // Expose memory cache as localCache for tests
    this.localCache = memoryCache;
    
    // Allow injecting a Redis client for testing
    this.redisClient = options.redisClient;
    
    // Only create a Redis client if needed
    if (!this.redisClient && process.env.NODE_ENV !== 'test' && isRedisEnabled()) {
      // Redis Client Initialization
      this.redisClient = new Redis({
        host: 'localhost', // Adjust host and port as needed
        port: 6379,
        password: process.env.REDIS_PASSWORD || '',
        db: 0, // Default DB
      });
      
      this.redisClient.on('connect', () => {
        logger.info('Connected to Redis');
      });

      this.redisClient.on('error', (err) => {
        logger.error(`Redis connection error: ${err.message}`);
      });
    }
    
    // Configure automatic eviction check interval
    this.evictionCheckInterval = setInterval(() => {
      this.runEvictionCheck();
    }, 60000); // Check every minute
    
    logger.info(`Cache Manager initialized with strategy: ${this.strategy}, maxItems: ${this.maxItems}`);
  }

  /**
   * Set a value in the cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache (will be JSON stringified)
   * @param {Object} options - Cache options
   * @param {number} options.ttl - Time to live in seconds
   * @param {string} options.entityType - Entity type for dynamic TTL
   * @returns {Promise<boolean>} - True if value was set
   */
  async set(key, value, options = {}) {
    try {
      const serializedValue = JSON.stringify(value);
      const entityType = options.entityType || this.getEntityTypeFromKey(key);
      const ttl = this.calculateDynamicTTL(options.ttl, entityType);
      
      // Use Redis if enabled
      if (this.redisClient) {
        await safeRedisOperation(
          () => this.redisClient.set(key, serializedValue, 'EX', ttl), // EX sets TTL in seconds
          `cache-set-${key}`
        );
        
        logger.debug(`Cache set: ${key} (Redis, TTL: ${ttl}s)`);
      } else {
        // Fallback to in-memory cache
        memoryCache.set(key, {
          value: serializedValue,
          expiry: ttl ? Date.now() + (ttl * 1000) : null
        });
        
        // Reset access metrics
        memoryCacheAccessCount.set(key, 0);
        memoryCacheLastAccess.set(key, Date.now());
        
        // Check if we need to evict items
        if (memoryCache.size > this.maxItems) {
          this.evictFromMemoryCache();
        }
        
        logger.debug(`Cache set: ${key} (Memory, TTL: ${ttl}s)`);
      }
      
      // Track entity type for this key
      if (entityType) {
        this.trackEntityType(key, entityType);
      }
      
      return true;
    } catch (error) {
      logger.error(`Cache set error for ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get a value from the cache
   * @param {string} key - Cache key
   * @param {Object} options - Options
   * @param {string} options.entityType - Entity type for tracking
   * @returns {Promise<*|null>} - Cached value or null if not found
   */
  async get(key, options = {}) {
    try {
      let serializedValue = null;
      const entityType = options.entityType || this.getEntityTypeFromKey(key);
      
      // Try Redis if enabled
      if (this.redisClient) {
        serializedValue = await safeRedisOperation(
          () => this.redisClient.get(key),
          `cache-get-${key}`
        );
        
        if (serializedValue) {
          logger.debug(`Cache hit: ${key} (Redis)`);
          
          // Track this access
          if (entityType) {
            this.recordCacheHit(entityType);
          }
        } else {
          logger.debug(`Cache miss: ${key} (Redis)`);
          if (entityType) {
            this.recordCacheMiss(entityType);
          }
        }
      } else {
        // Fallback to in-memory cache
        const cachedItem = memoryCache.get(key);
        
        if (cachedItem) {
          // Check if expired
          if (cachedItem.expiry && cachedItem.expiry < Date.now()) {
            // Expired, remove from cache
            memoryCache.delete(key);
            memoryCacheAccessCount.delete(key);
            memoryCacheLastAccess.delete(key);
            logger.debug(`Cache expired: ${key} (Memory)`);
            
            if (entityType) {
              this.recordCacheMiss(entityType, true); // Expired is a type of miss
            }
          } else {
            serializedValue = cachedItem.value;
            logger.debug(`Cache hit: ${key} (Memory)`);
            
            // Update access metrics for eviction strategies
            memoryCacheAccessCount.set(key, (memoryCacheAccessCount.get(key) || 0) + 1);
            memoryCacheLastAccess.set(key, Date.now());
            
            if (entityType) {
              this.recordCacheHit(entityType);
            }
          }
        } else {
          logger.debug(`Cache miss: ${key} (Memory)`);
          if (entityType) {
            this.recordCacheMiss(entityType);
          }
        }
      }
      
      return serializedValue ? JSON.parse(serializedValue) : null;
    } catch (error) {
      logger.error(`Cache get error for ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete a value from the cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - True if value was deleted
   */
  async delete(key) {
    try {
      // Delete from Redis if enabled
      if (this.redisClient) {
        await safeRedisOperation(
          () => this.redisClient.del(key),
          `cache-del-${key}`
        );
        
        logger.debug(`Cache delete: ${key} (Redis)`);
      } else {
        // Fallback to in-memory cache
        memoryCache.delete(key);
        memoryCacheAccessCount.delete(key);
        memoryCacheLastAccess.delete(key);
        logger.debug(`Cache delete: ${key} (Memory)`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Cache delete error for ${key}: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear all cached values for a specific prefix
   * @param {string} prefix - Key prefix to clear
   * @returns {Promise<boolean>} - True if values were deleted
   */
  async clearByPrefix(prefix) {
    try {
      // Clear from Redis if enabled
      if (this.redisClient) {
        const keys = await safeRedisOperation(
          () => this.redisClient.keys(`${prefix}*`),
          `cache-clearPrefix-${prefix}`,
          []
        );
        
        if (keys.length > 0) {
          await safeRedisOperation(
            () => this.redisClient.del(keys),
            `cache-clearPrefix-del-${prefix}`
          );
          
          logger.debug(`Cache cleared ${keys.length} keys with prefix: ${prefix} (Redis)`);
        }
      } else {
        // Fallback to in-memory cache
        let count = 0;
        
        for (const key of memoryCache.keys()) {
          if (key.startsWith(prefix)) {
            memoryCache.delete(key);
            memoryCacheAccessCount.delete(key);
            memoryCacheLastAccess.delete(key);
            count++;
          }
        }
        
        logger.debug(`Cache cleared ${count} keys with prefix: ${prefix} (Memory)`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Cache clear by prefix error for ${prefix}: ${error.message}`);
      return false;
    }
  }

  /**
   * Extract entity type from a cache key
   * @param {string} key - Cache key
   * @returns {string|null} - Entity type or null if not found
   */
  getEntityTypeFromKey(key) {
    // Extract entity type from key format: cache:entityType:id
    const parts = key.split(':');
    return parts.length >= 2 ? parts[1] : null;
  }

  /**
   * Calculate dynamic TTL based on entity type and access patterns
   * @param {number} requestedTTL - Requested TTL in seconds
   * @param {string} entityType - Entity type for dynamic TTL
   * @returns {number} - Calculated TTL in seconds
   * @private
   */
  calculateDynamicTTL(requestedTTL, entityType) {
    // Use requested TTL if provided
    if (requestedTTL) {
      return requestedTTL;
    }
    
    // Use entity-specific TTL if available
    if (entityType && this.entityAccessPatterns.has(entityType)) {
      const pattern = this.entityAccessPatterns.get(entityType);
      
      // If entity is frequently accessed, use longer TTL
      if (pattern.hitRatio > 0.8) {
        return this.defaultTTL * 2; // Double TTL for frequently accessed entities
      }
      
      // If entity is rarely accessed, use shorter TTL
      if (pattern.hitRatio < 0.2) {
        return Math.floor(this.defaultTTL / 2); // Half TTL for rarely accessed entities
      }
    }
    
    // Default TTL
    return this.defaultTTL;
  }

  /**
   * Track entity type for a key
   * @param {string} key - Cache key
   * @param {string} entityType - Entity type
   */
  trackEntityType(key, entityType) {
    if (!this.entityAccessPatterns.has(entityType)) {
      this.entityAccessPatterns.set(entityType, {
        hits: 0,
        misses: 0,
        hitRatio: 0,
        lastAccess: Date.now()
      });
    }
  }

  /**
   * Record a cache hit for an entity type
   * @param {string} entityType - Entity type
   */
  recordCacheHit(entityType) {
    if (this.entityAccessPatterns.has(entityType)) {
      const pattern = this.entityAccessPatterns.get(entityType);
      pattern.hits++;
      pattern.lastAccess = Date.now();
      pattern.hitRatio = pattern.hits / (pattern.hits + pattern.misses);
      this.entityAccessPatterns.set(entityType, pattern);
    }
  }

  /**
   * Record a cache miss for an entity type
   * @param {string} entityType - Entity type
   * @param {boolean} wasExpired - Whether the miss was due to expiration
   */
  recordCacheMiss(entityType, wasExpired = false) {
    if (this.entityAccessPatterns.has(entityType)) {
      const pattern = this.entityAccessPatterns.get(entityType);
      pattern.misses++;
      pattern.lastAccess = Date.now();
      pattern.hitRatio = pattern.hits / (pattern.hits + pattern.misses);
      this.entityAccessPatterns.set(entityType, pattern);
    }
  }

  /**
   * Run eviction check for memory cache
   */
  runEvictionCheck() {
    // Skip if memory cache is under limit
    if (memoryCache.size <= this.maxItems) {
      return;
    }
    
    // Evict items based on strategy
    this.evictFromMemoryCache();
  }
  
  /**
   * Generate a consistent cache key from segments
   * @param {...string} segments - Key segments to join
   * @returns {string} - Generated cache key
   */
  generateKey(...segments) {
    return `cache:${segments.join(':')}`;
  }
  
  /**
   * Creates a deterministic hash for an object
   * @param {Object} obj - Object to hash
   * @returns {string} - Hash string
   */
  createHash(obj) {
    // Create a deterministic string representation of the object
    // by sorting keys and stringifying
    if (typeof obj !== 'object' || obj === null) {
      return String(obj);
    }
    
    const sortedObj = {};
    Object.keys(obj).sort().forEach(key => {
      sortedObj[key] = obj[key];
    });
    
    return JSON.stringify(sortedObj);
  }

  /**
   * Evict items from memory cache based on strategy
   */
  evictFromMemoryCache() {
    // Skip if memory cache is empty
    if (memoryCache.size === 0) {
      return;
    }
    
    // Number of items to evict (20% of max or at least 1)
    const evictCount = Math.max(1, Math.floor(this.maxItems * 0.2));
    
    switch (this.strategy) {
      case CACHE_STRATEGIES.LRU:
        this.evictLRU(evictCount);
        break;
      case CACHE_STRATEGIES.MRU:
        this.evictMRU(evictCount);
        break;
      case CACHE_STRATEGIES.LFU:
        this.evictLFU(evictCount);
        break;
      case CACHE_STRATEGIES.TTL:
        this.evictExpired();
        break;
      case CACHE_STRATEGIES.NONE:
      default:
        // No automatic eviction
        break;
    }
  }

  /**
   * Evict least recently used items
   * @param {number} count - Number of items to evict
   */
  evictLRU(count) {
    // Sort keys by last access time (oldest first)
    const sortedKeys = [...memoryCacheLastAccess.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(entry => entry[0]);
    
    // Evict oldest items
    for (let i = 0; i < Math.min(count, sortedKeys.length); i++) {
      const key = sortedKeys[i];
      memoryCache.delete(key);
      memoryCacheAccessCount.delete(key);
      memoryCacheLastAccess.delete(key);
      logger.debug(`Cache evicted (LRU): ${key}`);
    }
  }

  /**
   * Evict most recently used items
   * @param {number} count - Number of items to evict
   */
  evictMRU(count) {
    // Sort keys by last access time (newest first)
    const sortedKeys = [...memoryCacheLastAccess.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
    
    // Evict newest items
    for (let i = 0; i < Math.min(count, sortedKeys.length); i++) {
      const key = sortedKeys[i];
      memoryCache.delete(key);
      memoryCacheAccessCount.delete(key);
      memoryCacheLastAccess.delete(key);
      logger.debug(`Cache evicted (MRU): ${key}`);
    }
  }

  /**
   * Evict least frequently used items
   * @param {number} count - Number of items to evict
   */
  evictLFU(count) {
    // Sort keys by access count (least first)
    const sortedKeys = [...memoryCacheAccessCount.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(entry => entry[0]);
    
    // Evict least frequently used items
    for (let i = 0; i < Math.min(count, sortedKeys.length); i++) {
      const key = sortedKeys[i];
      memoryCache.delete(key);
      memoryCacheAccessCount.delete(key);
      memoryCacheLastAccess.delete(key);
      logger.debug(`Cache evicted (LFU): ${key}`);
    }
  }

  /**
   * Evict expired items
   */
  evictExpired() {
    const now = Date.now();
    let count = 0;
    
    // Check each item for expiry
    for (const [key, item] of memoryCache.entries()) {
      if (item.expiry && item.expiry < now) {
        memoryCache.delete(key);
        memoryCacheAccessCount.delete(key);
        memoryCacheLastAccess.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      logger.debug(`Cache evicted ${count} expired items`);
    }
  }
}

// Create a singleton instance of the CacheManager
const cacheManager = new CacheManager();

// Export the instance instead of the class
module.exports = cacheManager;
