/**
 * Transaction Manager
 * 
 * Provides transaction capabilities for repositories.
 * Allows for atomic operations across multiple repositories and database types.
 */
const { Sequelize } = require('sequelize');
const logger = require('../../utils/logger');

/**
 * Transaction Manager class
 * Manages transactions for different database types
 */
class TransactionManager {
  constructor() {
    this.activeTransactions = new Map();
    this.TRANSACTION_TYPES = {
      MYSQL: 'mysql', // For MySQL database transactions
      MONGODB: 'mongodb', // Legacy - kept for backward compatibility
      SQLITE: 'sqlite', // For SQLite/Sequelize transactions
      MEMORY: 'memory' // For in-memory tracking of operations
    };
  }

  /**
   * Start a new transaction
   * @param {string} type - Transaction type (mysql, sqlite, memory)
   * @param {Object} options - Transaction options
   * @returns {Promise<Object>} - Transaction object
   */
  async startTransaction(type, options = {}) {
    const transactionId = this._generateTransactionId();
    let transaction;

    switch (type) {
      case this.TRANSACTION_TYPES.MONGODB:
        // MongoDB transactions are no longer supported
        throw new Error('MongoDB transactions are no longer supported, use MySQL instead');

      case this.TRANSACTION_TYPES.MYSQL:
        // For MySQL, we need a connection
        if (!options.connection) {
          throw new Error('MySQL connection is required for transactions');
        }
        
        transaction = {
          id: transactionId,
          type,
          connection: options.connection,
          options
        };
        
        // Start MySQL transaction
        await transaction.connection.beginTransaction();
        break;

      case this.TRANSACTION_TYPES.SQLITE:
        // For SQLite/Sequelize, we need a connection
        if (!options.connection) {
          throw new Error('Sequelize connection is required for SQLite transactions');
        }
        
        transaction = {
          id: transactionId,
          type,
          transaction: await options.connection.transaction(options),
          options
        };
        break;

      case this.TRANSACTION_TYPES.MEMORY:
        // Memory transactions are just for tracking changes
        transaction = {
          id: transactionId,
          type,
          changes: [],
          options
        };
        break;

      default:
        throw new Error(`Unsupported transaction type: ${type}`);
    }

    // Store the transaction
    this.activeTransactions.set(transactionId, transaction);
    logger.debug(`Started ${type} transaction: ${transactionId}`);

    return transaction;
  }

  /**
   * Commit a transaction
   * @param {string|Object} transactionOrId - Transaction object or ID
   * @returns {Promise<boolean>} - True if committed successfully
   */
  async commitTransaction(transactionOrId) {
    const transaction = this._getTransaction(transactionOrId);
    
    if (!transaction) {
      logger.warn(`Transaction not found: ${typeof transactionOrId === 'string' ? transactionOrId : transactionOrId.id}`);
      return false;
    }

    try {
      switch (transaction.type) {
        case this.TRANSACTION_TYPES.MONGODB:
          // MongoDB transactions are no longer supported
          throw new Error('MongoDB transactions are no longer supported');

        case this.TRANSACTION_TYPES.MYSQL:
          await transaction.connection.commit();
          break;

        case this.TRANSACTION_TYPES.SQLITE:
          await transaction.transaction.commit();
          break;

        case this.TRANSACTION_TYPES.MEMORY:
          // For memory transactions, we don't need to do anything
          // Changes are tracked but not really "committed"
          break;
      }

      this.activeTransactions.delete(transaction.id);
      logger.debug(`Committed ${transaction.type} transaction: ${transaction.id}`);
      return true;
    } catch (error) {
      logger.error(`Error committing transaction ${transaction.id}: ${error.message}`);
      
      // Try to abort if commit fails
      try {
        await this.abortTransaction(transaction);
      } catch (abortError) {
        logger.error(`Error aborting transaction after failed commit ${transaction.id}: ${abortError.message}`);
      }
      
      throw error;
    }
  }

  /**
   * Abort a transaction
   * @param {string|Object} transactionOrId - Transaction object or ID
   * @returns {Promise<boolean>} - True if aborted successfully
   */
  async abortTransaction(transactionOrId) {
    const transaction = this._getTransaction(transactionOrId);
    
    if (!transaction) {
      logger.warn(`Transaction not found: ${typeof transactionOrId === 'string' ? transactionOrId : transactionOrId.id}`);
      return false;
    }

    try {
      switch (transaction.type) {
        case this.TRANSACTION_TYPES.MONGODB:
          // MongoDB transactions are no longer supported
          throw new Error('MongoDB transactions are no longer supported');

        case this.TRANSACTION_TYPES.MYSQL:
          await transaction.connection.rollback();
          break;

        case this.TRANSACTION_TYPES.SQLITE:
          await transaction.transaction.rollback();
          break;

        case this.TRANSACTION_TYPES.MEMORY:
          // For memory transactions, we don't need to do anything
          break;
      }

      this.activeTransactions.delete(transaction.id);
      logger.debug(`Aborted ${transaction.type} transaction: ${transaction.id}`);
      return true;
    } catch (error) {
      logger.error(`Error aborting transaction ${transaction.id}: ${error.message}`);
      this.activeTransactions.delete(transaction.id);
      throw error;
    }
  }

  /**
   * Record a change in a memory transaction
   * @param {string|Object} transactionOrId - Transaction object or ID
   * @param {string} operation - Operation (create, update, delete)
   * @param {string} entityType - Entity type
   * @param {Object} data - Change data
   */
  recordChange(transactionOrId, operation, entityType, data) {
    const transaction = this._getTransaction(transactionOrId);
    
    if (!transaction || transaction.type !== this.TRANSACTION_TYPES.MEMORY) {
      return;
    }

    transaction.changes.push({
      operation,
      entityType,
      data,
      timestamp: new Date()
    });
    
    logger.debug(`Recorded ${operation} change for ${entityType} in transaction ${transaction.id}`);
  }

  /**
   * Get transaction from ID or object
   * @param {string|Object} transactionOrId - Transaction object or ID
   * @returns {Object|null} - Transaction object or null if not found
   * @private
   */
  _getTransaction(transactionOrId) {
    if (typeof transactionOrId === 'string') {
      return this.activeTransactions.get(transactionOrId);
    }
    
    return this.activeTransactions.get(transactionOrId.id) || transactionOrId;
  }

  /**
   * Generate a unique transaction ID
   * @returns {string} - Transaction ID
   * @private
   */
  _generateTransactionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Execute function within a transaction
   * @param {string} type - Transaction type
   * @param {Function} fn - Function to execute (receives transaction object)
   * @param {Object} options - Transaction options
   * @returns {Promise<*>} - Result of the function
   */
  async withTransaction(type, fn, options = {}) {
    const transaction = await this.startTransaction(type, options);
    
    try {
      const result = await fn(transaction);
      await this.commitTransaction(transaction);
      return result;
    } catch (error) {
      await this.abortTransaction(transaction);
      throw error;
    }
  }
}

// Export a singleton instance
const transactionManager = new TransactionManager();
module.exports = transactionManager; 