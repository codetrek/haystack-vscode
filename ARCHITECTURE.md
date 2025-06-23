# Haystack-VSCode Architecture

## Overview

Haystack-VSCode is a Visual Studio Code extension that integrates with the Haystack search service to provide advanced file search capabilities. The extension follows a client-server architecture where the VS Code extension acts as a client communicating with the Haystack server via HTTP API.

## Architecture Components

### 1. Core Components

#### Haystack Core Manager (`Haystack.ts`)
- **Purpose**: Manages the Haystack binary installation, server lifecycle, and HTTP communication
- **Key Responsibilities**:
  - Automatic binary download and installation for supported platforms
  - Server startup, shutdown, and health monitoring
  - HTTP client management with axios
  - Platform detection and compatibility checking
  - Version management and compatibility validation

#### Haystack Provider (`HaystackProvider.ts`)
- **Purpose**: High-level API wrapper that provides workspace management and search operations
- **Key Responsibilities**:
  - Workspace creation, synchronization, and management
  - File change monitoring and real-time index updates
  - Search request handling and result processing
  - Multi-workspace coordination
  - Configuration management

#### Search View Provider (`SearchViewProvider.ts`)
- **Purpose**: Manages the webview-based search interface
- **Key Responsibilities**:
  - Webview lifecycle management
  - Message pipeline between extension and webview
  - Status bar updates and user feedback
  - Search command integration

### 2. Communication Architecture

#### HTTP API Communication
- **Base URL**: `http://127.0.0.1:13135` (local) or `http://localhost:13134` (remote)
- **API Version**: `/api/v1`
- **Connection Types**:
  - TCP connection for local and remote environments
  - Unix socket support for non-Windows platforms

#### API Endpoints
- `POST /api/v1/workspace/create` - Create new workspace
- `POST /api/v1/workspace/update` - Update workspace documents
- `POST /api/v1/workspace/sync` - Synchronize workspace
- `POST /api/v1/search/content` - Content search with streaming
- `POST /api/v1/search/symbols` - Symbol search
- `POST /api/v1/search/files` - File search

#### Server-Sent Events (SSE)
- **Purpose**: Real-time search result streaming
- **Event Types**:
  - `result` - Individual search result
  - `done` - Search completion notification
- **Data Format**: JSON payloads with file paths, line matches, and context

### 3. Multi-Workspace Management

#### Workspace Detection
- **Source**: VS Code workspace folders
- **Storage**: In-memory array of workspace root paths
- **Dynamic Updates**: Real-time listening to workspace folder changes

#### Workspace Lifecycle
1. **Initialization**: Extract all workspace folder paths on extension activation
2. **Addition**: Automatically create Haystack workspaces for new folders
3. **Removal**: Clean up resources when folders are removed
4. **Synchronization**: Periodic and on-demand workspace sync

#### Workspace Isolation
- **Independent Indexes**: Each workspace has separate document and symbol indexes
- **Independent Configuration**: Per-workspace filter settings
- **Independent State**: Separate indexing status and file counts

### 4. Search Implementation

#### Search Flow
1. **Query Processing**: Parse search query and options
2. **Workspace Selection**: Determine target workspaces (specific or all)
3. **Parallel Execution**: Search across multiple workspaces concurrently
4. **Result Aggregation**: Collect and deduplicate results
5. **Streaming Delivery**: Send results via SSE to webview

#### Search Options
- **Case Sensitivity**: Configurable case-sensitive matching
- **File Filters**: Include/exclude patterns
- **Result Limits**: Global and per-file result limits
- **Context Lines**: Before/after context for matches
- **Workspace Scope**: Search specific workspace or all workspaces

#### Result Processing
- **Real-time Streaming**: Results delivered as they're found
- **Global Limits**: Enforce maximum result counts across all workspaces
- **Truncation Handling**: Mark results as truncated when limits exceeded
- **Error Handling**: Graceful handling of workspace-specific errors

### 5. File Synchronization

#### Change Detection
- **File Save Events**: Monitor `onDidSaveTextDocument`
- **File Creation**: Monitor `onDidCreateFiles`
- **File Deletion**: Monitor `onDidDeleteFiles`
- **Debouncing**: 500ms delay to prevent excessive updates

#### Update Strategy
- **Relative Paths**: Convert absolute paths to workspace-relative paths
- **Workspace Routing**: Route updates to correct workspace
- **Batch Processing**: Group multiple changes when possible
- **Error Recovery**: Handle file access errors gracefully

#### Index Management
- **Incremental Updates**: Only update changed files
- **Document Tracking**: Maintain document ID mappings
- **Symbol Updates**: Update symbol indexes when files change
- **Cleanup**: Remove deleted files from indexes

### 6. Configuration Management

#### Extension Configuration
- **Search Limits**: Maximum results and results per file
- **Filter Settings**: Global include/exclude patterns
- **Git Integration**: Use .gitignore for exclusions
- **Workspace Scoping**: Per-workspace configuration inheritance

#### Configuration Change Handling
- **Change Detection**: Monitor VS Code configuration changes
- **Scope Awareness**: Detect workspace-specific vs global changes
- **Re-sync Trigger**: Automatically re-sync when relevant settings change
- **Validation**: Ensure configuration changes are valid

### 7. User Interface Integration

#### Webview Communication
- **Message Pipeline**: Bidirectional communication between extension and webview
- **Event Handling**: Process search, file opening, and UI events
- **State Management**: Maintain search state and UI state
- **Error Display**: Show errors and status messages

#### Command Integration
- **Search Commands**: Search selected text, function symbols, files
- **Workspace Commands**: Sync workspace, start server
- **Context Menus**: Right-click integration for search actions
- **Keyboard Shortcuts**: Customizable key bindings

#### Status Bar Integration
- **Server Status**: Show connection and server state
- **Indexing Progress**: Display indexing status and progress
- **Search Status**: Indicate active searches
- **Error States**: Show error messages and recovery options

### 8. Error Handling and Recovery

#### Connection Management
- **Automatic Retry**: Retry failed connections with exponential backoff
- **Status Monitoring**: Continuous health checking
- **Graceful Degradation**: Continue operation when possible
- **User Feedback**: Clear error messages and recovery instructions

#### Search Error Handling
- **Partial Results**: Return available results even if some workspaces fail
- **Timeout Management**: Handle search timeouts gracefully
- **Cancellation**: Support search cancellation and cleanup
- **Error Reporting**: Log errors for debugging

#### File System Errors
- **Permission Handling**: Handle file access permission errors
- **Missing Files**: Handle deleted or moved files
- **Network Issues**: Handle remote workspace connectivity issues
- **Recovery**: Automatic retry and fallback mechanisms

### 9. Performance Considerations

#### Caching Strategy
- **Workspace Metadata**: Cache workspace information
- **Configuration**: Cache configuration values
- **Connection Pooling**: Reuse HTTP connections
- **Result Caching**: Cache recent search results

#### Resource Management
- **Memory Usage**: Monitor and limit memory consumption
- **File Handles**: Proper file handle cleanup
- **Network Connections**: Connection pooling and cleanup
- **Background Tasks**: Manage background indexing tasks

#### Scalability
- **Large Workspaces**: Handle workspaces with thousands of files
- **Multiple Workspaces**: Efficient multi-workspace operations
- **Concurrent Searches**: Support multiple simultaneous searches
- **Real-time Updates**: Efficient file change processing

### 10. Security Considerations

#### File Access
- **Workspace Scoping**: Only access files within workspace boundaries
- **Permission Validation**: Verify file access permissions
- **Path Sanitization**: Prevent path traversal attacks
- **Content Filtering**: Filter sensitive file types

#### Network Security
- **Local Communication**: Use localhost for local connections
- **Authentication**: No authentication required for local connections
- **Data Privacy**: Search data stays local
- **Secure Protocols**: Use HTTPS for remote connections when available

## Data Flow

### Search Request Flow
1. User enters search query in webview
2. Webview sends search message to extension
3. Extension validates query and determines target workspaces
4. Extension sends HTTP request to Haystack server
5. Server processes search and returns SSE stream
6. Extension processes SSE events and forwards to webview
7. Webview displays results in real-time

### File Update Flow
1. VS Code detects file change event
2. Extension determines affected workspace
3. Extension reads file content and calculates relative path
4. Extension sends update request to Haystack server
5. Server updates document index
6. Server updates symbol index if needed
7. Extension confirms update completion

### Workspace Management Flow
1. VS Code workspace folder changes detected
2. Extension updates internal workspace list
3. For new folders: create Haystack workspace
4. For removed folders: cleanup resources
5. Extension triggers workspace synchronization
6. Server indexes workspace files
7. Extension updates status and UI

## Integration Points

### VS Code Integration
- **Extension API**: Uses VS Code extension API for workspace management
- **File System API**: Uses VS Code file system API for file operations
- **Webview API**: Uses VS Code webview API for UI
- **Configuration API**: Uses VS Code configuration API for settings

### Haystack Server Integration
- **HTTP API**: RESTful API for workspace and search operations
- **SSE Protocol**: Server-sent events for real-time results
- **Binary Management**: Automatic download and execution of Haystack binary
- **Process Management**: Start, stop, and monitor Haystack server process

### Platform Integration
- **Cross-platform Support**: Windows, macOS, Linux (x64 and ARM64)
- **Architecture Detection**: Automatic platform and architecture detection
- **Binary Distribution**: Platform-specific binary downloads
- **Path Handling**: Cross-platform path normalization

This architecture provides a robust, scalable, and user-friendly integration between VS Code and the Haystack search service, enabling efficient code search across multiple workspaces with real-time updates and comprehensive error handling.
