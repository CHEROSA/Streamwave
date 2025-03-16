/**
 * Chat Message Model
 * 
 * This model defines the structure and behavior of chat messages in the system.
 */

module.exports = (sequelize, DataTypes) => {
  const Chat = sequelize.define('Chat', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    streamId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Streams',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    username: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('text', 'emote', 'gift', 'system', 'moderation'),
      defaultValue: 'text'
    },
    metadata: {
      type: DataTypes.JSON
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isModerated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'chats',
    timestamps: true,
    indexes: [
      {
        fields: ['streamId', 'createdAt']
      },
      {
        fields: ['userId']
      }
    ]
  });

  Chat.associate = (models) => {
    Chat.belongsTo(models.User, {
      foreignKey: 'userId',
      onDelete: 'CASCADE'
    });
    Chat.belongsTo(models.Stream, {
      foreignKey: 'streamId',
      onDelete: 'CASCADE'
    });
  };

  return Chat;
};
