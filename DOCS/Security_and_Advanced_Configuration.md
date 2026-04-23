# Security and Advanced Configuration

This document outlines areas where documentation should be enhanced to help developers use express-mongo-gridfs securely and effectively.

## 1. Security Configuration Guidelines

### 1.1 Regular Expression Search Security
- **Feature**: The list endpoint allows regex pattern matching for file discovery
- **Security Consideration**: Malicious regex patterns can cause ReDoS (Regular Expression Denial of Service)
- **Recommendation**: 
  - Validate and sanitize regex patterns before execution
  - Implement length limits for search patterns (recommended: ≤256 characters)
  - Use timeout mechanisms for regex execution
  - Document safe regex patterns and common dangerous patterns to avoid

### 1.2 Pagination Configuration
- **Feature**: The list endpoint supports pagination with `page` and `limit` parameters
- **Security Consideration**: Large limit values can cause resource exhaustion
- **Default Behavior**: Default page limit is 20 items per page
- **Configuration Option**: Library allows overriding max page size via configuration
- **Recommendation**:
  - Set appropriate max limits based on your application's needs
  - Document the trade-offs between usability and resource consumption
  - Consider implementing rate limiting at the application level

### 1.3 Input Validation
- **Feature**: Various endpoints accept user-provided data for filtering and searching
- **Security Consideration**: Unvalidated inputs can lead to injection attacks
- **Recommendation**:
  - Always validate ObjectId parameters using proper validation
  - Implement schema validation for custom metadata fields
  - Sanitize inputs before using them in database queries

## 2. Query Filters for Complex Data Types

### 2.1 Handling Array and Set Fields in Queries
- **Feature**: The list endpoint supports filtering by custom fields including complex data types like arrays and sets
- **Consideration**: When using fields that store arrays (like "tags"), the default query behavior may not suit all use cases
- **Solution**: Developers should implement custom validation and query transformation via middleware to handle complex data structures
- **Example Implementation**:
  ```javascript
  // Example: Custom middleware to handle 'tags' field as an array in queries
  const handleTagsQuery = (req, res, next) => {
    if (req.query && req.query.tags) {
      // If tags is a string, split it by commas to create an array for $in query
      if (typeof req.query.tags === 'string') {
        // Transform the query to match any of the provided tags
        req.query.tags = { $in: req.query.tags.split(',') };
      } else if (Array.isArray(req.query.tags)) {
        // If already an array, use $in to match any of the provided tags
        req.query.tags = { $in: req.query.tags };
      }
      // For more complex matching, like matching ALL tags, use $all instead:
      // req.query.tags = { $all: Array.isArray(req.query.tags) ? req.query.tags : req.query.tags.split(',') };
    }
    next();
  };

  // Apply the middleware to the list route
  const fileRouter = createFileRouter({
    model: UserDocs,
    routeMiddlewares: {
      list: [jwtAuthMiddleware, handleTagsQuery],  // Apply custom query handling
      // ... other middlewares
    }
  });
  ```
- **Recommendation**: For any complex data type fields in your schema, implement custom middleware to transform query parameters appropriately before they reach the library's handlers

## 3. Authorization and Middleware Integration

### 3.1 Authentication Separation
- **Design Principle**: The library separates authentication/authorization from business logic
- **Implementation**: Use the [routeMiddlewares](file://c:\Users\PC\Dev\NodeJs\express-mongo-gridfs\lib\router\routerFactory.ts#L18-L18) configuration option to integrate your authentication logic
- **Example Usage**:
  ```javascript
  const fileRouter = createFileRouter({
    model: UserDocs,
    routeMiddlewares: {
      upload: [jwtAuthMiddleware, userPermissionCheck],
      list: [jwtAuthMiddleware],
      download: [jwtAuthMiddleware, fileAccessCheck],
      update: [jwtAuthMiddleware, fileOwnershipCheck],
      delete: [jwtAuthMiddleware, fileOwnershipCheck]
    }
  });
  ```

### 3.2 Recommended Middleware Patterns
- **Rate Limiting**: Implement rate limiting to prevent abuse
- **File Size Validation**: Validate file sizes before processing
- **Content Type Validation**: Verify file types beyond client-provided MIME types
- **Access Control**: Check user permissions for file operations

## 4. Data Flow and Security Boundaries

### 4.1 Request Processing Flow
1. Request enters Express application
2. Authentication/authorization middleware validates access
3. Request reaches express-mongo-gridfs handlers
4. Library performs database/GridFS operations
5. Response is sent back through middleware chain

### 4.2 Security Boundary Clarification
- **Library Responsibility**: Safe handling of file operations, proper error handling, input sanitization
- **Application Responsibility**: User authentication, permission validation, rate limiting, audit logging
- **Shared Responsibility**: Input validation for custom schema fields

## 5. Configuration Best Practices

### 5.1 Multer Configuration
- **Memory vs Disk Storage**: Use disk storage for large files to prevent memory exhaustion
- **File Size Limits**: Set appropriate limits based on your application's needs
- **File Type Validation**: Implement strict MIME type validation using the `fileFilter` option

### 5.2 Schema Design
- **Custom Fields**: Carefully consider which fields to add to file schemas
- **Indexing**: Add appropriate indexes for frequently queried fields
- **Validation**: Implement server-side validation for custom fields

## 6. Common Attack Vectors and Mitigation

### 6.1 Denial of Service Prevention
- **Resource Exhaustion**: Implement rate limiting and appropriate pagination limits
- **Regex Complexity**: Limit regex pattern complexity and length
- **File Upload Limits**: Set appropriate file size and count limits

### 6.2 Information Disclosure
- **File Listing**: Be cautious about exposing file names in error messages
- **Search Functionality**: Consider implementing generic error responses
- **Metadata Access**: Validate that users can only access metadata for files they own/are authorized to see

## 7. Monitoring and Logging Recommendations

### 7.1 Key Metrics to Monitor
- File upload/download frequency and volume
- Error rates for different operations
- Response times for file operations
- Unauthorized access attempts

### 7.2 Audit Trail Requirements
- Log file access events
- Track user actions with timestamps
- Record file metadata changes
- Monitor unusual activity patterns

## 8. Upgrade and Maintenance Guidelines

### 8.1 Security Updates
- Regularly update dependencies
- Review security advisories for related packages
- Test upgrades in staging environments

### 8.2 Breaking Changes Communication
- Maintain clear changelog with security implications
- Provide migration guides for major version updates
- Document deprecated features with timelines