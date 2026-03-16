import { GridFSBucket, Db } from 'mongodb';
import type { Connection as MongooseConnection } from 'mongoose';

let gridfsBucket: GridFSBucket | null = null;

/**
 * Initialize the GridFS bucket instance.
 *
 * Short: call once after opening a mongoose connection.
 *
 * @param connection - Mongoose Connection (or any object with a `db: Db`) used to create the GridFSBucket
 * @throws Error when connection or connection.db is missing
 */
function initGridFS(connection: MongooseConnection | { db: Db }): void {
  if (!connection || !connection.db) throw new Error('Mongoose connection required');
  gridfsBucket = new GridFSBucket(connection.db, { bucketName: 'uploads' });
}

/**
 * Get the initialized GridFSBucket instance.
 *
 * Short: returns the bucket or throws if not initialized.
 *
 * @returns GridFSBucket
 * @throws Error when bucket is not initialized
 */
function getGridFSBucket(): GridFSBucket {
  if (!gridfsBucket) throw new Error('GridFSBucket not initialized');
  return gridfsBucket;
}

/**
 * Check whether GridFS has been initialized.
 *
 * Short: returns true when `initGridFS` has been called successfully.
 */
const isGridFSReady = (): boolean => {
  return !!gridfsBucket;
};

export {
  isGridFSReady,
  initGridFS,
  getGridFSBucket,
};