/**
 * StreamViewer Model
 * 
 * This model represents a viewer of a stream.
 * It tracks when users join and leave streams.
 */

/**
 * StreamViewer model definition
 */
module.exports = (sequelize, DataTypes) => {
  const StreamViewer = sequelize.define('StreamViewer', {
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
    joinTime: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    leaveTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    duration: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    lastActive: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    timestamps: true,
    tableName: 'stream_viewers',
    indexes: [
      { fields: ['streamId', 'userId'] }
    ]
  });

  /**
   * Set up associations
   * @param {Object} models - All models
   */
  StreamViewer.associate = function(models) {
    StreamViewer.belongsTo(models.Stream, {
      foreignKey: 'streamId',
      as: 'stream'
    });

    StreamViewer.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return StreamViewer;
}; 