/**
 * Uploads Routes
 * 
 * Endpoints for handling file uploads and storing them on the local filesystem.
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const config = require('../config');
const { storageService, MEDIA_TYPES } = require('../services/storage-factory');

// Initialize multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 
      'video/mp4', 'video/webm', 'application/octet-stream'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(`File type not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`, 400), false);
    }
  }
});

/**
 * @route   POST /api/uploads
 * @desc    Upload a file to the server
 * @access  Private
 */
router.post('/', protect, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ApiError('No file uploaded', 400);
    }
    
    const { type } = req.body;
    
    if (!type) {
      throw new ApiError('File type is required', 400);
    }
    
    // Map frontend type to storage media type
    let mediaType;
    switch (type) {
      case 'avatar':
        mediaType = MEDIA_TYPES.AVATAR;
        break;
      case 'thumbnail':
        mediaType = MEDIA_TYPES.THUMBNAIL;
        break;
      case 'recording':
        mediaType = MEDIA_TYPES.RECORDING;
        break;
      default:
        mediaType = MEDIA_TYPES.UPLOAD;
    }
    
    // Verify storage service is available
    if (!storageService || typeof storageService.uploadFile !== 'function') {
      logger.error('Storage service is not properly initialized for file upload', {
        service: "streamwave-api"
      });
      throw new ApiError('Storage service unavailable', 500);
    }
    
    // Upload file using storage service with detailed error handling
    let result;
    try {
      result = await storageService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        mediaType,
        req.user.id,
        req.file.mimetype
      );
    } catch (uploadError) {
      logger.error(`File upload failed: ${uploadError.message}`, {
        stack: uploadError.stack,
        userId: req.user.id,
        fileType: type,
        fileName: req.file.originalname,
        service: "streamwave-api"
      });
      throw new ApiError(`File upload failed: ${uploadError.message}`, 500);
    }
    
    if (!result || !result.path || !result.url) {
      logger.error('Storage service returned invalid result', {
        result,
        userId: req.user.id,
        service: "streamwave-api"
      });
      throw new ApiError('Invalid storage result', 500);
    }
    
    logger.info(`File uploaded: ${result.path}`);
    
    res.status(201).json({
      success: true,
      path: result.path,
      url: result.url
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/uploads/:path
 * @desc    Delete a file
 * @access  Private
 */
router.delete('/:path', protect, async (req, res, next) => {
  try {
    const filePath = req.params.path;
    
    if (!filePath) {
      throw new ApiError('File path is required', 400);
    }
    
    // Additional security check to ensure user is only deleting their own files
    if (!filePath.includes(`/${req.user.id}/`)) {
      throw new ApiError('Unauthorized to delete this file', 403);
    }
    
    // Verify storage service is available
    if (!storageService || typeof storageService.deleteFile !== 'function') {
      logger.error('Storage service is not properly initialized for file deletion', {
        service: "streamwave-api"
      });
      throw new ApiError('Storage service unavailable', 500);
    }
    
    // Delete file with detailed error handling
    let success;
    try {
      success = await storageService.deleteFile(filePath);
    } catch (deleteError) {
      logger.error(`File deletion failed: ${deleteError.message}`, {
        stack: deleteError.stack,
        userId: req.user.id,
        filePath,
        service: "streamwave-api"
      });
      throw new ApiError(`File deletion failed: ${deleteError.message}`, 500);
    }
    
    if (!success) {
      throw new ApiError('File not found or could not be deleted', 404);
    }
    
    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });
    
  } catch (error) {
    next(error);
  }
});

module.exports = router; 