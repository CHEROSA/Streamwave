const { Model, DataTypes } = require('sequelize');

class StreamMetadata extends Model {
  static init(sequelize) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      streamId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'streams',
          key: 'id',
        },
      },
      resolution: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      bitrate: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      codec: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      fps: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      audioCodec: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      audioBitrate: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      audioSampleRate: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      audioChannels: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      ingestServer: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      protocol: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      latency: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      settings: {
        type: DataTypes.JSON,
        defaultValue: {},
      },
      stats: {
        type: DataTypes.JSON,
        defaultValue: {},
      },
    }, {
      sequelize,
      modelName: 'StreamMetadata',
      tableName: 'stream_metadata',
      timestamps: true,
      indexes: [
        {
          fields: ['streamId'],
          unique: true,
        },
      ],
    });
  }

  static associate(models) {
    this.belongsTo(models.Stream, {
      foreignKey: 'streamId',
      as: 'stream',
    });
  }

  updateStats(newStats) {
    this.stats = {
      ...this.stats,
      ...newStats,
      lastUpdated: new Date().toISOString(),
    };
  }

  updateSettings(newSettings) {
    this.settings = {
      ...this.settings,
      ...newSettings,
      lastUpdated: new Date().toISOString(),
    };
  }

  getQualityMetrics() {
    return {
      resolution: this.resolution,
      bitrate: this.bitrate,
      fps: this.fps,
      audioBitrate: this.audioBitrate,
      audioSampleRate: this.audioSampleRate,
    };
  }

  getTechnicalDetails() {
    return {
      codec: this.codec,
      audioCodec: this.audioCodec,
      audioChannels: this.audioChannels,
      protocol: this.protocol,
      ingestServer: this.ingestServer,
      latency: this.latency,
    };
  }
}

module.exports = StreamMetadata; 