import * as mongoose from 'mongoose';
import baseFileSchema from '@/lib/model/fileSchema.js';
import { toCapCase } from '@/lib/core/utils.js';

/**
 * Create and return a Mongoose model for file documents (GridFS-style files collection).
 *
 * This function builds a Mongoose Schema by merging a base file schema with any user-supplied
 * schema additions, applies configured indexes, and registers a Mongoose model named
 * `${toCapCase(collection)}File`. The underlying MongoDB collection used for storing the files
 * is formed by appending `.files` to the provided `collection` name (e.g. `"upload.files"`).
 *
 * The resulting model is intended to represent file metadata entries typically used with GridFS.
 *
 * @param config - Optional configuration object to customize the model.
 * @param config.modelSchema - Additional schema properties to merge into the base file schema.
 *                              Defaults to an empty object.
 * @param config.collection - Base collection name (without the `.files` suffix). Defaults to `"upload"`.
 * @param config.indexes - Array of index descriptors to apply to the schema. Each descriptor should
 *                         include `field` (the field name to index) and `order` (1 for asc, -1 for desc).
 *                         Defaults to `[]`.
 *
 * @returns A Mongoose Model for the files collection (type: import('mongoose').Model<any>).
 *
 * @throws If Mongoose is not available in the calling context, or if model creation fails (e.g. duplicate model name).
 *
 * @example
 * // Create a basic files model with defaults:
 * const Files = createFilesModel();
 *
 * @example
 * // Add custom schema fields and indexes:
 * const Files = createFilesModel({
 *   modelSchema: { ownerId: { type: String, required: true } },
 *   collection: 'userUploads',
 *   indexes: [{ field: 'ownerId', order: 1 }, { field: 'uploadDate', order: -1 }]
 * });
 *
 * @public
*/
interface IndexDescriptor {
    field: string;
    order: mongoose.IndexDirection;
}

interface CreateFilesModelConfig {
    modelSchema?: mongoose.SchemaDefinition;
    collection?: string;
    indexes?: IndexDescriptor[];
}

const createFilesModel = function(config: CreateFilesModelConfig = {modelSchema: {}, collection: 'upload', indexes: []}) {

    const FilesSchema = new mongoose.Schema({
        ...baseFileSchema, ...config.modelSchema
    }, {
        collection: (config.collection + '.files'), // Custom collection name for GridFS
        strict: true,
        strictQuery: true
    });


    const indexes = config.indexes ?? [];
    indexes.forEach((index) => {
        FilesSchema.index({ [index.field]: index.order });
    })

    const FileModel = mongoose.model((toCapCase(config?.collection ?? 'upload')+'File'), FilesSchema);

    return FileModel

}

export default createFilesModel;