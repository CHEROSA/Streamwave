const { Model, DataTypes } = require('sequelize');

class ChatMessage extends Model {
  static init(sequelize) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      streamId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'streams',
          key: 'id',
        },
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM('text', 'emote', 'system', 'donation'),
        defaultValue: 'text',
      },
      metadata: {
        type: DataTypes.JSON,
        defaultValue: {},
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      deletedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      isModerated: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      moderatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      moderatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      moderationReason: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    }, {
      sequelize,
      modelName: 'ChatMessage',
      tableName: 'chat_messages',
      timestamps: true,
      indexes: [
        {
          fields: ['userId'],
        },
        {
          fields: ['streamId'],
        },
        {
          fields: ['type'],
        },
        {
          fields: ['createdAt'],
        },
      ],
    });
  }

  static associate(models) {
    this.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });
    this.belongsTo(models.Stream, {
      foreignKey: 'streamId',
      as: 'stream',
    });
    this.belongsTo(models.User, {
      foreignKey: 'deletedBy',
      as: 'deletedByUser',
    });
    this.belongsTo(models.User, {
      foreignKey: 'moderatedBy',
      as: 'moderatedByUser',
    });
  }

  softDelete(userId) {
    this.isDeleted = true;
    this.deletedBy = userId;
    this.deletedAt = new Date();
  }

  moderate(userId, reason) {
    this.isModerated = true;
    this.moderatedBy = userId;
    this.moderatedAt = new Date();
    this.moderationReason = reason;
  }

  isDonation() {
    return this.type === 'donation';
  }

  isSystem() {
    return this.type === 'system';
  }

  isEmote() {
    return this.type === 'emote';
  }

  isText() {
    return this.type === 'text';
  }

  toJSON() {
    const values = { ...this.get() };
    if (this.isDeleted) {
      values.content = '[Message deleted]';
    }
    if (this.isModerated) {
      values.content = '[Message moderated]';
    }
    return values;
  }
}

module.exports = ChatMessage; 