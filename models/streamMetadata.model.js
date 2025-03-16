/**
 * StreamMetadata Model
 * 
 * This model represents metadata associated with a stream.
 * It stores additional data like analytics, settings, etc.
 */

/**
 * StreamMetadata model definition
 */
module.exports = (sequelize, DataTypes) => {
  const StreamMetadata = sequelize.define('StreamMetadata', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    streamId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    data: {
      type: DataTypes.JSON,
      allowNull: false
    }
  }, {
    timestamps: true,
    tableName: 'stream_metadata',
    indexes: [
      { fields: ['streamId', 'type'] }
    ]
  });

  /**
   * Set up associations
   * @param {Object} models - All models
   */
  StreamMetadata.associate = function(models) {
    StreamMetadata.belongsTo(models.Stream, {
      foreignKey: 'streamId',
      as: 'stream'
    });
  };

  return StreamMetadata;
}; 