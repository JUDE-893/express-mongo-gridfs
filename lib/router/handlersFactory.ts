import mongoose from 'mongoose';
import { deleteFiles, getFileAndBuffer, uploadFile, replaceFile, replaceFiles, replaceFilesWithTransaction } from '../core/operations.js';
import { isGridFSReady } from '../core/gridfs.js';
import { Request, Response, RequestHandler } from 'express';

interface CustomRequest extends Request {
    file?: any;
    files?: any;
    user?: any;
    body: any;
    query: any;
    params: any;
}

/**
 * Handles single file uploads and saves metadata.
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @returns {RequestHandler} Express middleware function.
 */
const createFileUploadHandler = (FileModel: mongoose.Model<any>): RequestHandler => {
    return async (req: CustomRequest, res: Response | any) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    error: "No file uploaded",
                    code: "NO_FILE"
                });
            }

            // Check if GridFS is ready
            if (!isGridFSReady()) {
                return res.status(503).json({
                    error: "Storage service is initializing",
                    code: "STORAGE_INITIALIZING"
                });
            }

            try {
                const result = await uploadFile(FileModel, req.file, req.body);

                return res.status(201).json({
                    success: true,
                    fileId: result.fileId,
                    filename: result.filename,
                    contentType: result.contentType,
                    length: result.length,
                    uploadDate: result.uploadDate,
                    metadata: result.metadata
                });

            } catch (uploadError: any) {
                // Map structured helper errors to HTTP responses
                if (uploadError && uploadError.code === 'NO_FILE') {
                    return res.status(400).json({ error: "No file uploaded", code: "NO_FILE" });
                }

                if (uploadError && uploadError.code === 'STORAGE_INITIALIZING') {
                    return res.status(503).json({ error: "Storage service is initializing", code: "STORAGE_INITIALIZING" });
                }

                if (uploadError && uploadError.code === 'UPLOAD_ERROR') {
                    console.error('Failed to upload file:', uploadError);
                    return res.status(500).json({ error: "Failed to upload file", message: uploadError.message, code: "UPLOAD_ERROR" });
                }

                // Unexpected error: rethrow to outer catch
                throw uploadError;
            }

        } catch (error: any) {
            console.error('Upload handler error:', error);
            res.status(500).json({
                error: "Server error during upload",
                message: error.message,
                code: "SERVER_ERROR"
            });
        }
    };
};

/**
 * Handles downloading a file by its ID.
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @returns {RequestHandler} Express middleware function.
 */
const createFileDownloadHandler = (FileModel: mongoose.Model<any>): RequestHandler => {
    return async (req: CustomRequest, res: Response | any) => {
        try {
            const { fileId } = req.params;

            try {
                const { file: fileMetadata, buffer } = await getFileAndBuffer(FileModel, fileId);

                // Set response headers
                res.set({
                    'Content-Type': fileMetadata.contentType,
                    'Content-Disposition': `inline; filename="${encodeURIComponent(fileMetadata.filename)}"`,
                    'Content-Length': fileMetadata.length
                });

                // Send the file
                res.send(buffer);

            } catch (err: any) {
                // Map structured helper errors to HTTP responses
                if (err && err.code === 'INVALID_ID') {
                    return res.status(400).json({
                        error: "Invalid file ID format",
                        code: "INVALID_FILE_ID"
                    });
                }

                if (err && err.code === 'NOT_FOUND') {
                    return res.status(404).json({
                        error: "File not found",
                        code: "FILE_NOT_FOUND"
                    });
                }

                if (err && err.code === 'READ_ERROR') {
                    console.error('Failed to read file chunks:', err);
                    return res.status(500).json({
                        error: "Failed to read file",
                        message: err.message,
                        code: "READ_ERROR"
                    });
                }

                // Unexpected error: rethrow to outer catch
                throw err;
            }

        } catch (error: any) {
            console.error('Download handler error:', error);
            res.status(500).json({
                error: "Server error during download",
                message: error.message,
                code: "SERVER_ERROR"
            });
        }
    };
};

/**
 * Retrieves file metadata by its ID.
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @returns {RequestHandler} Express middleware function.
 */
const createFileInfoHandler = (FileModel: mongoose.Model<any>): RequestHandler => {
    return async (req: CustomRequest, res: Response | any) => {
        try {
            const { fileId } = req.params;

            const fileMetadata = await FileModel.findById(fileId);

            if (!fileMetadata) {
                return res.status(404).json({
                    error: "File not found",
                    code: "FILE_NOT_FOUND"
                });
            }

            res.json({
                success: true,
                file: fileMetadata
            });

        } catch (error: any) {
            console.error('File info error:', error);
            res.status(500).json({
                error: "Failed to get file info",
                message: error.message,
                code: "INFO_ERROR"
            });
        }
    };
};

/**
 * Lists files with pagination and filtering.
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @returns {RequestHandler} Express middleware function.
 */
const createListFilesHandler = (FileModel: mongoose.Model<any>): RequestHandler => {
    return async (req: CustomRequest, res: Response | any) => {
        try {
            const { page = 1, limit = 20, sort = '-uploadDate', ...filters } = req.query;
            const pageNum = Math.max(1, Number(page) || 1);
            const limitNum = Math.max(1, Number(limit) || 20);
            const skip = (pageNum - 1) * limitNum;
            let decoded = '';
            try {
                decoded = filters.filename ? decodeURIComponent(filters.filename as string) : '';
            } catch (err) {
                decoded = filters.filename as string;
            }

            // Build query
            const query: any = {};

            // Add filters
            if (filters.contentType) {
                query.contentType = { $regex: filters.contentType, $options: 'i' };
            }
            if (filters.filename) {
                const escapedFilename = decoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                query.filename = { $regex: new RegExp(escapedFilename, 'i') };
            }
            if (filters.uploadedBy) {
                query.uploadedBy = filters.uploadedBy;
            }
            if (filters.category) {
                query.category = filters.category;
            }
            if (filters.tags) {
                if (typeof filters.tags === 'string') {
                    query.tags = { $in: filters.tags.split(',') };
                } else if (Array.isArray(filters.tags)) {
                    query.tags = { $in: filters.tags };
                }
            }
            if (filters.isPublic !== undefined) {
                query.isPublic = filters.isPublic === 'true';
            }

            // Execute query
            const [files, total] = await Promise.all([
                FileModel.find(query)
                    .sort(sort as string)
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                FileModel.countDocuments(query)
            ]);

            res.json({
                success: true,
                files,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    pages: Math.ceil(total / limitNum)
                }
            });

        } catch (error: any) {
            console.error('List files error:', error);
            res.status(500).json({
                error: "Failed to list files",
                message: error.message,
                code: "LIST_ERROR"
            });
        }
    };
};

/**
 * Replaces an existing file and its metadata with a new one.
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @returns {RequestHandler} Express middleware function.
 */
const createFileUpdateHandler = (FileModel: mongoose.Model<any>): RequestHandler => {
    return async (req: CustomRequest, res: Response | any) => {
        try {
            // Basic validation
            if (!req.file) {
                return res.status(400).json({ error: "No file uploaded", code: "NO_FILE" });
            }

            if (!req.body.id) {
                return res.status(400).json({ error: "File ID is required", code: "MISSING_ID" });
            }

            if (!mongoose.Types.ObjectId.isValid(req.body.id)) {
                return res.status(400).json({ error: "Invalid file ID format", code: "INVALID_ID_FORMAT" });
            }

            try {
                const result = await replaceFile(FileModel, req.body.id, req.file, req.body);

                return res.status(200).json({
                    success: true,
                    message: "File updated successfully",
                    oldFileId: result.oldFileId,
                    newFile: result.newFile,
                    ...(result.warnings ? { warnings: result.warnings } : {})
                });

            } catch (uploadError: any) {
                // Map structured helper errors to HTTP responses
                if (uploadError && uploadError.code === 'INVALID_ID') {
                    return res.status(400).json({ error: "Invalid file ID format", code: "INVALID_ID_FORMAT" });
                }

                if (uploadError && uploadError.code === 'OLD_FILE_NOT_FOUND') {
                    return res.status(404).json({ error: "Old file not found", code: "OLD_FILE_NOT_FOUND" });
                }

                if (uploadError && uploadError.code === 'NO_FILE') {
                    return res.status(400).json({ error: "No file uploaded", code: "NO_FILE" });
                }

                if (uploadError && uploadError.code === 'WRITE_ERROR') {
                    console.error('Failed to upload new file:', uploadError);
                    return res.status(500).json({ error: "Failed to update file", message: uploadError.message, code: "UPDATE_ERROR" });
                }

                // Unexpected error: rethrow to outer catch
                throw uploadError;
            }

        } catch (error: any) {
            console.error('File update handler error:', error);
            res.status(500).json({ error: "Server error during file update", message: error.message, code: "SERVER_ERROR" });
        }
    };
};

/**
 * Handles bulk file uploads, creating or updating files.
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @returns {RequestHandler} Express middleware function.
 */
const createBulkUploadHandler = (FileModel: mongoose.Model<any>): RequestHandler => {
    return async (req: CustomRequest, res: Response | any) => {
        try {
            const filesArray = Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
            if (!filesArray || filesArray.length === 0) {
                return res.status(400).json({
                    error: "No files uploaded",
                    code: "NO_FILES"
                });
            }

            // Delegate bulk replace/create logic to core helper which is auth-agnostic.
            // Any application-level user attribution should be provided in request body
            // or per-file metadata; core helpers won't read req.user.
            const result = await replaceFiles(FileModel, filesArray, req.body);

            const statusCode = (result.errors && result.errors.length > 0) ? 207 : 200;
            return res.status(statusCode).json(result);

        } catch (error: any) {
            console.error('Bulk upload handler error:', error);
            res.status(500).json({
                error: "Server error during bulk upload",
                message: error.message,
                code: "BULK_UPLOAD_ERROR"
            });
        }
    };
};

/**
 * Bulk upload/update within a MongoDB transaction (requires replica set).
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @returns {RequestHandler} Express middleware function.
 */
const createBulkUploadHandlerWithTransaction = (FileModel: mongoose.Model<any>): RequestHandler => {
    return async (req: CustomRequest, res: Response | any) => {
        try {
            const filesArray = Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
            if (!filesArray || filesArray.length === 0) {
                return res.status(400).json({
                    error: "No files uploaded",
                    code: "NO_FILES"
                });
            }

            try {
                const result = await replaceFilesWithTransaction(FileModel, filesArray, req.body);

                const statusCode = (result.errors && result.errors.length > 0) ? 207 : 200;
                return res.status(statusCode).json(result);

            } catch (err: any) {
                console.error('Bulk upload transaction error:', err);
                if (err && err.code === 'INVALID_MODEL') {
                    return res.status(500).json({ error: "Invalid model", code: "INVALID_MODEL" });
                }
                return res.status(500).json({
                    error: "Bulk upload failed",
                    message: err?.message || String(err),
                    code: "TRANSACTION_ERROR"
                });
            }

        } catch (error: any) {
            console.error('Bulk upload handler error:', error);
            res.status(500).json({
                error: "Server error during bulk upload",
                message: error.message,
                code: "BULK_UPLOAD_ERROR"
            });
        }
    };
};

/**
 * Deletes a file and its associated chunks by ID.
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @returns {RequestHandler} Express middleware function.
 */
const createFileDeleteHandler = (FileModel: mongoose.Model<any>): RequestHandler => {
    return async (req: CustomRequest, res: Response | any) => {
        try {
            const { fileId } = req.params;

            // Basic validation: ensure fileId is present and looks like an ObjectId
            if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
                return res.status(400).json({
                    error: "Invalid file ID format",
                    code: "INVALID_FILE_ID"
                });
            }

            // Delegate deletion logic to the core operation which handles
            // both chunk cleanup and metadata removal. This keeps the router
            // auth-agnostic and shifts storage concerns to the helper.
            const response = await deleteFiles(FileModel, fileId);

            const statusCode = (response.errors && response.errors.length > 0) ? 207 : 200;
            return res.status(statusCode).json(response);

        } catch (error: any) {
            console.error('File delete handler error:', error);

            if (error.name === 'CastError') {
                return res.status(400).json({
                    error: "Invalid file ID",
                    message: error.message,
                    code: "INVALID_ID"
                });
            }

            res.status(500).json({
                error: "Server error during file deletion",
                message: error.message,
                code: "DELETE_ERROR"
            });
        }
    };
};

/**
 * Deletes multiple files and their associated chunks by their IDs.
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @returns {RequestHandler} Express middleware function.
 */
const createBatchDeleteHandler = (FileModel: mongoose.Model<any>): RequestHandler => {
    return async (req: CustomRequest, res: Response | any) => {
        try {
            let fileIds = req.body?.fileIds || req.body?.ids || req.params?.fileIds;

            // Support different input formats
            if (!fileIds) {
                return res.status(400).json({
                    error: "No file IDs provided",
                    code: "NO_FILE_IDS"
                });
            }

            // Convert to array if string
            if (typeof fileIds === 'string') {
                fileIds = fileIds.split(',');
            }

            if (!Array.isArray(fileIds)) {
                return res.status(400).json({
                    error: "Invalid file IDs format",
                    code: "INVALID_FORMAT"
                });
            }

            // Validate all file IDs
            const validFileIds: mongoose.Types.ObjectId[] = [];
            const invalidFileIds: string[] = [];

            for (const id of fileIds) {
                if (mongoose.Types.ObjectId.isValid(id)) {
                    validFileIds.push(new mongoose.Types.ObjectId(id));
                } else {
                    invalidFileIds.push(id);
                }
            }

            if (validFileIds.length === 0) {
                return res.status(400).json({
                    error: "No valid file IDs provided",
                    code: "NO_VALID_IDS",
                    invalidFileIds
                });
            }



            // Utilize the core deleteFiles operation which seamlessly handles the deletion of metadata and chunks
            const response = await deleteFiles(FileModel, fileIds);

            // Determine status code: 200 OK or 207 Multi-Status for partial failures
            const statusCode = (response.errors && response.errors.length > 0) ? 207 : 200;
            res.status(statusCode).json(response);

        } catch (error: any) {
            console.error('Batch delete handler error:', error);
            res.status(500).json({
                error: "Server error during batch deletion",
                message: error.message,
                code: "BATCH_DELETE_ERROR"
            });
        }
    };
};

// Update module exports
export {
    createFileUploadHandler,
    createFileDownloadHandler,
    createFileInfoHandler,
    createListFilesHandler,
    createFileUpdateHandler,
    createBulkUploadHandler,
    createBulkUploadHandlerWithTransaction,
    createFileDeleteHandler,
    createBatchDeleteHandler
};

