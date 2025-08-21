# vscode-haystack-search

## Overview
vscode-haystack-search is a Visual Studio Code extension that leverages Haystack to provide advanced file search capabilities. This extension allows users to perform efficient text searches across their project files, enhancing productivity and code navigation.

## Features
- Seamless integration with Haystack for high-performance search.
- Intuitive interface for searching text within files.
- Search results include file paths and matching line content.

## Usage
- After installing the extension, you can initiate a search by using the command palette (Ctrl+Shift+P) and selecting "Haystack Search".
- Enter your search query and view the results displayed in the search panel.

## Core search provider
Refer to: [github.com/ai-microsoft/haystack.git](https://github.com/ai-microsoft/haystack.git)

## Instructions to Build and Debug locally

### Setup
1. Clone the repository:
   ```
   git clone https://github.com/ai-microsoft/haystack-vscode.git
   ```
2. Navigate to the project directory:
   ```
   cd haystack-vscode
   ```
3. Install the dependencies:
   ```
   npm install
   ```

### Debugging
To ensure a smooth debugging experience, please follow these steps:
1. Open the project in Visual Studio Code.
2. Install the `Haystack Search` extension from the Marketplace and enable it.
3. In the terminal, run the following commands:
   ```bash
   cd haystack-vscode
   npm run watch
   ```
4. Press `F5` to launch the extension in debug mode.
   This will run the extension in an isolated environment while sharing the same background Haystack service as the installed extension.


## Contribution
Contributions are welcome! Please follow these steps to contribute:
1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them.
4. Push your branch and create a pull request.

## Automated Release Process
This project uses a GitHub Action workflow for automating the release process. The workflow:

1. Reads version and haystackVersion from package.json
2. Downloads platform-specific Haystack binaries based on haystackVersion
3. Builds platform-specific VS Code extension packages
4. Extracts changelog information for the current version
5. Creates a GitHub release with the generated extension packages
6. Creates a git tag for the release version

To trigger a new release:
1. Update the version in package.json
2. Update CHANGELOG.md with details about the new version
3. Go to GitHub Actions tab and manually trigger the "Release" workflow

The workflow will generate platform-specific extension packages for Windows, macOS, and Linux (both x64 and ARM64 architectures).
