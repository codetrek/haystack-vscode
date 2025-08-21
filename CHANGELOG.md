# Changelog

## [1.6.0] - 2025/08/21

- Upgrade haystack core to 1.8.0
  - Breaking change: Upgrade storage version to 1.4
  - Optimize: disk usage dropped ~40%, index time reduce ~20%

## [1.5.0] - 2025/07/21

- feat: implement whole word search functionality.
- feat: live re-search for modified files in search result.
- feat: search result highlighting in editors.
- Add more telemetry.
- Some bug fixes.
- Upgrade haystack core to 1.7.0 (including 1.6.0)
  - feat: implement whole word matching feature
  - feat: implement unsaved-files-only search optimization for better search performance
  - fix: Make file include/exclude patterns case-insensitive
  - Support streamable-http at endpoint `http://localhost:<port>/mcp`

## [1.4.0] - 2025/06/27

- Search results now include changes from unsaved files.
- Search function & files now support multiple folders in workspace.
- Add telemetry.
- Upgrade haystack core to 1.5.2
  - Search results now include changes from unsaved files.
  - Increase max indexiable file size to 5MiB.
  - Bugfix: There will be no result if a file is passed in 'path' filter

## [1.3.1] - 2025/06/20

- Fix Language Model Tool API register issue

## [1.3.0] - 2025/06/19

- Feat: Enable function search by default
- Feat: Enable file search by default
- Upgrade haystack core to 1.5.1
  - Breaking change: Upgrade storage version to 1.3
  - Bugfix: Path filter with "\" seperate returns no result.
  - Optimize: Output search result in a single text block to improve GHC performance
  - Feat: Support Unix domain socket for Non-Windows platform
  - Feat: CTags based function parse and search
- Integrate with Github using Language Model Tool API
- Using domain socket to communicate with haystack core on Non-windows
- Refactor using React

## [1.2.1] - 2025/06/05

- Optimize UI: change fonts, narrow paddings, more space for contents, fix loading state
- Upgrade haystack core to 1.4.1
  - Optimize wildcard search(e.g.: `microsoft*bookmark`), up to 5X+ speed up for cases.
  - Bugfix: active & open files should be search first
  - Optimize: dedup keywords with prefix
- Added `haystack.searchFiles` command to support fuzzy match for quick file opening

## [1.2.0] - 2025/05/22

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

## [1.1.5] - 2025/05/15

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
