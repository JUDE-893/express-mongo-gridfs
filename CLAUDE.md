# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `express-mongo-gridfs`, an enterprise-ready toolkit for integrating Express.js with MongoDB GridFS. It provides comprehensive file storage, retrieval, and management capabilities with transaction support, automatic user attribution, and Swagger documentation integration.

## Architecture

### Core Components

- **`lib/core/`**: Core initialization and GridFS setup
  - `gridfs.ts`: Main GridFS bucket initialization (`initGridFS`, `getGridFSBucket`)
  - `gridfsChunk.ts`: Chunk-level operations
  - `operations.ts`: High-level GridFS operations
  - `schemaUtils.ts`: Schema utilities
  - `utils.ts`: Core utilities

- **`lib/model/`**: Mongoose model management
  - `index.ts`: `createFilesModel` factory for creating GridFS-tuned Mongoose models
  - `fileSchema.ts`: Base file schema definition

- **`lib/router/`**: Express router factory and handlers
  - `index.ts`: `createFileRouter` factory for creating file management routers
  - `handlersFactory.ts`: Route handler generators
  - `routerFactory.ts`: Router configuration and creation
  - `swaggerGenerator.ts`: Swagger documentation generator
  - `catchErrorWrapper.ts`: Error handling middleware

- **`lib/utils/`**: High-level utility functions
  - `index.ts`: File operations (upload, delete, replace, etc.)
  - Chunk operations (write, read, delete chunks)

### Key Design Patterns

1. **Factory Pattern**: Both `createFilesModel` and `createFileRouter` use factory functions for configuration
2. **Transaction Support**: MongoDB transactions for atomic operations (requires replica set)
3. **Automatic User Attribution**: Detects `req.user` and sets `uploadedBy` automatically
4. **Orphan Prevention**: Cleanup mechanisms for failed operations
5. **Swagger Integration**: Automatic OpenAPI documentation generation

## Development Commands

```bash
# Build the project
npm run build

# Run tests
npm test                    # Runs unit tests with tsx
npm run test-integration    # Runs integration tests with Jest

# Start the built application
npm start                   # Runs dist/index.js

# Build before publish
npm run prepack            # Automatically runs build before pack
```

## Important Implementation Details

### GridFS Initialization
Must call `initGridFS(mongoose.connection)` after connecting to MongoDB. This sets up the internal GridFS bucket used by all operations.

### Replica Set Requirement
Transaction operations (`replaceFilesWithTransaction`) require a MongoDB replica set. Refer to Mongoose documentation for setup.

### Collection Naming
- Models use `${collection}.files` and `${collection}.chunks` collections
- Mongoose model names are `${CapitalizedCollection}File` (e.g., "upload" → "UploadFile")

### Error Handling
- Batch operations return 207 Multi-Status with detailed success/error reporting
- Orphan chunks are cleaned up on metadata save failures
- File updates commit new data before deleting old data (no "missing file" window)

### Security Considerations
- Regex patterns in list endpoint can cause ReDoS - validate and limit patterns
- Implement pagination limits to prevent resource exhaustion
- Validate ObjectId parameters and sanitize user inputs
- Consider rate limiting at application level

### Automatic Features
- If middleware attaches `user` object to `req`, `uploadedBy` is automatically set
- Swagger documentation generated automatically when using `createFileRouter`
- Custom schema fields are merged into metadata in responses