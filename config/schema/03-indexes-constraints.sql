-- StreamWave Indexes and Constraints
-- This file adds additional indexes and constraints to optimize database performance

-- Add full-text search indexes
ALTER TABLE users ADD FULLTEXT INDEX IF NOT EXISTS ft_users_search (username, displayName, bio);
ALTER TABLE streams ADD FULLTEXT INDEX IF NOT EXISTS ft_streams_search (title, description);
ALTER TABLE chat_messages ADD FULLTEXT INDEX IF NOT EXISTS ft_chat_search (message);

-- Add composite indexes for common queries
-- User activity index
CREATE INDEX IF NOT EXISTS idx_user_activity ON users (role, isActive, lastLogin);

-- Stream discovery index
CREATE INDEX IF NOT EXISTS idx_stream_discovery ON streams (isLive, visibility, category, viewCount);

-- Stream analytics index
CREATE INDEX IF NOT EXISTS idx_stream_analytics ON streams (userId, actualStartTime, endTime, viewCount);

-- Transaction reporting index
CREATE INDEX IF NOT EXISTS idx_transaction_reporting ON transactions (userId, type, status, createdAt);

-- Gift analytics index
CREATE INDEX IF NOT EXISTS idx_gift_analytics ON gift_transactions (senderId, receiverId, streamId, createdAt);

-- Subscription management index
CREATE INDEX IF NOT EXISTS idx_subscription_management ON user_subscriptions (subscriberId, streamerId, status, endDate);

-- Add check constraints
-- Ensure stream duration is positive
ALTER TABLE stream_recordings 
ADD CONSTRAINT IF NOT EXISTS chk_duration_positive CHECK (duration > 0);

-- Ensure clip times are valid
ALTER TABLE stream_clips 
ADD CONSTRAINT IF NOT EXISTS chk_clip_times_valid CHECK (startTime < endTime AND duration > 0);

-- Ensure transaction amounts are positive
ALTER TABLE transactions 
ADD CONSTRAINT IF NOT EXISTS chk_amount_positive CHECK (amount > 0);

-- Ensure gift coins are positive
ALTER TABLE gift_transactions 
ADD CONSTRAINT IF NOT EXISTS chk_coins_positive CHECK (coins > 0);

-- Ensure subscription prices are positive
ALTER TABLE subscription_plans 
ADD CONSTRAINT IF NOT EXISTS chk_price_positive CHECK (price > 0);

-- Add triggers
-- Update user lastActive timestamp when they view a stream
DROP TRIGGER IF EXISTS trg_update_user_activity;
CREATE TRIGGER trg_update_user_activity
AFTER INSERT ON stream_views
FOR EACH ROW
BEGIN
    IF NEW.userId IS NOT NULL THEN
        UPDATE users SET lastLogin = NOW() WHERE id = NEW.userId;
    END IF;
END;

-- Update stream viewCount when a new view is recorded
DROP TRIGGER IF EXISTS trg_update_stream_viewcount;
CREATE TRIGGER trg_update_stream_viewcount
AFTER INSERT ON stream_views
FOR EACH ROW
BEGIN
    UPDATE streams SET viewCount = viewCount + 1 WHERE id = NEW.streamId;
END;

-- Update stream peakViewers when appropriate
DROP TRIGGER IF EXISTS trg_update_stream_peak_viewers;
CREATE TRIGGER trg_update_stream_peak_viewers
AFTER INSERT ON stream_views
FOR EACH ROW
BEGIN
    -- Get current viewer count for this stream
    SET @currentViewers = (
        SELECT COUNT(*) 
        FROM stream_views 
        WHERE streamId = NEW.streamId AND leftAt IS NULL
    );
    
    -- Update peak viewers if current count is higher
    UPDATE streams 
    SET peakViewers = GREATEST(peakViewers, @currentViewers) 
    WHERE id = NEW.streamId;
END; 