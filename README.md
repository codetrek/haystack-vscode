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

### Package and Share the Extension Offline
To manually package the extension for offline use, follow these steps:
1. #### Create `pkg` Directory.
   In the root of your workspace, create a folder named `pkgs`:
   ```
   cd haystack-vscode
   mkdir pkgs
   ```
2. #### Check the Required Haystack Core Version.
   Open `package.json` and locate the `haystackVersion` field. For example:
   ```json
   {
      // ...
      "haystackVersion": "1.2.6",
      // ...
   }
   ```
3. #### Download the Required Haystack Release.
   Visit [Haystack Releases](https://github.com/ai-microsoft/haystack/releases) page and find the version that matches the one in `package.json`.
4. #### Save the Binary
   Download the binary for your target platform and place it in the `pkgs` folder:
   ```text
      haystack-vscode
      ├─ src/
      ├─ resource/
      └─ pkgs/
         ├─ haystack-darwin-amd64-v1.2.6.zip
         ├─ haystack-darwin-arm64-v1.2.6.zip
         ├─ haystack-windows-amd64-v1.2.6.zip
         ├─ haystack-windows-arm64-v1.2.6.zip
         ├─ ...
      ...
   ```
5. #### Build the Extension
   In your terminal, run:
   ```bash
   npm run build
   ```
   This will generate the extension package file in the project root directory as `haystack-search-*.vsix`.

## Contribution
Contributions are welcome! Please follow these steps to contribute:
1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them.
4. Push your branch and create a pull request.
