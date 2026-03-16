import { deleteChunks, readChunks, writeChunks } from "./gridfsChunk.js";
import { isGridFSReady } from "./gridfs.js";
import { pickModelFields } from "./schemaUtils.js";
import mongoose from "mongoose";


/**
 * Deletes files using a Mongoose model. Handles both metadata and chunks cleanup perfectly.
 * Uses consistent behavior for safely deleting multiple items from the gridFS bucket and Mongoose model.
 * 
 * @param {mongoose.Model<any>} FileModel - The Mongoose model instance associated with the file metadata.
 * @param {Array<string|ObjectId>|string|ObjectId} filesIds - The array of file IDs, a comma-separated string, or a single ObjectId to delete.
 * @returns {Promise<any>} A promise that resolves strictly to an object with the summary and breakdown details of the deletion.
 */
const deleteFiles = async (FileModel: any, filesIds: any): Promise<any> => {
    // Fix runtime error: correctly handle single object IDs or empty arrays
    if (!filesIds || (Array.isArray(filesIds) && filesIds.length === 0) || (typeof filesIds === 'string' && filesIds.trim() === '')) {
        return {
            success: true,
            message: "No file IDs provided",
            summary: {
                totalRequested: 0,
                validIds: 0,
                invalidIds: 0,
                found: 0,
                notFound: 0,
                deleted: 0,
                failed: 0
            }
        };
    }

    // Validate FileModel is a valid Mongoose model
    if (!FileModel || typeof FileModel.find !== 'function') {
        throw new Error("Invalid FileModel: must be a valid Mongoose model");
    }

    // Fix runtime error: Convert to array for reliable iteration
    let fileIdsArray: any[] = [];
    if (typeof filesIds === 'string') {
        fileIdsArray = filesIds.split(',').map(id => id.trim()).filter(id => id);
    } else if (Array.isArray(filesIds)) {
        fileIdsArray = filesIds;
    } else {
        fileIdsArray = [filesIds];
    }

    // Validate all file IDs
    const validFileIds: import('mongoose').Types.ObjectId[] = [];
    const invalidFileIds: string[] = [];

    for (const id of fileIdsArray) {
        const idStr = id?.toString();
        // Check validity properly avoiding runtime exceptions on weird objects
        if (idStr && mongoose.Types.ObjectId.isValid(idStr)) {
            validFileIds.push(new mongoose.Types.ObjectId(idStr));
        } else {
            invalidFileIds.push(id);
        }
    }

    // If no valid IDs, return early
    if (validFileIds.length === 0) {
        return {
            success: false,
            message: "No valid file IDs provided",
            summary: {
                totalRequested: fileIdsArray.length,
                validIds: 0,
                invalidIds: invalidFileIds.length,
                found: 0,
                notFound: 0,
                deleted: 0,
                failed: 0
            },
            invalidFileIds
        };
    }

    // Get files to be deleted from the database
    const filesToDelete = await FileModel.find({
        _id: { $in: validFileIds }
    });

    const results: any[] = [];
    const errors: any[] = [];

    // Process each file
    for (const file of filesToDelete) {
        try {
            const fileId = file._id;

            // Delete chunks from GridFS
            await deleteChunks(fileId);

            // Delete metadata from the collection
            await FileModel.findByIdAndDelete(fileId);

            results.push({
                fileId: fileId.toString(),
                filename: file.filename,
                status: "deleted"
            });

        } catch (fileError: any) {
            errors.push({
                fileId: file._id.toString(),
                filename: file.filename,
                error: fileError.message || String(fileError),
                status: "failed"
            });
        }
    }

    // Report on files not found in database
    const foundIds = filesToDelete.map((f: any) => f._id.toString());
    const notFoundIds = validFileIds
        .filter(id => !foundIds.includes(id.toString()))
        .map(id => id.toString());

    // Build response object
    const response: any = {
        success: errors.length === 0,
        message: "Batch delete completed",
        summary: {
            totalRequested: validFileIds.length + invalidFileIds.length,
            validIds: validFileIds.length,
            invalidIds: invalidFileIds.length,
            found: filesToDelete.length,
            notFound: notFoundIds.length,
            deleted: results.length,
            failed: errors.length
        }
    };

    if (results.length > 0) {
        response.deleted = results;
    }

    if (errors.length > 0) {
        response.errors = errors;
    }

    if (invalidFileIds.length > 0) {
        response.invalidFileIds = invalidFileIds;
    }

    if (notFoundIds.length > 0) {
        response.notFound = notFoundIds;
    }

    return response;
};

/**
 * Convenience wrapper for deleting a single file by id.
 * Accepts a single id (string or ObjectId) and forwards to deleteFiles.
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @param {string|ObjectId} fileId - The file id to delete.
 * @returns {Promise<any>} The same response shape as deleteFiles.
 */
const deleteFile = async (FileModel: any, fileId: any): Promise<any> => {
    return deleteFiles(FileModel, fileId);
};

/**
 * Get file metadata and its binary buffer from GridFS and the metadata collection.
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @param {string|mongoose.Types.ObjectId} fileId - File id to retrieve.
 * @returns {Promise<{file: any, buffer: Buffer}>}
 * @throws {Object} Structured error with `code` and `message` fields. Possible codes: INVALID_ID, NOT_FOUND, READ_ERROR
 */
const getFileAndBuffer = async (FileModel: any, fileId: any): Promise<any> => {
    // Validate FileModel
    if (!FileModel || typeof FileModel.findById !== 'function') {
        throw { code: 'INVALID_MODEL', message: 'Invalid FileModel provided' };
    }

    const idStr = fileId?.toString?.();
    if (!idStr || !mongoose.Types.ObjectId.isValid(idStr)) {
        throw { code: 'INVALID_ID', message: 'Invalid file ID' };
    }

    const objectId = new mongoose.Types.ObjectId(idStr);

    // Fetch metadata
    const fileMetadata = await FileModel.findById(objectId);
    if (!fileMetadata) {
        throw { code: 'NOT_FOUND', message: 'File not found' };
    }

    try {
        const buffer = await readChunks(objectId);
        return { file: fileMetadata, buffer };
    } catch (err: any) {
        throw { code: 'READ_ERROR', message: err?.message || String(err) };
    }
};

/**
 * Uploads a single file into GridFS and creates the corresponding metadata document.
 * This helper is auth-agnostic and returns structured results or throws structured errors
 * that request handlers can map to HTTP responses.
 *
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @param {object} file - File object { originalname, buffer, mimetype, size, metadata? }.
 * @param {object} requestBody - Request body (used to pick custom model fields and optional metadata string).
 * @returns {Promise<any>} Resolves with details about the saved file.
 * @throws {{code:string, message:string}} Structured errors: NO_FILE, STORAGE_INITIALIZING, UPLOAD_ERROR
 */
const updateFile = async (FileModel: any, file: any, requestBody: any): Promise<any> => {
    if (!FileModel || typeof FileModel.findById !== 'function') {
        throw { code: 'INVALID_MODEL', message: 'Invalid FileModel provided' };
    }

    if (!file) {
        throw { code: 'NO_FILE', message: 'No file provided' };
    }

    if (!isGridFSReady()) {
        throw { code: 'STORAGE_INITIALIZING', message: 'Storage service is initializing' };
    }

    const fileId = new mongoose.Types.ObjectId();

    try {
        // Write chunks to gridfs
        const chunkInfo = await writeChunks(
            fileId,
            file.originalname,
            file.buffer,
            {
                contentType: file.mimetype,
                metadata: requestBody?.metadata ?? file.metadata ?? {}
            }
        );

        // Parse metadata if it's a string in requestBody (non-fatal)
        let metadataObj: any = {};
        if (requestBody && requestBody.metadata) {
            try {
                metadataObj = typeof requestBody.metadata === 'string'
                    ? JSON.parse(requestBody.metadata)
                    : requestBody.metadata;
            } catch (e: any) {
                // preserve old behavior: log and continue with empty metadata
                console.warn('updateFile: failed to parse metadata:', e?.message || e);
            }
        } else if (file && file.metadata) {
            metadataObj = file.metadata;
        }

        // Build custom fields from requestBody while excluding core fields
        const coreFields = ['_id','filename','contentType','length','chunkSize','uploadDate','metadata'];
        const customFromReq = pickModelFields(FileModel, requestBody || {}, { exclude: coreFields });

        const fileMetadata = new FileModel({
            _id: fileId,
            filename: file.originalname,
            contentType: file.mimetype,
            length: file.size,
            chunkSize: chunkInfo.chunkSize,
            uploadDate: new Date(),
            metadata: metadataObj,
            ...customFromReq
        });

        await fileMetadata.save();

        return {
            success: true,
            fileId: fileId.toString(),
            filename: fileMetadata.filename,
            contentType: fileMetadata.contentType,
            length: fileMetadata.length,
            uploadDate: fileMetadata.uploadDate,
            metadata: fileMetadata.metadata,
            doc: fileMetadata
        };

    } catch (err: any) {
        // Attempt best-effort cleanup of written chunks
        try {
            await deleteChunks(fileId.toString());
        } catch (cleanupErr: any) {
            console.error('updateFile: cleanup failed for chunks:', cleanupErr);
        }

        throw { code: 'UPLOAD_ERROR', message: err?.message || String(err) };
    }
};

// Export the helper
export { 
    deleteFiles,
    deleteFile,
    getFileAndBuffer
 };

export { updateFile };

