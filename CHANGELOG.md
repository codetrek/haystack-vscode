# Changelog

## [next]
- Optimize UI: change fonts, narrow paddings, more space for contents, fix loading state

## [1.2.0]

- Improved the search functionality to index and search across multiple workspace folders and aggregate results.
- Enhanced the UI to clearly indicate the workspace origin of each search result.
- Improved file path resolution for better navigation between workspaces.
- Enhanced error handling for workspace-specific failures.
- Added collapsible sections for search results to manage large result sets more effectively.
- Improved the search cancellation process to ensure all searches are stopped correctly.
- Skipped the updates in .code-workspace file to avoid unnecessary reloads.
- Upgrade haystack core to v1.4.0:
  - Breaking change: Upgrade storage version to 1.2
  - Make inverted index engine as a separated components
  - Make "debug/", "release/" as default exclude pattern while scaning
  - 10X+ Speed up multiparts search, like: `"class BookmarkModel"`, `obj->func()`, `EventType::kGestureTap`
  - Supports finding substrings within CamelCase identifiers (e.g., `bookmarkbar` in `UpdateBookmarkBarIfNecessary`).
  - Support leading special characters (e.g., `->AddBookmark`).

## [1.1.5]

- Improve the performance of click go to search result.
- Upgrade haystack core to v1.3.0

## [1.1.4]

- Bugfix: upgrade haystack core may failed.

## [1.1.3]

- Upgrade haystack core to v1.2.6
- Streaming search result
- Increase maximum search result
- Sort documents while searching

## [1.1.2]

- Remove default keybind CTRL+SHIFT+F, as it's the VSCode's top popular keyboard shortcut.

## [1.1.1]

- Upgrade haystack core to v1.2.3, a critical bugfix: MCP connection will lost after a short while

## [1.1.0]

- Upgrade haystack core to v1.2.2
- Bugfix: Unable to upgrade haystack core while server is running
- Add a button to start server if stopped.
- Add more settings

## [1.0.5]

- Bugfix: Low contrast resulting in unintelligible texts in the search result
- Bugfix: Unable to start server on MacOS
- Quick update status bar while server is initializing, downloading, starting.
- Try at most 10 times to start the Haystack server
- Try at most 3 times to download Haystack server
