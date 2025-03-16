-- StreamWave Stored Procedures
-- This file defines stored procedures for common database operations

-- Get user profile with follower counts
DROP PROCEDURE IF EXISTS sp_get_user_profile;
CREATE PROCEDURE sp_get_user_profile(IN userId INT)
BEGIN
    SELECT 
        u.*,
        (SELECT COUNT(*) FROM user_followers WHERE u.id = user_followers.userId) AS followerCount,
        (SELECT COUNT(*) FROM user_followers WHERE u.id = user_followers.followerId) AS followingCount
    FROM 
        users u
    WHERE 
        u.id = userId;
END;

-- Get active streams with streamer info and viewer counts
DROP PROCEDURE IF EXISTS sp_get_active_streams;
CREATE PROCEDURE sp_get_active_streams(IN categoryId INT, IN limit_count INT, IN offset_count INT)
BEGIN
    SELECT 
        s.*,
        u.username,
        u.displayName,
        u.avatarUrl,
        c.name AS categoryName,
        (SELECT COUNT(*) FROM stream_views WHERE s.id = stream_views.streamId AND stream_views.leftAt IS NULL) AS currentViewers
    FROM 
        streams s
    JOIN 
        users u ON s.userId = u.id
    LEFT JOIN 
        stream_categories c ON s.categoryId = c.id
    WHERE 
        s.isLive = TRUE
        AND s.visibility = 'public'
        AND (categoryId IS NULL OR s.categoryId = categoryId)
    ORDER BY 
        currentViewers DESC
    LIMIT 
        offset_count, limit_count;
END;

-- Get user's followed streams that are currently live
DROP PROCEDURE IF EXISTS sp_get_followed_live_streams;
CREATE PROCEDURE sp_get_followed_live_streams(IN userId INT)
BEGIN
    SELECT 
        s.*,
        u.username,
        u.displayName,
        u.avatarUrl
    FROM 
        streams s
    JOIN 
        users u ON s.userId = u.id
    JOIN 
        user_followers f ON s.userId = f.userId
    WHERE 
        f.followerId = userId
        AND s.isLive = TRUE
        AND s.visibility = 'public'
    ORDER BY 
        s.startedAt DESC;
END;

-- Get stream analytics for a specific stream
DROP PROCEDURE IF EXISTS sp_get_stream_analytics;
CREATE PROCEDURE sp_get_stream_analytics(IN streamId INT)
BEGIN
    SELECT 
        s.*,
        u.username,
        u.displayName,
        (SELECT COUNT(*) FROM stream_views WHERE s.id = stream_views.streamId) AS totalViews,
        (SELECT COUNT(DISTINCT userId) FROM stream_views WHERE s.id = stream_views.streamId AND userId IS NOT NULL) AS uniqueViewers,
        (SELECT COUNT(*) FROM chat_messages WHERE s.id = chat_messages.streamId) AS messageCount,
        (SELECT SUM(coins) FROM gift_transactions WHERE s.id = gift_transactions.streamId) AS totalCoins
    FROM 
        streams s
    JOIN 
        users u ON s.userId = u.id
    WHERE 
        s.id = streamId;
END;

-- Get user's earnings for a specific period
DROP PROCEDURE IF EXISTS sp_get_user_earnings;
CREATE PROCEDURE sp_get_user_earnings(IN userId INT, IN startDate DATE, IN endDate DATE)
BEGIN
    SELECT 
        DATE(gt.createdAt) AS date,
        SUM(gt.coins) AS totalCoins,
        COUNT(*) AS giftCount
    FROM 
        gift_transactions gt
    WHERE 
        gt.receiverId = userId
        AND gt.createdAt BETWEEN startDate AND endDate
    GROUP BY 
        DATE(gt.createdAt)
    ORDER BY 
        date;
END;

-- Get user's subscription status to a streamer
DROP PROCEDURE IF EXISTS sp_get_subscription_status;
CREATE PROCEDURE sp_get_subscription_status(IN subscriberId INT, IN streamerId INT)
BEGIN
    SELECT 
        us.*,
        sp.name AS planName,
        sp.price,
        sp.features
    FROM 
        user_subscriptions us
    JOIN 
        subscription_plans sp ON us.planId = sp.id
    WHERE 
        us.subscriberId = subscriberId
        AND us.streamerId = streamerId
        AND us.status = 'active'
        AND (us.endDate IS NULL OR us.endDate > NOW());
END;

-- Search streams by title or description
DROP PROCEDURE IF EXISTS sp_search_streams;
CREATE PROCEDURE sp_search_streams(IN searchTerm VARCHAR(255), IN limit_count INT)
BEGIN
    SELECT 
        s.*,
        u.username,
        u.displayName,
        u.avatarUrl
    FROM 
        streams s
    JOIN 
        users u ON s.userId = u.id
    WHERE 
        MATCH(s.title, s.description) AGAINST(searchTerm IN NATURAL LANGUAGE MODE)
        OR s.title LIKE CONCAT('%', searchTerm, '%')
        OR s.description LIKE CONCAT('%', searchTerm, '%')
    ORDER BY 
        s.isLive DESC,
        s.viewCount DESC
    LIMIT 
        limit_count;
END;

-- Search users by username, displayName, or bio
DROP PROCEDURE IF EXISTS sp_search_users;
CREATE PROCEDURE sp_search_users(IN searchTerm VARCHAR(255), IN limit_count INT)
BEGIN
    SELECT 
        u.*,
        (SELECT COUNT(*) FROM user_followers WHERE u.id = user_followers.userId) AS followerCount
    FROM 
        users u
    WHERE 
        MATCH(u.username, u.displayName, u.bio) AGAINST(searchTerm IN NATURAL LANGUAGE MODE)
        OR u.username LIKE CONCAT('%', searchTerm, '%')
        OR u.displayName LIKE CONCAT('%', searchTerm, '%')
        OR u.bio LIKE CONCAT('%', searchTerm, '%')
    ORDER BY 
        u.isStreamer DESC,
        followerCount DESC
    LIMIT 
        limit_count;
END;

-- Get recent chat messages for a stream
DROP PROCEDURE IF EXISTS sp_get_recent_chat_messages;
CREATE PROCEDURE sp_get_recent_chat_messages(IN streamId INT, IN limit_count INT)
BEGIN
    SELECT 
        cm.*,
        u.username,
        u.displayName,
        u.avatarUrl,
        u.role
    FROM 
        chat_messages cm
    LEFT JOIN 
        users u ON cm.userId = u.id
    WHERE 
        cm.streamId = streamId
        AND cm.isDeleted = FALSE
    ORDER BY 
        cm.createdAt DESC
    LIMIT 
        limit_count;
END; 