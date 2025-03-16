const { Model, DataTypes } = require('sequelize');
const { StreamState } = require('../constants/stream.states');

class Stream extends Model {
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
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      thumbnailUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      state: {
        type: DataTypes.ENUM(...Object.values(StreamState)),
        defaultValue: StreamState.NEW,
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      viewerCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      maxViewerCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      totalViews: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      earnings: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      isPrivate: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      allowedUsers: {
        type: DataTypes.JSON,
        defaultValue: [],
      },
      tags: {
        type: DataTypes.JSON,
        defaultValue: [],
      },
      category: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      language: {
        type: DataTypes.STRING,
        defaultValue: 'en',
      },
      quality: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      recordingUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      chatEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      moderators: {
        type: DataTypes.JSON,
        defaultValue: [],
      },
      bannedUsers: {
        type: DataTypes.JSON,
        defaultValue: [],
      },
    }, {
      sequelize,
      modelName: 'Stream',
      tableName: 'streams',
      timestamps: true,
      indexes: [
        {
          fields: ['userId'],
        },
        {
          fields: ['state'],
        },
        {
          fields: ['startTime'],
        },
      ],
    });
  }

  static associate(models) {
    this.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'streamer',
    });
    this.hasMany(models.ChatMessage, {
      foreignKey: 'streamId',
      as: 'messages',
    });
    this.hasOne(models.StreamMetadata, {
      foreignKey: 'streamId',
      as: 'metadata',
    });
  }

  updateViewerCount(count) {
    this.viewerCount = count;
    if (count > this.maxViewerCount) {
      this.maxViewerCount = count;
    }
  }

  addEarnings(amount) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    this.earnings += amount;
  }

  calculateDuration() {
    if (this.startTime && this.endTime) {
      this.duration = Math.floor((this.endTime - this.startTime) / 1000);
    }
    return this.duration;
  }

  addModerator(userId) {
    if (!this.moderators.includes(userId)) {
      this.moderators = [...this.moderators, userId];
    }
  }

  removeModerator(userId) {
    this.moderators = this.moderators.filter(id => id !== userId);
  }

  banUser(userId) {
    if (!this.bannedUsers.includes(userId)) {
      this.bannedUsers = [...this.bannedUsers, userId];
    }
  }

  unbanUser(userId) {
    this.bannedUsers = this.bannedUsers.filter(id => id !== userId);
  }

  isUserBanned(userId) {
    return this.bannedUsers.includes(userId);
  }

  isUserModerator(userId) {
    return this.moderators.includes(userId);
  }

  addAllowedUser(userId) {
    if (!this.allowedUsers.includes(userId)) {
      this.allowedUsers = [...this.allowedUsers, userId];
    }
  }

  removeAllowedUser(userId) {
    this.allowedUsers = this.allowedUsers.filter(id => id !== userId);
  }

  isUserAllowed(userId) {
    return !this.isPrivate || this.allowedUsers.includes(userId);
  }

  addTag(tag) {
    if (!this.tags.includes(tag)) {
      this.tags = [...this.tags, tag];
    }
  }

  removeTag(tag) {
    this.tags = this.tags.filter(t => t !== tag);
  }
}

module.exports = Stream; 