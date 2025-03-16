/**
 * Script to create stream-related tables in SQLite
 */
require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../database.sqlite'),
  logging: false
});

// Define Stream model
const Stream = sequelize.define('Stream', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  thumbnail: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isPrivate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true
  },
  tags: {
    type: DataTypes.TEXT, // Store as JSON string
    allowNull: true,
    get() {
      const value = this.getDataValue('tags');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('tags', JSON.stringify(value || []));
    }
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'live', 'ended'),
    defaultValue: 'scheduled'
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  rtmpUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  liveKitRoom: {
    type: DataTypes.STRING,
    allowNull: true
  },
  viewCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  likeCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  dislikeCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'Streams',
  timestamps: true,
  paranoid: true
});

// Define StreamViewer model
const StreamViewer = sequelize.define('StreamViewer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  streamId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true // Allow anonymous viewers
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  leftAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true
  },
  userAgent: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'StreamViewers',
  timestamps: true
});

// Define ChatMessage model
const ChatMessage = sequelize.define('ChatMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  streamId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true // Allow anonymous messages
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('text', 'donation', 'system'),
    defaultValue: 'text'
  },
  metadata: {
    type: DataTypes.TEXT, // Store as JSON string
    allowNull: true,
    get() {
      const value = this.getDataValue('metadata');
      return value ? JSON.parse(value) : null;
    },
    set(value) {
      this.setDataValue('metadata', value ? JSON.stringify(value) : null);
    }
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'ChatMessages',
  timestamps: true
});

// Define StreamMetadata model
const StreamMetadata = sequelize.define('StreamMetadata', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  streamId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'live', 'ended'),
    defaultValue: 'scheduled'
  },
  maxViewers: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalViewers: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  duration: {
    type: DataTypes.INTEGER, // Duration in seconds
    defaultValue: 0
  },
  bitrate: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  resolution: {
    type: DataTypes.STRING,
    allowNull: true
  },
  fps: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  codec: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'StreamMetadata',
  timestamps: true
});

// Define relationships
Stream.hasMany(StreamViewer, { foreignKey: 'streamId' });
StreamViewer.belongsTo(Stream, { foreignKey: 'streamId' });

Stream.hasMany(ChatMessage, { foreignKey: 'streamId' });
ChatMessage.belongsTo(Stream, { foreignKey: 'streamId' });

Stream.hasOne(StreamMetadata, { foreignKey: 'streamId' });
StreamMetadata.belongsTo(Stream, { foreignKey: 'streamId' });

// Function to create tables
async function createTables() {
  try {
    // Ensure the data directory exists
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Authenticate database connection
    await sequelize.authenticate();
    console.log('Database connection established successfully');

    // Sync all models with the database
    await sequelize.sync({ force: true });
    console.log('Stream-related tables created successfully');

    // Verify tables were created
    const [results] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    
    console.log(`Created tables: ${results.map(r => r.name).join(', ')}`);
    
    // Create indexes for performance
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_stream_status ON "Streams" (status)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_stream_userId ON "Streams" (userId)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_streamviewer_streamId ON "StreamViewers" (streamId)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_chatmessage_streamId ON "ChatMessages" (streamId)');
    
    console.log('Indexes created successfully');
    
    console.log('All stream tables and indexes created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Failed to create stream tables:', error);
    process.exit(1);
  }
}

// Run the function
createTables();
