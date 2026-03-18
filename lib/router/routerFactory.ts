/**
 * Generic File Router Creator with Swagger Documentation
 * Creates Express routers with exact same routes and Swagger docs as original files
 *
 * @param {Object} options - Configuration options
 * @param {mongoose.Model} options.model - Mongoose model for files
 * @param {Object} options.multerConfig - Multer configuration
 * @param {Object} options.routeMiddlewares - Middleware configuration per route
 * @param {Object} options.swaggerConfig - Swagger configuration
 * @returns {express.Router} Configured Express router
 */
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import {
  createFileUploadHandler,
  createFileDownloadHandler,
  createFileInfoHandler,
  createListFilesHandler,
  createFileUpdateHandler,
  createBulkUploadHandler,
  createFileDeleteHandler,
  createBatchDeleteHandler,
} from "./handlersFactory.js";

interface RouterOptions {
  model: mongoose.Model<any>;
  multerConfig?: multer.Options;
  routeMiddlewares?: Record<string, express.RequestHandler[]>;
  swaggerConfig?: {
    tags?: string;
  };
}

const createFileRouter = (options: RouterOptions) => {
  const router = express.Router();

  // Destructure options
  const {
    model,
    multerConfig = {
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    },
    routeMiddlewares = {},
    swaggerConfig = {}
  } = options;

  // Validate required parameters
  if (!model) {
    throw new Error("Model parameter is required for createFileRouter");
  }

  // Configure multer
  const upload = multer(multerConfig);

  // Create handlers using the provided model
  const uploadHandler = createFileUploadHandler(model);
  const downloadHandler = createFileDownloadHandler(model);
  const fileInfoHandler = createFileInfoHandler(model);
  const listFilesHandler = createListFilesHandler(model);
  const updateHandler = createFileUpdateHandler(model);
  const bulkUploadHandler = createBulkUploadHandler(model);
  const deleteHandler = createFileDeleteHandler(model);
  const bulkDeleteHandler = createBatchDeleteHandler(model);

  // Helper to apply middlewares
  const applyMiddlewares = (routeName: string, defaultMiddlewares: express.RequestHandler[] = []): express.RequestHandler[] => {
    const customMiddlewares = routeMiddlewares[routeName] || [];
    return [...customMiddlewares, ...defaultMiddlewares];
  };

  // ----------------------------
  // ROUTE DEFINITIONS WITH SWAGGER DOCS
  // ----------------------------

  /**
   * @swagger
   * /api/media/user/upload:
   *   post:
   *     summary: Upload a file with custom metadata
   *     description: Upload files to GridFS with metadata stored in custom collection
   *     tags: [${swaggerConfig.tags || 'Files'}]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: The file to upload
   *               metadata:
   *                 type: string
   *                 description: JSON string of additional metadata
   *     responses:
   *       201:
   *         description: File uploaded successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 fileId:
   *                   type: string
   *                 filename:
   *                   type: string
   *                 contentType:
   *                   type: string
   *                 length:
   *                   type: number
   */
  router.post(
    "/upload",
    ...applyMiddlewares("upload", [upload.single("file")]),
    uploadHandler
  );

  /**
   * @swagger
   * /api/media/user:
   *   get:
   *     summary: List all files with pagination
   *     tags: [${swaggerConfig.tags || 'Files'}]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *       - in: query
   *         name: category
   *         schema:
   *           type: string
   *       - in: query
   *         name: contentType
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of files
   */
  router.get("/", ...applyMiddlewares("list"), listFilesHandler);

  /**
   * @swagger
   * /api/media/user/{fileId}:
   *   get:
   *     summary: Get file metadata
   *     tags: [${swaggerConfig.tags || 'Files'}]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: fileId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: File metadata
   *       404:
   *         description: File not found
   */
  router.get("/:fileId", ...applyMiddlewares("get"), fileInfoHandler);

  /**
   * @swagger
   * /api/media/user/download/{fileId}:
   *   get:
   *     summary: Download a file
   *     tags: [${swaggerConfig.tags || 'Files'}]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: fileId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: File download
   *       404:
   *         description: File not found
   */
  router.get(
    "/download/:fileId",
    ...applyMiddlewares("download"),
    downloadHandler
  );

  /**
   * @swagger
   * /api/files/{fileId}:
   *   put:
   *     summary: Update an existing file
   *     description: Replace an existing file with a new one
   *     tags: [${swaggerConfig.tags || 'Files'}]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: File ID to update
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [file]
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: New file to upload
   *               category:
   *                 type: string
   *                 description: New category
   *               tags:
   *                 type: string
   *                 description: Comma-separated tags
   *     responses:
   *       200:
   *         description: File updated successfully
   *       400:
   *         description: Invalid input
   *       404:
   *         description: File not found
   */
  router.post(
    "/update/:fileId",
    ...applyMiddlewares("update", [upload.single("file")]),
    (req, res, next) => {
      // Move ID from params to body for the handler
      req.body.id = req.params.fileId;
      next();
    },
    updateHandler
  );

  /**
   * @swagger
   * /api/files/upload-files:
   *   post:
   *     summary: Bulk upload or update files
   *     description: Upload multiple files, update existing ones by filename
   *     tags: [${swaggerConfig.tags || 'Files'}]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               files:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *                 description: Files to upload
   *               category:
   *                 type: string
   *                 description: Category for all files
   *               tags:
   *                 type: string
   *                 description: Tags for all files
   *     responses:
   *       200:
   *         description: Files processed successfully
   *       207:
   *         description: Some files failed (multi-status)
   *       400:
   *         description: No files provided
   */
  router.post(
    "/upload-files",
    ...applyMiddlewares("bulkUpload", [upload.array("files")]),
    bulkUploadHandler
  );

  /**
   * @swagger
   * /api/files/delete/{fileId}:
   *   delete:
   *     summary: Delete a file by ID
   *     description: Delete a file by its ID
   *     tags: [${swaggerConfig.tags || 'Files'}]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: File ID to delete
   *     responses:
   *       200:
   *         description: File deleted successfully
   *       404:
   *         description: File not found
   */
  router.delete(
    "/delete/:fileId",
    ...applyMiddlewares("deleteSingle"),
    deleteHandler
  );

  /**
   * @swagger
   * /api/files/delete-files:
   *   delete:
   *     summary: Bulk delete files by IDs
   *     description: Delete multiple files by their IDs
   *     tags: [${swaggerConfig.tags || 'Files'}]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               ids:
   *                 type: array
   *                 items:
   *                   type: string
   *                 description: Array of file IDs to delete
   *     responses:
   *       200:
   *         description: Files deleted successfully
   *       404:
   *         description: Some files not found
   */
  router.delete(
    "/delete-files",
    ...applyMiddlewares("deleteBulk"),
    bulkDeleteHandler
  );

  return router;
};

export default createFileRouter;
