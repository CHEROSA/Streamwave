-- StreamWave Additional Schema
-- This file defines additional tables and relationships for the StreamWave platform

-- Subscriptions - Stores subscription plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  billingCycle ENUM('monthly', 'quarterly', 'yearly') DEFAULT 'monthly',
  features JSON,
  isActive BOOLEAN DEFAULT TRUE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- User Subscriptions - Tracks user subscriptions to streamers
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  subscriberId INT NOT NULL,
  streamerId INT NOT NULL,
  planId INT NOT NULL,
  status ENUM('active', 'canceled', 'expired') DEFAULT 'active',
  startDate DATETIME DEFAULT CURRENT_TIMESTAMP,
  endDate DATETIME,
  autoRenew BOOLEAN DEFAULT TRUE,
  stripeSubscriptionId VARCHAR(100),
  lastBillingDate DATETIME,
  nextBillingDate DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriberId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (streamerId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (planId) REFERENCES subscription_plans(id) ON DELETE CASCADE,
  INDEX idx_subscriberId (subscriberId),
  INDEX idx_streamerId (streamerId),
  INDEX idx_status (status)
);

-- Stream Recordings - Stores information about recorded streams
CREATE TABLE IF NOT EXISTS stream_recordings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  streamId INT NOT NULL,
  userId INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  duration INT, -- in seconds
  fileUrl VARCHAR(255) NOT NULL,
  thumbnailUrl VARCHAR(255),
  visibility ENUM('public', 'private', 'subscribers') DEFAULT 'public',
  viewCount INT DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (streamId) REFERENCES streams(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_userId (userId),
  INDEX idx_visibility (visibility)
);

-- Stream Clips - Stores clips created from streams
CREATE TABLE IF NOT EXISTS stream_clips (
  id INT PRIMARY KEY AUTO_INCREMENT,
  streamId INT NOT NULL,
  userId INT NOT NULL, -- user who created the clip
  title VARCHAR(255) NOT NULL,
  description TEXT,
  startTime INT NOT NULL, -- in seconds from stream start
  endTime INT NOT NULL, -- in seconds from stream start
  duration INT NOT NULL, -- in seconds
  fileUrl VARCHAR(255) NOT NULL,
  thumbnailUrl VARCHAR(255),
  viewCount INT DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (streamId) REFERENCES streams(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_streamId (streamId),
  INDEX idx_userId (userId)
);

-- User Notifications - Stores notifications for users
CREATE TABLE IF NOT EXISTS user_notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  type ENUM('follow', 'subscription', 'gift', 'stream_start', 'mention', 'system') NOT NULL,
  message TEXT NOT NULL,
  isRead BOOLEAN DEFAULT FALSE,
  relatedUserId INT,
  relatedStreamId INT,
  relatedTransactionId VARCHAR(100),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (relatedUserId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (relatedStreamId) REFERENCES streams(id) ON DELETE SET NULL,
  INDEX idx_userId (userId),
  INDEX idx_isRead (isRead),
  INDEX idx_createdAt (createdAt)
);

-- Stream Moderators - Stores moderator assignments for streams
CREATE TABLE IF NOT EXISTS stream_moderators (
  id INT PRIMARY KEY AUTO_INCREMENT,
  streamerId INT NOT NULL,
  moderatorId INT NOT NULL,
  permissions JSON,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (streamerId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (moderatorId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_streamer_moderator (streamerId, moderatorId)
);

-- Stream Bans - Stores banned users for streams
CREATE TABLE IF NOT EXISTS stream_bans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  streamerId INT NOT NULL,
  bannedUserId INT NOT NULL,
  reason TEXT,
  expiresAt DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (streamerId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (bannedUserId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_streamer_banned (streamerId, bannedUserId)
);

-- Stream Schedules - Stores scheduled streams
CREATE TABLE IF NOT EXISTS stream_schedules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  categoryId INT,
  scheduledStartTime DATETIME NOT NULL,
  estimatedDuration INT, -- in minutes
  isRecurring BOOLEAN DEFAULT FALSE,
  recurringPattern VARCHAR(50), -- e.g., 'weekly', 'daily', 'monthly'
  recurringDay VARCHAR(20), -- e.g., 'monday', '15' (of month)
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (categoryId) REFERENCES stream_categories(id) ON DELETE SET NULL,
  INDEX idx_userId (userId),
  INDEX idx_scheduledStartTime (scheduledStartTime)
);

-- Insert default subscription plans
INSERT IGNORE INTO subscription_plans (name, description, price, billingCycle, features, isActive) VALUES
('Basic', 'Basic subscription with ad-free viewing', 4.99, 'monthly', '{"adFree": true, "badges": ["subscriber"], "emotes": 5}', 1),
('Premium', 'Premium subscription with additional perks', 9.99, 'monthly', '{"adFree": true, "badges": ["subscriber", "premium"], "emotes": 15, "exclusiveContent": true}', 1),
('Ultimate', 'Ultimate subscription with all benefits', 24.99, 'monthly', '{"adFree": true, "badges": ["subscriber", "premium", "ultimate"], "emotes": 30, "exclusiveContent": true, "prioritySupport": true}', 1); 