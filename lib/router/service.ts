import mongoose from 'mongoose';
import { writeChunks, readChunks, deleteChunks, chunksExist } from '@/lib/core/gridfsChunk';
import { deleteFiles, getFileAndBuffer, updateFile } from '@/lib/core/operations';
import { Request, Response, RequestHandler } from 'express';

interface CustomRequest extends Request {
    file?: any;
    files?: any;
    user?: any;
    body: any;
    query: any;
    params: any;
}
import { isGridFSReady } from '../core/gridfs.js';
import { pickModelFields, getTopLevelSchemaKeys } from '@/lib/core/schemaUtils';

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
                const result = await updateFile(FileModel, req.file, req.body);

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
            console.log("🚀 ~ createListFilesHandler ~ decoded:", decoded)

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
            // Validate input
            if (!req.file) {
                return res.status(400).json({
                    error: "No file uploaded",
                    code: "NO_FILE"
                });
            }

            if (!req.body.id) {
                return res.status(400).json({
                    error: "File ID is required",
                    code: "MISSING_ID"
                });
            }

            // Validate file ID format
            if (!mongoose.Types.ObjectId.isValid(req.body.id)) {
                return res.status(400).json({
                    error: "Invalid file ID format",
                    code: "INVALID_ID_FORMAT"
                });
            }

            const oldFileId = new mongoose.Types.ObjectId(req.body.id);

            // Check if old file exists in our custom metadata collection
            const oldFileMetadata = await FileModel.findById(oldFileId);

            if (!oldFileMetadata) {
                return res.status(404).json({
                    error: "Old file not found",
                    code: "OLD_FILE_NOT_FOUND"
                });
            }

            // Check if chunks exist for the old file
            const oldChunksExist = await chunksExist(oldFileId.toString());

            // Generate new file ID (different from old one for safety)
            const newFileId = new mongoose.Types.ObjectId();

            try {
                // Write new file chunks
                const chunkInfo = await writeChunks(
                    newFileId,
                    req.file.originalname,
                    req.file.buffer,
                    {
                        contentType: req.file.mimetype,
                        metadata: req.body.metadata || {}
                    }
                );

                // Parse metadata if it's a string
                let metadataObj = {};
                if (req.body.metadata) {
                    try {
                        metadataObj = typeof req.body.metadata === 'string'
                            ? JSON.parse(req.body.metadata)
                            : req.body.metadata;
                    } catch (e: any) {
                        console.warn('Failed to parse metadata:', e);
                    }
                }

                // Build custom fields: prefer request-provided values, fall back to old metadata
                const coreFields = ['_id','filename','contentType','length','chunkSize','uploadDate','metadata'];
                const allowedKeys = getTopLevelSchemaKeys(FileModel).filter((k: string) => !coreFields.includes(k));
                const customFromReqOrOld: any = {};
                for (const key of allowedKeys) {
                    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
                        customFromReqOrOld[key] = req.body[key];
                    } else if (oldFileMetadata[key] !== undefined) {
                        customFromReqOrOld[key] = oldFileMetadata[key];
                    }
                }

                const newFileMetadata = new FileModel({
                    _id: newFileId,
                    filename: req.file.originalname,
                    contentType: req.file.mimetype,
                    length: req.file.size,
                    chunkSize: chunkInfo.chunkSize,
                    uploadDate: new Date(),
                    metadata: metadataObj,
                    ...customFromReqOrOld
                });

                // Save new metadata
                await newFileMetadata.save();

                // Delete old file chunks
                if (oldChunksExist) {
                    try {
                        await deleteChunks(oldFileId.toString());
                    } catch (deleteError: any) {
                        console.error('Error deleting old file chunks:', deleteError);
                        // Continue anyway - we have the new file
                    }
                }

                // Delete old file metadata
                await FileModel.findByIdAndDelete(oldFileId);

                res.status(200).json({
                    success: true,
                    message: "File updated successfully",
                    oldFileId: oldFileId.toString(),
                    newFile: {
                        fileId: newFileId.toString(),
                        filename: newFileMetadata.filename,
                        contentType: newFileMetadata.contentType,
                        length: newFileMetadata.length,
                        uploadDate: newFileMetadata.uploadDate,
                        metadata: newFileMetadata.metadata
                    }
                });

            } catch (uploadError: any) {
                console.error('Failed to upload new file:', uploadError);

                // Clean up new file chunks if upload failed
                try {
                    await deleteChunks(newFileId.toString());
                } catch (cleanupError: any) {
                    console.error('Error cleaning up failed upload chunks:', cleanupError);
                }

                return res.status(500).json({
                    error: "Failed to update file",
                    message: uploadError.message,
                    code: "UPDATE_ERROR"
                });
            }

        } catch (error: any) {
            console.error('File update handler error:', error);
            res.status(500).json({
                error: "Server error during file update",
                message: error.message,
                code: "SERVER_ERROR"
            });
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

            const results: any[] = [];
            const errors: any[] = [];

            // Process each file
            for (const file of filesArray) {
                try {
                    const filename = file.originalname;

                    // Check if file with this filename exists
                    // Note: You might want to add additional criteria (e.g., uploadedBy) 
                    // to make the search more specific
                    let existingFile = null;

                    // Option 1: Search by filename only (as in the example)
                    existingFile = await FileModel.findOne({ filename });

                    // Option 2: Search by filename AND uploadedBy (if user-specific)
                    // if (req.user && req.user.id) {
                    //     existingFile = await FileModel.findOne({ 
                    //         filename, 
                    //         uploadedBy: req.user.id 
                    //     });
                    // } else {
                    //     existingFile = await FileModel.findOne({ filename });
                    // }

                    if (existingFile) {
                        // UPDATE EXISTING FILE
                        const oldFileId = existingFile._id;
                        const newFileId = new mongoose.Types.ObjectId();

                        // Check if old chunks exist
                        const oldChunksExist = await chunksExist(oldFileId.toString());

                        try {
                            // Write new chunks
                            const chunkInfo = await writeChunks(
                                newFileId,
                                filename,
                                file.buffer,
                                {
                                    contentType: file.mimetype,
                                    metadata: file.metadata || {}
                                }
                            );

                            // Parse metadata from file if available
                            let metadataObj = {};
                            if (file.metadata) {
                                try {
                                    metadataObj = typeof file.metadata === 'string'
                                        ? JSON.parse(file.metadata)
                                        : file.metadata;
                                } catch (e: any) {
                                    console.warn('Failed to parse metadata for file:', filename, e);
                                }
                            }

                            // Build custom fields for update: prefer per-file metadata or request-level values, fall back to existingFile
                            const coreFields = ['_id','filename','contentType','length','chunkSize','uploadDate','metadata'];
                            const sourceForCustom = { ...(req.body || {}), ...(file.metadata || {}) };
                            if (req.user && req.user.id && !sourceForCustom.uploadedBy) {
                                sourceForCustom.uploadedBy = req.user.id;
                            }
                            const customFromSource = pickModelFields(FileModel, sourceForCustom, { exclude: coreFields });

                            // Ensure we preserve any existing fields not provided in sourceForCustom
                            const allowedKeys = getTopLevelSchemaKeys(FileModel).filter((k: string) => !coreFields.includes(k));
                            const finalCustom: any = {};
                            for (const key of allowedKeys) {
                                if (Object.prototype.hasOwnProperty.call(customFromSource, key)) {
                                    finalCustom[key] = customFromSource[key];
                                } else if (existingFile[key] !== undefined) {
                                    finalCustom[key] = existingFile[key];
                                }
                            }

                            const newFileMetadata = new FileModel({
                                _id: newFileId,
                                filename: filename,
                                contentType: file.mimetype,
                                length: file.size,
                                chunkSize: chunkInfo.chunkSize,
                                uploadDate: new Date(),
                                metadata: metadataObj,
                                ...finalCustom
                            });

                            await newFileMetadata.save();

                            // Delete old chunks
                            if (oldChunksExist) {
                                try {
                                    await deleteChunks(oldFileId.toString());
                                } catch (deleteError: any) {
                                    console.error(`Error deleting old chunks for ${filename}:`, deleteError);
                                }
                            }

                            // Delete old metadata
                            await FileModel.findByIdAndDelete(oldFileId);

                            results.push({
                                filename,
                                action: "updated",
                                fileId: newFileId.toString(),
                                oldFileId: oldFileId.toString(),
                                contentType: file.mimetype,
                                length: file.size
                            });

                        } catch (updateError: any) {
                            console.error(`Failed to update file ${filename}:`, updateError);

                            // Clean up new chunks if update failed
                            try {
                                await deleteChunks(newFileId.toString());
                            } catch (cleanupError: any) {
                                console.error(`Error cleaning up failed update for ${filename}:`, cleanupError);
                            }

                            errors.push({
                                filename,
                                action: "error",
                                error: updateError.message
                            });
                        }

                    } else {
                        // CREATE NEW FILE
                        const newFileId = new mongoose.Types.ObjectId();

                        try {
                            // Write chunks
                            const chunkInfo = await writeChunks(
                                newFileId,
                                filename,
                                file.buffer,
                                {
                                    contentType: file.mimetype,
                                    metadata: file.metadata || {}
                                }
                            );

                            // Parse metadata
                            let metadataObj = {};
                            if (file.metadata) {
                                try {
                                    metadataObj = typeof file.metadata === 'string'
                                        ? JSON.parse(file.metadata)
                                        : file.metadata;
                                } catch (e: any) {
                                    console.warn('Failed to parse metadata for file:', filename, e);
                                }
                            }

                            // Prepare metadata for new file
                            const fileMetadataData: any = {
                                _id: newFileId,
                                filename: filename,
                                contentType: file.mimetype,
                                length: file.size,
                                chunkSize: chunkInfo.chunkSize,
                                uploadDate: new Date(),
                                metadata: metadataObj
                            };

                            // Add user ID if available
                            if (req.user && req.user.id) {
                                fileMetadataData.uploadedBy = req.user.id;
                            }

                            // Build custom fields from request-level and per-file metadata
                            const coreFields2 = ['_id','filename','contentType','length','chunkSize','uploadDate','metadata'];
                            const source = { ...(req.body || {}), ...(file.metadata || {}) };
                            if (req.user && req.user.id && !source.uploadedBy) {
                                source.uploadedBy = req.user.id;
                            }
                            const custom = pickModelFields(FileModel, source, { exclude: coreFields2 });

                            const newFileMetadata = new FileModel({
                                ...fileMetadataData,
                                ...custom
                            });
                            await newFileMetadata.save();

                            results.push({
                                filename,
                                action: "created",
                                fileId: newFileId.toString(),
                                contentType: file.mimetype,
                                length: file.size
                            });

                        } catch (createError: any) {
                            console.error(`Failed to create file ${filename}:`, createError);

                            // Clean up chunks if creation failed
                            try {
                                await deleteChunks(newFileId.toString());
                            } catch (cleanupError: any) {
                                console.error(`Error cleaning up failed creation for ${filename}:`, cleanupError);
                            }

                            errors.push({
                                filename,
                                action: "error",
                                error: createError.message
                            });
                        }
                    }

                } catch (fileError: any) {
                    console.error(`Error processing file ${file.originalname}:`, fileError);
                    errors.push({
                        filename: file.originalname,
                        action: "error",
                        error: fileError.message
                    });
                }
            }

            // Prepare response
            const successful = results.filter(r => !r.error).length;
            const failed = errors.length;

            const response: any = {
                success: failed === 0,
                message: "Bulk upload completed",
                summary: {
                    total: filesArray.length,
                    successful,
                    failed
                }
            };

            if (results.length > 0) {
                response.results = results;
            }

            if (errors.length > 0) {
                response.errors = errors;
            }

            res.status(failed === 0 ? 200 : 207).json(response); // 207 Multi-Status if partial failures

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
        const session = await mongoose.startSession();

        try {
            session.startTransaction();

            const filesArray = Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
            if (!filesArray || filesArray.length === 0) {
                await session.abortTransaction();
                return res.status(400).json({
                    error: "No files uploaded",
                    code: "NO_FILES"
                });
            }

            const results: any[] = [];

            for (const file of filesArray) {
                const filename = file.originalname;
                const existingFile = await FileModel.findOne({ filename }).session(session);

                if (existingFile) {
                    // Update logic within transaction
                    const oldFileId = existingFile._id;
                    const newFileId = new mongoose.Types.ObjectId();

                    // Write new chunks
                    await writeChunks(
                        newFileId,
                        filename,
                        file.buffer,
                        {
                            contentType: file.mimetype,
                            metadata: file.metadata || {}
                        }
                    );

                    // Build custom fields for transactional update
                    const coreFields = ['_id','filename','contentType','length','chunkSize','uploadDate','metadata'];
                    const sourceForCustom = { ...(req.body || {}), ...(file.metadata || {}) };
                    if (req.user && req.user.id && !sourceForCustom.uploadedBy) {
                        sourceForCustom.uploadedBy = req.user.id;
                    }
                    const customFromSource = pickModelFields(FileModel, sourceForCustom, { exclude: coreFields });
                    // Preserve existing fields if not provided
                    const allowedKeys = getTopLevelSchemaKeys(FileModel).filter((k: string) => !coreFields.includes(k));
                    const finalCustom: any = {};
                    for (const key of allowedKeys) {
                        if (Object.prototype.hasOwnProperty.call(customFromSource, key)) {
                            finalCustom[key] = customFromSource[key];
                        } else if (existingFile[key] !== undefined) {
                            finalCustom[key] = existingFile[key];
                        }
                    }

                    const newFileMetadata = new FileModel({
                        _id: newFileId,
                        filename,
                        contentType: file.mimetype,
                        length: file.size,
                        uploadDate: new Date(),
                        metadata: file.metadata || {},
                        ...finalCustom
                    });

                    await newFileMetadata.save({ session });

                    // Delete old chunks
                    await deleteChunks(oldFileId.toString());

                    // Delete old metadata
                    await FileModel.findByIdAndDelete(oldFileId, { session });

                    results.push({
                        filename,
                        action: "updated",
                        fileId: newFileId.toString()
                    });

                } else {
                    // Create logic within transaction
                    const newFileId = new mongoose.Types.ObjectId();

                    await writeChunks(
                        newFileId,
                        filename,
                        file.buffer,
                        {
                            contentType: file.mimetype,
                            metadata: file.metadata || {}
                        }
                    );

                    // Build custom fields for transactional create
                    const coreFields2 = ['_id','filename','contentType','length','chunkSize','uploadDate','metadata'];
                    const source = { ...(req.body || {}), ...(file.metadata || {}) };
                    if (req.user && req.user.id && !source.uploadedBy) {
                        source.uploadedBy = req.user.id;
                    }
                    const custom = pickModelFields(FileModel, source, { exclude: coreFields2 });

                    const newFileMetadata = new FileModel({
                        _id: newFileId,
                        filename,
                        contentType: file.mimetype,
                        length: file.size,
                        uploadDate: new Date(),
                        metadata: file.metadata || {},
                        ...custom
                    });

                    await newFileMetadata.save({ session });

                    results.push({
                        filename,
                        action: "created",
                        fileId: newFileId.toString()
                    });
                }
            }

            await session.commitTransaction();

            res.status(200).json({
                success: true,
                message: "Bulk upload completed",
                results,
                total: results.length
            });

        } catch (error: any) {
            await session.abortTransaction();
            console.error('Bulk upload transaction error:', error);
            res.status(500).json({
                error: "Bulk upload failed",
                message: error.message,
                code: "TRANSACTION_ERROR"
            });
        } finally {
            session.endSession();
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

