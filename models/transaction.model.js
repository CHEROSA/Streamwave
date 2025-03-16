/**
 * Transaction Model
 * 
 * This model defines the structure and behavior of transactions in the system.
 */

module.exports = (sequelize, DataTypes) => {
  const Transaction = sequelize.define('Transaction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    type: {
      type: DataTypes.ENUM('purchase', 'gift', 'withdrawal', 'refund', 'subscription', 'donation'),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    coins: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    paymentMethod: {
      type: DataTypes.ENUM('stripe', 'btcpay', 'coins', 'system'),
      allowNull: false
    },
    paymentId: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    recipientId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    streamId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Stream',
        key: 'id'
      }
    },
    giftId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Gift',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded', 'cancelled'),
      defaultValue: 'pending'
    },
    platformFee: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    platformFeePercentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    },
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: 'USD'
    },
    cryptoAmount: {
      type: DataTypes.DECIMAL(18, 8),
      defaultValue: 0
    },
    exchangeRate: {
      type: DataTypes.DECIMAL(18, 8),
      defaultValue: 0
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'transactions',
    timestamps: true,
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['recipientId']
      },
      {
        fields: ['streamId']
      },
      {
        fields: ['type']
      },
      {
        fields: ['status']
      },
      {
        fields: ['createdAt']
      }
    ]
  });

  Transaction.associate = (models) => {
    Transaction.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE'
    });
    Transaction.belongsTo(models.User, {
      foreignKey: 'recipientId',
      as: 'recipient'
    });
    Transaction.belongsTo(models.Stream, {
      foreignKey: 'streamId'
    });
    Transaction.belongsTo(models.Gift, {
      foreignKey: 'giftId'
    });
  };

  return Transaction;
};
