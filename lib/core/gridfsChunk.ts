import mongoose from 'mongoose';

/**
 * Write raw chunks directly to the GridFS chunks collection.
 */
async function writeChunks(
  fileId: string | mongoose.Types.ObjectId,
  filename: string,
  buffer: Buffer | Uint8Array,
  options: { chunkSize?: number; contentType?: string; metadata?: any } = {}
): Promise<{ fileId: string | mongoose.Types.ObjectId; filename: string; contentType: string; length: number; chunkSize: number; uploadDate: Date; chunks: number }> {
  if (!mongoose.connection.db) throw new Error('MongoDB connection not ready');

  const db = mongoose.connection.db;
  const chunksCollection = db.collection('uploads.chunks');

  const chunkSize = options.chunkSize || 255 * 1024;
  const contentType = options.contentType || 'application/octet-stream';

  // Calculate and create chunks
  const chunks = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    const chunkData = buffer.slice(i, Math.min(i + chunkSize, buffer.length));

    chunks.push({
      files_id: fileId,
      n: Math.floor(i / chunkSize),
      data: new mongoose.mongo.Binary(chunkData) // Use MongoDB Binary type
    });
  }

  // Insert chunks
  if (chunks.length > 0) {
    await chunksCollection.insertMany(chunks);
  }

  return {
    fileId,
    filename,
    contentType,
    length: buffer.length,
    chunkSize,
    uploadDate: new Date(),
    chunks: chunks.length
  };
}

/**
 * Read and concatenate all chunks for a given fileId.
 */
async function readChunks(fileId: string | mongoose.Types.ObjectId): Promise<Buffer> {
  if (!mongoose.connection.db) throw new Error('MongoDB connection not ready');

  const db = mongoose.connection.db;
  const chunksCollection = db.collection('uploads.chunks');

  // Get all chunks for this file, sorted by chunk number
  const objId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  const chunks = await chunksCollection
    .find({ files_id: objId })
    .sort({ n: 1 })
    .toArray();

  if (chunks.length === 0) {
    throw new Error('No chunks found for fileId: ' + fileId);
  }

  // Collect all chunk data as Buffers
  const buffers = chunks.map(chunk => {
    // Handle different data formats
    if (chunk.data instanceof mongoose.mongo.Binary) {
      // MongoDB Binary type
      return Buffer.from(chunk.data.buffer);
    } else if (chunk.data && chunk.data.buffer && Buffer.isBuffer(chunk.data.buffer)) {
      // Binary object with buffer property
      return chunk.data.buffer;
    } else if (Buffer.isBuffer(chunk.data)) {
      // Already a Buffer
      return chunk.data;
    } else if (chunk.data && typeof chunk.data === 'string') {
      // String data (shouldn't happen but handle it)
      return Buffer.from(chunk.data, 'base64');
    } else {
      // Try to convert whatever it is to Buffer
      return Buffer.from(chunk.data || '');
    }
  });

  // Concatenate all buffers
  return Buffer.concat(buffers);
}

/**
 * Delete chunks
 */
async function deleteChunks(fileId: string | mongoose.Types.ObjectId) {
  if (!mongoose.connection.db) throw new Error('MongoDB connection not ready');

  const db = mongoose.connection.db;
  const chunksCollection = db.collection('uploads.chunks');

  const objId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  await chunksCollection.deleteMany({ files_id: objId });
}

/**
 * Check if chunks exist for a file
 */
async function chunksExist(fileId: string | mongoose.Types.ObjectId) {
  if (!mongoose.connection.db) throw new Error('MongoDB connection not ready');

  const db = mongoose.connection.db;
  const chunksCollection = db.collection('uploads.chunks');

  const objId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  const count = await chunksCollection.countDocuments({ files_id: objId });
  return count > 0;
}

export {
  writeChunks,
  readChunks,
  deleteChunks,
  chunksExist
};