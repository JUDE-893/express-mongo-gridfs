import * as mongoose from 'mongoose';
import baseFileSchema from './fileSchema.js';
import { toCapCase } from '../core/utils.js';

/**
 * Create and return a Mongoose model for file documents (GridFS-style files collection).
 *
 * This function builds a Mongoose Schema by merging a base file schema with any user-supplied
 * schema additions, applies configured schema options (including virtuals, transforms, etc.),
 * and registers a Mongoose model named `${toCapCase(collection)}File`. The underlying MongoDB
 * collection used for storing the files is formed by appending `.files` to the provided `collection`
 * name (e.g. `"upload.files"`).
 *
 * The resulting model is intended to represent file metadata entries typically used with GridFS.
 *
 * @param config - Optional configuration object to customize the model.
 * @param config.modelSchema - Additional schema properties to merge into the base file schema.
 *                              Defaults to an empty object.
 * @param config.collection - Base collection name (without the `.files` suffix). Defaults to `"upload"`.
 * @param config.schemaOptions - Standard Mongoose Schema options object. Can be used to configure
 *                               `toJSON`, `toObject`, `timestamps`, `strict` and other
 *                               schema-level behaviors. Defaults to `{}`.
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
 * // Add custom schema fields and schema options (including virtuals):
 * const Files = createFilesModel({
 *   modelSchema: { ownerId: { type: String, required: true } },
 *   collection: 'userUploads',
 *   schemaOptions: {
 *     toJSON: { virtuals: true, transformer: transformerFn },
 *     toObject: { virtuals: true, transformer: transformerFn }
 *   }
 * });
 *
 * @public
 */
interface CreateFilesModelConfig {
    modelSchema?: mongoose.SchemaDefinition;
    collection?: string;
    schemaOptions?: mongoose.SchemaOptions;
}

export const createFilesModel = function ({
    modelSchema = {},
    collection = 'upload',
    schemaOptions = {}
}: CreateFilesModelConfig = {}) {

    const FilesSchema = new mongoose.Schema({
        ...baseFileSchema, ...modelSchema
    }, {
        collection: (collection + '.files'), // Custom collection name for GridFS
        strict: true,
        strictQuery: true,
        ...schemaOptions
    });




    const FileModel = mongoose.model((toCapCase(collection) + 'File'), FilesSchema);

    return FileModel

}

