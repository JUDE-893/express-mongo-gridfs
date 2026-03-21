import mongoose from "mongoose";
import baseFileSchema from "../model/fileSchema.js";
import { getTopLevelSchemaKeys } from "../core/schemaUtils.js";

/**
 * Extract schema fields from a Mongoose model
 */
export const extractSchemaFields = (Model: mongoose.Model<any>): string[] => {
  const baseFields = Object.keys(baseFileSchema);
  const extendedFields = getTopLevelSchemaKeys(Model);
  const internalFields = ["__v", "id", "_id"];
  const allFields = [...new Set([...baseFields, ...extendedFields])];
  return allFields.filter(f => !internalFields.includes(f));
};

export const generatePathFromRoute = (route: string, basePath: string): string => {
  const normalizedBase = basePath.startsWith("/") ? basePath : "/" + basePath;
  const normalizedRoute = route.startsWith("/") ? route : "/" + route;
  if (normalizedRoute === "/") return normalizedBase;
  return normalizedBase + normalizedRoute;
};

/**
 * Generate OpenAPI/Swagger documentation dynamically
 */
export const generateSwaggerDocumentation = (Model: mongoose.Model<any>, basePath: string = "/api/files", tags: string | string[] = "Files"): any => {
  const tagArray = Array.isArray(tags) ? tags : [tags];
  const tag = tagArray[0];
  const customFields = extractSchemaFields(Model);

  const routes: any = {};
  const routePatterns = [
    { path: "/upload", method: "post", name: "upload" },
    { path: "/", method: "get", name: "list" },
    { path: "/download/:fileId", method: "get", name: "download" },
    { path: "/update/:fileId", method: "post", name: "update" },
    { path: "/upload-files", method: "post", name: "bulkUpload" },
    { path: "/delete/:fileId", method: "delete", name: "deleteSingle" },
    { path: "/delete-files", method: "delete", name: "deleteBulk" },
  ];

  routePatterns.forEach(route => {
    const fullPath = generatePathFromRoute(route.path, basePath);
    if (!routes[fullPath]) routes[fullPath] = {};
    routes[fullPath][route.method] = {
      summary: generateSummary(route.name),
      description: generateDescription(route.name),
      tags: [tag],
      security: [{ bearerAuth: [] }],
      parameters: generateParameters(route.name, route.method),
      requestBody: generateRequestBody(route.name),
      responses: generateResponses(route.name, route.method, customFields),
    };
  });

  const schemaDescription = customFields.length > 0
    ? "API for managing files stored in MongoDB GridFS with schema: " + customFields.join(", ")
    : "API for managing files stored in MongoDB GridFS with base fields only";

  return {
    openapi: "3.0.0",
    info: {
      title: "File Management API",
      version: "1.0.0",
      description: schemaDescription,
    },
    servers: [{ url: basePath, description: "API server" }],
    paths: routes,
    tags: [{ name: tag, description: "File upload, download, and management operations" }],
    security: [{ bearerAuth: [] }],
  };
};

function generateSummary(name: string): string {
  const summaries: Record<string, string> = {
    upload: "Upload a single file",
    list: "List all files with pagination",
    download: "Download a file by ID",
    update: "Update an existing file",
    bulkUpload: "Upload multiple files",
    deleteSingle: "Delete a single file",
    deleteBulk: "Delete multiple files",
  };
  return summaries[name] || "File operation";
}

function generateDescription(name: string): string {
  const descriptions: Record<string, string> = {
    upload: "Upload a file to GridFS with custom metadata",
    list: "Retrieve paginated list of all uploaded files",
    download: "Retrieve file content and metadata",
    update: "Replace an existing file with a new one",
    bulkUpload: "Upload multiple files with optional category/tags",
    deleteSingle: "Delete a file by its ID",
    deleteBulk: "Delete multiple files by their IDs",
  };
  return descriptions[name] || "File operation";
}

function generateParameters(name: string, method: string): any[] {
  if (name === "upload" || name === "bulkUpload") return [];
  if (name === "deleteBulk") return [];
  
  const params = [];
  if (name === "update" || name === "download" || name === "deleteSingle") {
    params.push({ in: "path", name: "fileId", required: true, schema: { type: "string" } });
  }
  
  if (name === "list") {
    params.push({ in: "query", name: "page", schema: { type: "integer", default: 1 } });
    params.push({ in: "query", name: "limit", schema: { type: "integer", default: 20 } });
    params.push({ in: "query", name: "category", schema: { type: "string" } });
    params.push({ in: "query", name: "contentType", schema: { type: "string" } });
  }
  
  return params;
}

function generateRequestBody(name: string): any {
  if (name === "upload") {
    return {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: ["file"],
            properties: { file: { type: "string", format: "binary" } },
          },
        },
      },
    };
  }
  if (name === "bulkUpload") {
    return {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: { files: { type: "array", items: { type: "string", format: "binary" } } },
          },
        },
      },
    };
  }
  if (name === "update") {
    return {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: ["file"],
            properties: { file: { type: "string", format: "binary" } },
          },
        },
      },
    };
  }
  if (name === "deleteBulk") {
    return {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { ids: { type: "array", items: { type: "string" } } },
          },
        },
      },
    };
  }
  return undefined;
}

function generateResponses(name: string, method: string, customFields: string[]): any {
  if (method === "post" && name === "upload") {
    const props: any = {
      success: { type: "boolean" },
      fileId: { type: "string" },
      filename: { type: "string" },
      contentType: { type: "string" },
      length: { type: "number" },
      uploadDate: { type: "string", format: "date-time" },
      metadata: { type: "object" },
    };
    customFields.forEach(f => props[f] = { type: "string" });
    
    return {
      201: {
        description: "File uploaded successfully",
        content: {
          "application/json": {
            schema: { type: "object", properties: props },
          },
        },
      },
      400: { description: "Invalid request" },
      503: { description: "Storage service initializing" },
    };
  }
  if (method === "get" && name === "list") {
    return {
      200: {
        description: "List of files",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                data: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      _id: { type: "string" },
                      filename: { type: "string" },
                      contentType: { type: "string" },
                      length: { type: "number" },
                      uploadDate: { type: "string", format: "date-time" },
                      metadata: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }
  if (method === "get" && name === "download") {
    return {
      200: { description: "File download" },
      404: { description: "File not found" },
    };
  }
  if (method === "post" && name === "update") {
    return {
      200: { description: "File updated successfully" },
      400: { description: "Invalid request" },
      404: { description: "File not found" },
    };
  }
  if (method === "post" && name === "bulkUpload") {
    return {
      200: { description: "Files processed successfully" },
      207: { description: "Some files failed" },
      400: { description: "No files provided" },
    };
  }
  if (method === "delete" && name === "deleteSingle") {
    return {
      200: { description: "File deleted successfully" },
      404: { description: "File not found" },
    };
  }
  if (method === "delete" && name === "deleteBulk") {
    return {
      200: { description: "Files deleted successfully" },
      207: { description: "Partial deletion - some files failed" },
      400: { description: "Invalid request" },
    };
  }
  return { 200: { description: "Success" } };
}

export default { extractSchemaFields, generatePathFromRoute, generateSwaggerDocumentation };
