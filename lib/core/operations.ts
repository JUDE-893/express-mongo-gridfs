import { deleteChunks } from "./gridfsChunk";
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

export {
    deleteFiles
};
