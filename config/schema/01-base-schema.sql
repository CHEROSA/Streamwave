-- StreamWave Database Schema
-- This file defines the basic database structure for the StreamWave platform

-- Enable foreign key constraints
SET FOREIGN_KEY_CHECKS = 1;

-- Users Table - Stores user account information
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  displayName VARCHAR(100),
  bio TEXT,
  avatarUrl VARCHAR(255),
  bannerUrl VARCHAR(255),
  isVerified BOOLEAN DEFAULT FALSE,
  isStreamer BOOLEAN DEFAULT FALSE,
  role ENUM('user', 'moderator', 'admin') DEFAULT 'user',
  streamKey VARCHAR(100) UNIQUE,
  stripeCustomerId VARCHAR(100),
  stripeConnectId VARCHAR(100),
  stripeConnectVerified BOOLEAN DEFAULT FALSE,
  btcpayStoreId VARCHAR(100),
  walletCoins INT DEFAULT 0,
  walletLastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
  earningsTotal DECIMAL(10, 2) DEFAULT 0.00,
  earningsAvailable DECIMAL(10, 2) DEFAULT 0.00,
  earningsPending DECIMAL(10, 2) DEFAULT 0.00,
  lastPayoutDate DATETIME,
  twoFactorEnabled BOOLEAN DEFAULT FALSE,
  twoFactorSecret VARCHAR(255),
  resetPasswordToken VARCHAR(255),
  resetPasswordExpires DATETIME,
  verificationToken VARCHAR(255),
  verificationExpires DATETIME,
  accountStatus ENUM('active', 'suspended', 'banned') DEFAULT 'active',
  lastLogin DATETIME,
  lastActive DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_isStreamer (isStreamer),
  INDEX idx_accountStatus (accountStatus)
);

-- User Settings - Stores user preferences and settings
CREATE TABLE IF NOT EXISTS user_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  emailNotifications BOOLEAN DEFAULT TRUE,
  pushNotifications BOOLEAN DEFAULT TRUE,
  showOnlineStatus BOOLEAN DEFAULT TRUE,
  allowDirectMessages BOOLEAN DEFAULT TRUE,
  contentMaturity ENUM('mild', 'moderate', 'mature') DEFAULT 'moderate',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_settings (userId)
);

-- User Social Links - Stores social media links for users
CREATE TABLE IF NOT EXISTS user_social_links (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  platform VARCHAR(50) NOT NULL,
  url VARCHAR(255) NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_platform (userId, platform)
);

-- User Followers - Stores follower relationships between users
CREATE TABLE IF NOT EXISTS user_followers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  followerId INT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (followerId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_follower_relationship (userId, followerId)
);

-- Stream Categories - Defines available categories for streams
CREATE TABLE IF NOT EXISTS stream_categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  imageUrl VARCHAR(255),
  isActive BOOLEAN DEFAULT TRUE,
  sortOrder INT DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Streams - Stores live stream metadata
CREATE TABLE IF NOT EXISTS streams (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  thumbnailUrl VARCHAR(255),
  categoryId INT,
  isLive BOOLEAN DEFAULT FALSE,
  startedAt DATETIME,
  endedAt DATETIME,
  viewCount INT DEFAULT 0,
  peakViewers INT DEFAULT 0,
  recordingUrl VARCHAR(255),
  visibility ENUM('public', 'private', 'unlisted') DEFAULT 'public',
  matureContent BOOLEAN DEFAULT FALSE,
  roomName VARCHAR(100) UNIQUE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (categoryId) REFERENCES stream_categories(id) ON DELETE SET NULL,
  INDEX idx_userId (userId),
  INDEX idx_isLive (isLive),
  INDEX idx_categoryId (categoryId)
);

-- Stream Tags - Defines tags assigned to streams
CREATE TABLE IF NOT EXISTS stream_tags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  streamId INT NOT NULL,
  tag VARCHAR(50) NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (streamId) REFERENCES streams(id) ON DELETE CASCADE,
  UNIQUE KEY unique_stream_tag (streamId, tag)
);

-- Stream Views - Tracks viewer activity on streams
CREATE TABLE IF NOT EXISTS stream_views (
  id INT PRIMARY KEY AUTO_INCREMENT,
  streamId INT NOT NULL,
  userId INT,
  ipAddress VARCHAR(45),
  viewDuration INT DEFAULT 0, -- in seconds
  joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  leftAt DATETIME,
  FOREIGN KEY (streamId) REFERENCES streams(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_streamId (streamId),
  INDEX idx_userId (userId)
);

-- Chat Messages - Stores chat messages for streams
CREATE TABLE IF NOT EXISTS chat_messages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  streamId INT NOT NULL,
  userId INT,
  username VARCHAR(50),
  message TEXT NOT NULL,
  messageType ENUM('text', 'gift', 'system', 'sticker', 'emoji') DEFAULT 'text',
  isDeleted BOOLEAN DEFAULT FALSE,
  isModerated BOOLEAN DEFAULT FALSE,
  moderationReason VARCHAR(255),
  moderatedBy INT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (streamId) REFERENCES streams(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (moderatedBy) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_streamId (streamId),
  INDEX idx_userId (userId),
  INDEX idx_createdAt (createdAt)
);

-- Tokens - Stores authentication tokens
CREATE TABLE IF NOT EXISTS tokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  tokenType ENUM('access', 'refresh', 'verification', 'password-reset') NOT NULL,
  token VARCHAR(255) NOT NULL,
  expiresAt DATETIME NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_token (userId, tokenType, token),
  INDEX idx_token (token),
  INDEX idx_expiresAt (expiresAt)
);

-- Transactions - Stores financial transactions
CREATE TABLE IF NOT EXISTS transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  transactionId VARCHAR(100) UNIQUE NOT NULL,
  userId INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  type ENUM('purchase', 'gift', 'subscription', 'withdrawal', 'refund') NOT NULL,
  status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
  paymentMethod VARCHAR(50),
  paymentProcessorId VARCHAR(100),
  metadata JSON,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_userId (userId),
  INDEX idx_type (type),
  INDEX idx_status (status),
  INDEX idx_createdAt (createdAt)
);

-- Gifts - Stores gift data
CREATE TABLE IF NOT EXISTS gifts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  iconUrl VARCHAR(255),
  price INT NOT NULL, -- in coins
  coins INT NOT NULL,
  isActive BOOLEAN DEFAULT TRUE,
  sortOrder INT DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Gift Transactions - Records gift purchases and sends
CREATE TABLE IF NOT EXISTS gift_transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  transactionId VARCHAR(100),
  giftId INT NOT NULL,
  senderId INT NOT NULL,
  receiverId INT NOT NULL,
  streamId INT,
  coins INT NOT NULL,
  message VARCHAR(255),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (giftId) REFERENCES gifts(id) ON DELETE CASCADE,
  FOREIGN KEY (senderId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiverId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (streamId) REFERENCES streams(id) ON DELETE SET NULL,
  INDEX idx_senderId (senderId),
  INDEX idx_receiverId (receiverId),
  INDEX idx_streamId (streamId)
);

-- Insert default stream categories
INSERT IGNORE INTO stream_categories (name, description, isActive, sortOrder) VALUES
('Gaming', 'Video game streams and playthroughs', 1, 10),
('Just Chatting', 'Conversations, talk shows, and general discussions', 1, 20),
('Music & Performance', 'Live music, singing, and artistic performances', 1, 30),
('IRL', 'Real-life adventures, travel, and outdoor activities', 1, 40),
('Creative', 'Art, crafting, design, and other creative activities', 1, 50),
('Education', 'Tutorials, courses, and educational content', 1, 60),
('Sports', 'Sports commentary, fitness, and athletic activities', 1, 70),
('Cooking', 'Food preparation, recipes, and culinary arts', 1, 80);

-- Insert default gift types
INSERT IGNORE INTO gifts (name, description, iconUrl, price, coins, isActive, sortOrder) VALUES
('Heart', 'A simple heart to show some love', '/images/gifts/heart.png', 5, 50, 1, 10),
('Star', 'A shining star for awesome streams', '/images/gifts/star.png', 10, 100, 1, 20),
('Diamond', 'A sparkling diamond for exceptional streamers', '/images/gifts/diamond.png', 50, 500, 1, 30),
('Crown', 'A royal crown for the streaming royalty', '/images/gifts/crown.png', 100, 1000, 1, 40),
('Rocket', 'A rocket ship to boost your favorite streamer', '/images/gifts/rocket.png', 200, 2000, 1, 50),
('Trophy', 'A prestigious trophy for champions', '/images/gifts/trophy.png', 500, 5000, 1, 60),
('Island', 'An entire private island!', '/images/gifts/island.png', 1000, 10000, 1, 70); 