/**
 * Authentication Configuration
 * 
 * This file contains configuration settings for authentication.
 */

module.exports = {
  // JWT configuration
  jwtSecret: process.env.JWT_SECRET || 'streamwave-jwt-secret-key-for-development',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  
  // Password reset token expiration (in milliseconds)
  passwordResetExpires: 3600000, // 1 hour
  
  // Email verification token expiration (in milliseconds)
  verificationTokenExpires: 86400000, // 24 hours
  
  // Cookie options
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later'
  }
}; 