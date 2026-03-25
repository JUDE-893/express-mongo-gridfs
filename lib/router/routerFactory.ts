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
import { generateSwaggerDocumentation } from "./swaggerGenerator.js";

interface RouterOptions {
  model: mongoose.Model<any>;
  multerConfig?: multer.Options;
  routeMiddlewares?: Record<string, express.RequestHandler[]>;
  swaggerConfig?: {
    tags?: string | string[];
    basePath?: string;
  };
}

/**
 * Creates an Express router for file operations.
 *
 * @param options - Configuration options for the router.
 * @param options.model - The Mongoose model used to interact with the files collection.
 * @param options.multerConfig - Multer configuration options for handling file uploads.
 * @param options.routeMiddlewares - Custom middleware functions for specific routes.
 * @param options.swaggerConfig - Swagger documentation configuration options.
 *
 * @returns An Express router instance configured for file operations.
 */
export const createFileRouter = (options: RouterOptions) => {
  const router = express.Router();

  const {
    model,
    multerConfig = {
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    },
    routeMiddlewares = {},
    swaggerConfig = {}
  } = options;

  if (!model) {
    throw new Error("Model parameter is required for createFileRouter");
  }

  const upload = multer(multerConfig);
  const uploadHandler = createFileUploadHandler(model);
  const downloadHandler = createFileDownloadHandler(model);
  const fileInfoHandler = createFileInfoHandler(model);
  const listFilesHandler = createListFilesHandler(model);
  const updateHandler = createFileUpdateHandler(model);
  const bulkUploadHandler = createBulkUploadHandler(model);
  const deleteHandler = createFileDeleteHandler(model);
  const bulkDeleteHandler = createBatchDeleteHandler(model);

  const applyMiddlewares = (routeName: string, defaultMiddlewares: express.RequestHandler[] = []): express.RequestHandler[] => {
    const customMiddlewares = routeMiddlewares[routeName] || [];
    return [...customMiddlewares, ...defaultMiddlewares];
  };

  // API routes - consistent paths
  const basePath = swaggerConfig.basePath || "/api/files";
  
  // Generate and expose Swagger documentation
  (router as any).swaggerDoc = generateSwaggerDocumentation(model, basePath, swaggerConfig.tags || "Files");

  router.post(
    "/upload",
    ...applyMiddlewares("upload", [upload.single("file")]),
    uploadHandler
  );

  router.get("/", ...applyMiddlewares("list"), listFilesHandler);

  router.get("/download/:fileId", ...applyMiddlewares("download"), downloadHandler);

  router.post(
    "/update/:fileId",
    ...applyMiddlewares("update", [upload.single("file")]),
    (req, res, next) => {
      req.body.id = req.params.fileId;
      next();
    },
    updateHandler
  );

  router.post(
    "/upload-files",
    ...applyMiddlewares("bulkUpload", [upload.array("files")]),
    bulkUploadHandler
  );

  router.delete(
    "/delete/:fileId",
    ...applyMiddlewares("deleteSingle"),
    deleteHandler
  );

  router.delete(
    "/delete-files",
    ...applyMiddlewares("deleteBulk"),
    bulkDeleteHandler
  );

  return router;
};

export default { createFileRouter };
