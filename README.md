<div align="center">

# 🚀 express-mongo-gridfs

[![npm version](https://img.shields.io/npm/v/express-mongo-gridfs?style=for-the-badge&color=33cc33)](https://www.npmjs.com/package/express-mongo-gridfs)
[![License](https://img.shields.io/github/license/JUDE-893/express-mongo-gridfs?style=for-the-badge&color=007bff)](./LICENSE)
[![NPM Downloads](https://img.shields.io/npm/dm/express-mongo-gridfs?style=for-the-badge&color=00c2ff)](https://www.npmjs.com/package/express-mongo-gridfs)

**A premium, enterprise-ready toolkit for professional file management in MongoDB using GridFS.**  
Build robust, scalable, and fully-documented file APIs in minutes.

</div>

---

## 📑 Table of Contents

- [📋 Prerequisites](#-prerequisites)
- [💾 Installation](#-installation)
- [🧩 Core Initialization](#-core-initialization)
- [🏗 Model Management](#-model-management)
  - [⚙️ Configuration Deep Dive](#model-configuration-deep-dive)
  - [🔍 Default Logic & Naming](#-default-logic--naming)
  - [📝 Schema Extension Example](#schema-extension-example)
- [🌐 Express Router Factory](#-express-router-factory)
  - [🛠 Router Configuration Options](#router-configuration-options)
  - [➕ Extending the Router](#extending-the-router)
  - [📄 Swagger Setup Guide](#swagger-setup-guide)
- [🛠 Exhaustive Utilities API](#-exhaustive-utilities-api)
  - [📂 File Operations](#file-operations)
  - [🛡 Transaction Support](#transaction-support)
- [⚠️ Error Handling & Storage Logic](#-error-handling--storage-logic)
- [📄 License](#-license)
- [🤝 Contributing](#-contributing)

---

## 📋 Prerequisites

- **Node.js**: `v18.0.0+`
- **MongoDB**: `v5.0+` (GridFS support)
- **Replica Set**: **Mandatory** for transactions (`replaceFilesWithTransaction`).

> [!IMPORTANT]  
> 🔗 Refer to the [Official Mongoose Guide to Replica Sets](https://mongoosejs.com/docs/transactions.html) for setup.

---

## 💾 Installation

```bash
npm install express-mongo-gridfs
```

---

## 🧩 Core Initialization

Initialize the library once your Mongoose connection is established. This sets up the internal `GridFSBucket`.

```javascript
import { initGridFS } from 'express-mongo-gridfs';
import mongoose from 'mongoose';

async function connectDatabase(connectionString) {
  try {
    await mongoose.connect(connectionString, { family: 4 });
    console.log("✅ Connected to DB successfully");
    
    // 🛡️ CRITICAL: Initialize GridFS with the connection
    initGridFS(mongoose.connection);
  } catch (err) {
    console.error("❌ Database connection error:", err);
    throw err;
  }
}
```

---

## 🏗 Model Management

The `createFilesModel` function generates a Mongoose model specifically tuned for GridFS metadata. It handles collection naming, schema merging, and indexing.

### ⚙️ Model Configuration Deep Dive

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `collection` | `string` | `'upload'` | Base name for the collections. |
| `modelSchema` | `object` | `{}` | Mongoose schema definition to merge into the base file schema. |
| `indexes` | `array` | `[]` | Array of `{ field: string, order: 1 \| -1 }` to apply to the metadata. |

### 🔍 Default Logic & Naming

- **Collection Name**: The underlying MongoDB collection will be `${collection}.files`.
- **Model Name**: The Mongoose model is registered as `${CapitalizedCollection}File`.  
  *Example: A collection named `media` becomes `MediaFile`.*
- **Base Schema**: Every model includes `filename`, `contentType`, `length`, `chunkSize`, `uploadDate`, and `metadata` by default.

### 📝 Schema Extension Example

```javascript
import { createFilesModel } from 'express-mongo-gridfs';

const UserDocs = createFilesModel({
  collection: 'user_docs',
  modelSchema: {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: ['invoice', 'id_card', 'other'] },
    isVerified: { type: Boolean, default: false }
  },
  indexes: [
    { field: 'owner', order: 1 },
    { field: 'category', order: 1 }
  ]
});
```

---

## 🌐 Express Router Factory

The `createFileRouter` factory creates a standard Express router with optimized handlers for file operations.

### 🛠 Router Configuration Options

```javascript
// Create the user files router with exact original routes and Swagger
const userFilesRouter = createFileRouter({
    model: UserFile,
    multerConfig: {
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 20 * 1024 * 1024, // 20MB per file
            files: 5 // Maximum 5 files per upload
        },
        fileFilter: (req, file, cb) => {
            // Define allowed MIME types for all supported formats
            const allowedMimes = [
                //images
                'image/jpeg',
                'image/jpg',
                'image/png',
                //pdf
                'application/pdf',
                //word
                'application/msword'
            ];

            if (allowedMimes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Invalid file type. Supported formats: images, PDF.'), false);
            }
        }
    },
    routeMiddlewares: {
        // Auth middleware on ALL routes
        upload: [your_auth_middleware, your_rate_limiter],
        list: [your_auth_middleware],
        get: [your_auth_middleware],
        download: [your_auth_middleware],
        update: [your_auth_middleware],
        bulkUpload: [your_auth_middleware],
        delete: [your_AuthMiddleware],
        deleteBulk: [your_AuthMiddleware],
    },
    swaggerConfig: {
        tags: ['User Files']
    }
});
```

### ➕ Extending the Router

Since it returns a standard `express.Router`, you can mount additional logic easily:

```javascript
const fileRouter = createFileRouter({ model: UserDocs });

// Extend with a custom analytics route
fileRouter.get('/stats/summary', async (req, res) => {
  const stats = await UserDocs.aggregate([...]);
  res.json(stats);
});

app.use('/api/files', fileRouter);
```

### 📄 Swagger Setup Guide

Add the library routes to your existing Swagger documentation:

```javascript
import swaggerJSDoc from "swagger-jsdoc";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "My System API",
      version: "1.0.0",
      description: "API for managing files and users"
    },
  },
  apis: [
    "./src/routes/*.js",              // Your existing routes
    "./src/modules/files/*.js",       // Where Your created Routers are
  ],
};

const swaggerSpecs = swaggerJSDoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
```

---

## 🛠 Exhaustive Utilities API

### 📂 File Operations

#### `uploadFile(model, file, body)`
Uploads a file and persists metadata.
```javascript
const result = await uploadFile(UserDocs, req.file, { 
  owner: req.user._id, 
  category: 'invoice' 
});
```

#### `replaceFile(model, id, file, body)`
Updates an existing file by creating new chunks and cleaning up the old ones.
```javascript
const result = await replaceFile(UserDocs, '64af...', req.file, { category: 'updated' });
```

#### `replaceFiles(model, files, body)`
Bulk operation. Updates if file ID/name is provided; otherwise, creates new entries.
```javascript
const response = await replaceFiles(UserDocs, req.files, req.body);
```

#### `deleteFiles(model, ids)`
Safely removes metadata and GridFS chunks for one or more IDs. Supports arrays or comma-separated strings.

#### `deleteFile(model, id)`
Shorthand for `deleteFiles(model, id)`.

#### `getFileAndBuffer(model, id)`
Retrieves metadata and full binary content as a `Buffer`. Perfect for custom processing.

### 🛡 Transaction Support

#### `replaceFilesWithTransaction(model, files, body)`
Ensures atomicity for bulk operations. If one file fails, the entire operation is rolled back.

```javascript
try {
  const report = await replaceFilesWithTransaction(UserDocs, req.files, req.body);
  console.log('✅ Processed:', report.summary);
} catch (err) {
  console.error('❌ Transaction rolled back:', err.message);
}
```

---

## ⚠️ Error Handling & Storage Logic

- **🛡️ Orphan Prevention**: If a metadata save fails after writing chunks, the library triggers a **best-effort cleanup** of the orphaned chunks.
- **🛡️ Safety First**: During file updates, the new data is committed **before** the old data is deleted, ensuring no "missing file" window.
- **🛡️ Granular Feedback**: Batch operations return a `207 Multi-Status` on partial failure, providing a detailed `summary` and `errors` array.

---

## 📄 License

ISC

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.

---

<p align="center" style="margin-top: 2rem;">
  <i style="color: gray;">Maintained & Crafted with ❤️ by <a href="https://github.com/JUDE-893" style="color: grey; font-weight: bold;">JUDE-893</a></i>
</p>
