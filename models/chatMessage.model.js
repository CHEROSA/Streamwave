/**
 * ChatMessage Model
 * 
 * This model represents a chat message in a stream.
 */

/**
 * ChatMessage model definition
 */
module.exports = (sequelize, DataTypes) => {
  const ChatMessage = sequelize.define('ChatMessage', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    streamId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Stream',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('text', 'emote', 'system'),
      defaultValue: 'text'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    deletedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'User',
        key: 'id'
      }
    }
  }, {
    timestamps: true,
    tableName: 'chat_messages',
    indexes: [
      { fields: ['streamId'] },
      { fields: ['userId'] },
      { fields: ['createdAt'] }
    ]
  });

  /**
   * Set up associations
   * @param {Object} models - All models
   */
  ChatMessage.associate = function(models) {
    ChatMessage.belongsTo(models.Stream, {
      foreignKey: 'streamId',
      as: 'stream'
    });

    ChatMessage.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });

    ChatMessage.belongsTo(models.User, {
      foreignKey: 'deletedBy',
      as: 'deletedByUser'
    });
  };

  return ChatMessage;
}; 