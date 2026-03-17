import { deleteChunks, readChunks, writeChunks, chunksExist } from "./gridfsChunk.js";
import { isGridFSReady } from "./gridfs.js";
import { pickModelFields, getTopLevelSchemaKeys } from "./schemaUtils.js";
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
    
 };

export {  };

/**
 * Replace an existing file (chunks + metadata) with a new file.
 * This helper is auth-agnostic and returns structured results or throws structured errors
 * that request handlers can map to HTTP responses.
 *
 * @param {mongoose.Model<any>} FileModel - Mongoose model for file metadata.
 * @param {string} oldFileIdStr - The existing file id to replace.
 * @param {object} file - File object { originalname, buffer, mimetype, size, metadata? }.
 * @param {object} requestBody - Request body (used to pick custom model fields and optional metadata string).
 * @returns {Promise<any>} Resolves with details about the replaced file.
 * @throws {{code:string, message:string}} Structured errors: INVALID_ID, OLD_FILE_NOT_FOUND, WRITE_ERROR, SAVE_METADATA_ERROR
 */
// Internal single-file replace implementation. Exported wrapper `replaceFile`
// will call `replaceFiles` which in turn may call this helper for id-based
// replacements. Keeping the implementation here avoids duplicating logic.
const replaceOneImpl = async (FileModel: any, oldFileIdStr: any, file: any, requestBody: any, options?: any): Promise<any> => {
    if (!FileModel || typeof FileModel.findById !== 'function') {
        throw { code: 'INVALID_MODEL', message: 'Invalid FileModel provided' };
    }

    const session = options?.session;

    const idStr = oldFileIdStr?.toString?.();
    if (!idStr || !mongoose.Types.ObjectId.isValid(idStr)) {
        throw { code: 'INVALID_ID', message: 'Invalid file ID' };
    }

    if (!file) {
        throw { code: 'NO_FILE', message: 'No file provided' };
    }

    const oldObjectId = new mongoose.Types.ObjectId(idStr);

    // Fetch old metadata (use session if provided)
    const oldFileMetadata = session
        ? await FileModel.findById(oldObjectId).session(session)
        : await FileModel.findById(oldObjectId);
    if (!oldFileMetadata) {
        throw { code: 'OLD_FILE_NOT_FOUND', message: 'Old file metadata not found' };
    }

    // Check if old chunks exist
    let oldChunksExistFlag = false;
    try {
        oldChunksExistFlag = await chunksExist(oldObjectId.toString());
    } catch (e: any) {
        // If the check fails, proceed but warn later
        console.warn('replaceFile: chunksExist check failed', e?.message || e);
    }

    const newFileId = new mongoose.Types.ObjectId();

    try {
        // Write new chunks
        const chunkInfo = await writeChunks(
            newFileId,
            file.originalname,
            file.buffer,
            {
                contentType: file.mimetype,
                metadata: requestBody?.metadata ?? file.metadata ?? {}
            }
        );

        // Parse metadata if provided as string
        let metadataObj: any = {};
        if (requestBody && requestBody.metadata) {
            try {
                metadataObj = typeof requestBody.metadata === 'string'
                    ? JSON.parse(requestBody.metadata)
                    : requestBody.metadata;
            } catch (e: any) {
                console.warn('replaceFile: failed to parse metadata:', e?.message || e);
            }
        } else if (file && file.metadata) {
            metadataObj = file.metadata;
        }

        // Build custom fields: prefer request-provided values, fall back to old metadata
        const coreFields = ['_id','filename','contentType','length','chunkSize','uploadDate','metadata'];
        const allowedKeys = getTopLevelSchemaKeys(FileModel).filter((k: string) => !coreFields.includes(k));
        const customFromReqOrOld: any = {};
        for (const key of allowedKeys) {
            if (Object.prototype.hasOwnProperty.call(requestBody, key)) {
                customFromReqOrOld[key] = requestBody[key];
            } else if (oldFileMetadata[key] !== undefined) {
                customFromReqOrOld[key] = oldFileMetadata[key];
            }
        }

        const newFileMetadata = new FileModel({
            _id: newFileId,
            filename: file.originalname,
            contentType: file.mimetype,
            length: file.size,
            chunkSize: chunkInfo.chunkSize,
            uploadDate: new Date(),
            metadata: metadataObj,
            ...customFromReqOrOld
        });

        // Save metadata with session if provided
        if (session) {
            await newFileMetadata.save({ session });
        } else {
            await newFileMetadata.save();
        }

        const warnings: string[] = [];

        // Delete old chunks (best-effort)
        if (oldChunksExistFlag) {
            try {
                await deleteChunks(oldObjectId.toString());
            } catch (deleteError: any) {
                console.error('replaceFile: error deleting old file chunks:', deleteError);
                warnings.push('Failed to delete old file chunks');
            }
        }

        // Delete old metadata (use session if provided)
        if (session) {
            await FileModel.findByIdAndDelete(oldObjectId).session(session);
        } else {
            await FileModel.findByIdAndDelete(oldObjectId);
        }

        const result = {
            success: true,
            oldFileId: oldObjectId.toString(),
            newFile: {
                fileId: newFileId.toString(),
                filename: newFileMetadata.filename,
                contentType: newFileMetadata.contentType,
                length: newFileMetadata.length,
                uploadDate: newFileMetadata.uploadDate,
                metadata: newFileMetadata.metadata
            }
        } as any;

        if (warnings.length > 0) result.warnings = warnings;

    return result;

    } catch (err: any) {
        // Attempt cleanup of new chunks
        try {
            await deleteChunks(newFileId.toString());
        } catch (cleanupErr: any) {
            console.error('replaceFile: cleanup failed for chunks:', cleanupErr);
        }

        throw { code: 'WRITE_ERROR', message: err?.message || String(err) };
    }
};

/**
 * Replace/create multiple files in bulk. Accepts either a single file object
 * or an array of file objects. Each file object should have the shape used
 * by multer: { originalname, buffer, mimetype, size, metadata? }.
 *
 * Behavior:
 * - If an entry contains an explicit `id` (or `_id`) property it will call
 *   the single-file replace implementation which replaces by id.
 * - Otherwise the helper will try to find an existing file by `filename`
 *   (originalname) and update it. If none exists it will create a new file.
 * - This helper is auth-agnostic and does not read `req.user`.
 */
const replaceFiles = async (FileModel: any, files: any, requestBody?: any, options?: any): Promise<any> => {
    const session = options?.session;

    if (!files || (Array.isArray(files) && files.length === 0)) {
        return {
            success: true,
            message: 'No files provided',
            summary: { total: 0, created: 0, updated: 0, failed: 0 }
        };
    }

    // Normalize to array
    const filesArray = Array.isArray(files) ? files : [files];

    // Validate FileModel
    if (!FileModel || typeof FileModel.find === 'undefined') {
        throw { code: 'INVALID_MODEL', message: 'Invalid FileModel provided' };
    }

    const results: any[] = [];
    const errors: any[] = [];

    for (const entry of filesArray) {
        try {
            // Support wrapper shape: { id, file, requestBody? }
            if (entry && (entry.id || entry._id)) {
                const idStr = entry.id || entry._id;
                const fileObj = entry.file || entry;
                const res = await replaceOneImpl(FileModel, idStr, fileObj, entry.requestBody || requestBody || {}, options);
                results.push({ filename: fileObj?.originalname || res?.newFile?.filename, action: 'updated', fileId: res.newFile.fileId, oldFileId: res.oldFileId });
                continue;
            }

            // Otherwise expect a multer-style file object
            const fileObj = entry;
            const filename = fileObj?.originalname;
            if (!filename) {
                errors.push({ filename: null, action: 'error', error: 'Missing filename' });
                continue;
            }

            // Try to find an existing file by filename (use session when provided)
            const existingFile = session
                ? await FileModel.findOne({ filename }).session(session)
                : await FileModel.findOne({ filename });

            if (existingFile) {
                // Replace existing file (create new chunks + metadata, delete old chunks & metadata)
                const oldFileId = existingFile._id;
                const newFileId = new mongoose.Types.ObjectId();

                try {
                    const chunkInfo = await writeChunks(
                        newFileId,
                        filename,
                        fileObj.buffer,
                        {
                            contentType: fileObj.mimetype,
                            metadata: fileObj.metadata || requestBody?.metadata || {}
                        }
                    );

                    // Parse per-file metadata if provided as string
                    let metadataObj: any = {};
                    if (fileObj && fileObj.metadata) {
                        try {
                            metadataObj = typeof fileObj.metadata === 'string' ? JSON.parse(fileObj.metadata) : fileObj.metadata;
                        } catch (e: any) {
                            console.warn('replaceFiles: failed to parse metadata for', filename, e?.message || e);
                        }
                    } else if (requestBody && requestBody.metadata) {
                        try {
                            metadataObj = typeof requestBody.metadata === 'string' ? JSON.parse(requestBody.metadata) : requestBody.metadata;
                        } catch (e: any) {
                            console.warn('replaceFiles: failed to parse request-level metadata for', filename, e?.message || e);
                        }
                    }

                    // Build custom fields: prefer request-provided values, fall back to existingFile
                    const coreFields = ['_id','filename','contentType','length','chunkSize','uploadDate','metadata'];
                    const sourceForCustom = { ...(requestBody || {}), ...(fileObj.metadata || {}) };
                    const customFromSource = pickModelFields(FileModel, sourceForCustom, { exclude: coreFields });

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
                        contentType: fileObj.mimetype,
                        length: fileObj.size,
                        chunkSize: chunkInfo.chunkSize,
                        uploadDate: new Date(),
                        metadata: metadataObj,
                        ...finalCustom
                    });

                    // Save metadata using session when provided
                    if (session) {
                        await newFileMetadata.save({ session });
                    } else {
                        await newFileMetadata.save();
                    }

                    // Delete old chunks (best-effort)
                    try {
                        const oldChunksExist = await chunksExist(oldFileId.toString());
                        if (oldChunksExist) {
                            await deleteChunks(oldFileId.toString());
                        }
                    } catch (e: any) {
                        console.error('replaceFiles: failed to delete old chunks for', filename, e?.message || e);
                    }

                    // Delete old metadata (use session if provided)
                    if (session) {
                        await FileModel.findByIdAndDelete(oldFileId).session(session);
                    } else {
                        await FileModel.findByIdAndDelete(oldFileId);
                    }

                    results.push({ filename, action: 'updated', fileId: newFileId.toString(), oldFileId: oldFileId.toString(), contentType: fileObj.mimetype, length: fileObj.size });

                } catch (updateError: any) {
                    // Cleanup new chunks
                    try {
                        await deleteChunks(newFileId.toString());
                    } catch (cleanupError: any) {
                        console.error('replaceFiles: cleanup failed for', filename, cleanupError);
                    }

                    errors.push({ filename, action: 'error', error: updateError?.message || String(updateError) });
                }

            } else {
                // Create new file
                const newFileId = new mongoose.Types.ObjectId();

                try {
                    const chunkInfo = await writeChunks(
                        newFileId,
                        filename,
                        fileObj.buffer,
                        {
                            contentType: fileObj.mimetype,
                            metadata: fileObj.metadata || requestBody?.metadata || {}
                        }
                    );

                    // Parse metadata
                    let metadataObj: any = {};
                    if (fileObj && fileObj.metadata) {
                        try {
                            metadataObj = typeof fileObj.metadata === 'string' ? JSON.parse(fileObj.metadata) : fileObj.metadata;
                        } catch (e: any) {
                            console.warn('replaceFiles: failed to parse metadata for', filename, e?.message || e);
                        }
                    } else if (requestBody && requestBody.metadata) {
                        try {
                            metadataObj = typeof requestBody.metadata === 'string' ? JSON.parse(requestBody.metadata) : requestBody.metadata;
                        } catch (e: any) {
                            console.warn('replaceFiles: failed to parse request-level metadata for', filename, e?.message || e);
                        }
                    }

                    const coreFields2 = ['_id','filename','contentType','length','chunkSize','uploadDate','metadata'];
                    const source = { ...(requestBody || {}), ...(fileObj.metadata || {}) };
                    const custom = pickModelFields(FileModel, source, { exclude: coreFields2 });

                    const newFileMetadata = new FileModel({
                        _id: newFileId,
                        filename,
                        contentType: fileObj.mimetype,
                        length: fileObj.size,
                        chunkSize: chunkInfo.chunkSize,
                        uploadDate: new Date(),
                        metadata: metadataObj,
                        ...custom
                    });

                    // Save metadata using session when provided
                    if (session) {
                        await newFileMetadata.save({ session });
                    } else {
                        await newFileMetadata.save();
                    }

                    results.push({ filename, action: 'created', fileId: newFileId.toString(), contentType: fileObj.mimetype, length: fileObj.size });

                } catch (createError: any) {
                    // Cleanup chunks
                    try {
                        await deleteChunks(newFileId.toString());
                    } catch (cleanupError: any) {
                        console.error('replaceFiles: cleanup failed for new file', filename, cleanupError);
                    }

                    errors.push({ filename, action: 'error', error: createError?.message || String(createError) });
                }
            }

        } catch (fileError: any) {
            errors.push({ filename: fileError?.filename || null, action: 'error', error: fileError?.message || String(fileError) });
        }
    }

    const summary = {
        total: filesArray.length,
        created: results.filter(r => r.action === 'created').length,
        updated: results.filter(r => r.action === 'updated').length,
        failed: errors.length
    };

    const response: any = {
        success: errors.length === 0,
        message: 'Bulk replace completed',
        summary
    };

    if (results.length > 0) response.results = results;
    if (errors.length > 0) response.errors = errors;

    return response;
};

// Thin wrapper: replace a single file by delegating to replaceFiles for a single-entry array.
const replaceFile = async (FileModel: any, oldFileIdStr: any, file: any, requestBody: any): Promise<any> => {
    const resp = await replaceFiles(FileModel, [{ id: oldFileIdStr, file, requestBody }], requestBody);
    // If there were errors, try to map them to structured errors similar to original behavior
    if (resp.errors && resp.errors.length > 0) {
        const err = resp.errors[0];
        // If old file not found, mimic previous code
        if (err.error && typeof err.error === 'string' && err.error.includes('Old file metadata not found')) {
            throw { code: 'OLD_FILE_NOT_FOUND', message: 'Old file metadata not found' };
        }
        throw { code: 'WRITE_ERROR', message: err.error || 'Failed to replace file' };
    }

    // Return the single success result in the shape expected by routers
    const r = resp.results && resp.results[0];
    return {
        success: true,
        oldFileId: r?.oldFileId,
        newFile: {
            fileId: r?.fileId,
            filename: r?.filename,
            contentType: r?.contentType,
            length: r?.length,
            uploadDate: r?.uploadDate,
            metadata: r?.metadata
        }
    };
};

/**
 * Convenience wrapper that runs replaceFiles inside a mongoose transaction.
 * Starts a session, commits on success, aborts on failure and returns/throws
 * structured errors consistent with other helpers.
 */
const replaceFilesWithTransaction = async (FileModel: any, files: any, requestBody?: any): Promise<any> => {
    if (!FileModel || typeof FileModel.find === 'undefined') {
        throw { code: 'INVALID_MODEL', message: 'Invalid FileModel provided' };
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const resp = await replaceFiles(FileModel, files, requestBody, { session });

        await session.commitTransaction();

        return resp;
    } catch (err: any) {
        try {
            await session.abortTransaction();
        } catch (e: any) {
            console.error('replaceFilesWithTransaction: abortTransaction failed', e?.message || e);
        }
        throw { code: 'TRANSACTION_ERROR', message: err?.message || String(err) };
    } finally {
        session.endSession();
    }
};

export { 
    updateFile,
     deleteFiles,
    deleteFile,
    getFileAndBuffer,
    replaceFiles,
    replaceFile,
    replaceFilesWithTransaction
};

