import * as mongoose from "mongoose";

const fileSchema = {
    filename: {
        type: String,
        required: true
    },
    contentType: {
        type: String,
        required: true
    },
    length: {
        type: Number,
        required: true
    },
    uploadDate: {
        type: Date,
        default: Date.now
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    chunkSize: {
        type: Number,
        default: 255 * 1024 // Default GridFS chunk size
    }
}

export default fileSchema;