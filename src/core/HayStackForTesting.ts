import { AxiosResponse } from 'axios';
import { IHaystack, Status, DownloadProgress, InstallStatus } from './IHaystack';
import { EventEmitter } from 'events';
import {
  SearchContentResult,
  SymbolsContentResults,
  SearchFilesResult,
  SearchContentRequest,
} from '../types/search';

interface HaystackResponseData {
  code: number;
  message?: string;
  data?: unknown;
}

/**
 *  while testing Haystack E2E, we avoid relying on Haystack to increase the chances of test success.
 *  The correctness of Haystack interfaces is guaranteed by the core tests.
 *  This class implements the IHaystack interface and provides mock implementations for its methods.
 */
export class HayStackForTesting extends EventEmitter implements IHaystack {
  connected = true;
  private status: Status = 'running';
  private downloadProgress: DownloadProgress = {
    url: '',
    totalSize: 0,
    downloadedSize: 0,
    percent: 0,
  };
  private retryCount = 0;
  private installStatus: InstallStatus = 'installed';

  post(_uri: string, _data: unknown): Promise<AxiosResponse<unknown, unknown>> {
    // Mock different responses based on the URI
    let mockResponseData: HaystackResponseData = { code: 0, message: 'Success' };

    if (_uri.includes('/workspace/create')) {
      mockResponseData = {
        code: 0,
        message: 'Workspace created successfully',
        data: {},
      };
    } else if (_uri.includes('/document/update')) {
      mockResponseData = {
        code: 0,
        message: 'Document updated successfully',
        data: {},
      };
    } else if (_uri.includes('/document/delete')) {
      mockResponseData = {
        code: 0,
        message: 'Document deleted successfully',
        data: {},
      };
    } else if (_uri.includes('/workspace/get')) {
      mockResponseData = {
        code: 0,
        message: 'Success',
        data: {
          indexing: false,
          total_files: 100,
          indexed_files: 100,
        },
      };
    } else if (_uri.includes('/workspace/update')) {
      mockResponseData = {
        code: 0,
        message: 'Workspace updated successfully',
        data: {},
      };
    } else if (_uri.includes('/workspace/sync')) {
      mockResponseData = {
        code: 0,
        message: 'Workspace synced successfully',
        data: {},
      };
    } else if (_uri.includes('/search/symbols')) {
      const symbolsData: SymbolsContentResults = {
        query: 'test',
        symbols: [
          {
            name: 'testFunction',
            files: [
              { path: '/test/file.ts', line: 10 },
              { path: '/test/another.ts', line: 25 },
            ],
          },
        ],
      };
      mockResponseData = {
        code: 0,
        message: 'Success',
        data: symbolsData,
      };
    } else if (_uri.includes('/search/files')) {
      const filesData: SearchFilesResult = {
        query: 'test',
        results: ['/test/file1.ts', '/test/file2.js', '/test/component.tsx'],
      };
      mockResponseData = {
        code: 0,
        message: 'Success',
        data: filesData,
      };
    } else {
      // Default response
      mockResponseData = {
        code: 0,
        message: 'Success',
        data: {},
      };
    }
    return Promise.resolve({
      data: mockResponseData,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    }) as Promise<AxiosResponse<unknown, unknown>>;
  }

  postStream(_uri: string, _data: SearchContentRequest): Promise<ReadableStream<Uint8Array>> {
    if (_uri.includes('/search/content')) {
      const searchQuery = _data.query || '';
      let mockResults: SearchContentResult[] = [];

      // Route to different test data based on search query markers
      // 2 files, 2 results
      if (searchQuery.includes('[test:case-sensitive]')) {
        mockResults = this.getCaseSensitiveTestData(_data);
      } else if (searchQuery.includes('[test:file-filter]')) {
        mockResults = this.getFileFilterTestData(_data);
      } else if (searchQuery.includes('[test:empty-results]')) {
        mockResults = [];
      } else if (searchQuery.includes('[test:pending-forever]')) {
        // Test case: Search stays pending forever (never resolves)
        return new Promise(() => {
          // This promise never resolves, simulating a pending search
        });
      } else if (searchQuery.includes('[test:infinite-stream]')) {
        // Test case: Search continuously outputs results without finishing
        return Promise.resolve(this.createInfiniteStream(_data));
      } else {
        // Default test data for general testing
        // 3 files, 3 results
        mockResults = this.getDefaultTestData(_data);
      }

      return Promise.resolve(this.createMockStream(mockResults));
    } else {
      return Promise.reject(new Error('Unsupported URI for postStream'));
    }
  }

  private getCaseSensitiveTestData(_data: SearchContentRequest): SearchContentResult[] {
    const baseResults = [
      {
        file: '/test/CamelCase.ts',
        lines: [
          {
            line: { line_number: 1, content: 'function testFunction() {', match: [9, 21] },
            before: [{ line_number: 0, content: '// CamelCase file' }],
            after: [{ line_number: 2, content: '  return "test";' }],
          },
        ],
        truncate: false,
      },
      {
        file: '/test/lowercase.js',
        lines: [
          {
            line: { line_number: 2, content: 'const testfunction = () => {};', match: [6, 18] },
            before: [{ line_number: 1, content: '// lowercase file' }],
            after: [{ line_number: 3, content: 'export default testfunction;' }],
          },
        ],
        truncate: false,
      },
      {
        file: '/test/UPPERCASE.js',
        lines: [
          {
            line: { line_number: 3, content: 'var TESTFUNCTION = function() {};', match: [4, 16] },
            before: [{ line_number: 2, content: '// UPPERCASE file' }],
            after: [{ line_number: 4, content: 'module.exports = TESTFUNCTION;' }],
          },
        ],
        truncate: false,
      },
    ];

    // If case sensitive is enabled, filter for exact matches only
    if (_data.case_sensitive) {
      // Assuming search term is "testFunction" (exact case)
      return baseResults.filter((result) => result.lines[0].line.content.includes('testFunction'));
    }

    // Case insensitive: return all variants
    return baseResults;
  }

  private getFileFilterTestData(_data: SearchContentRequest): SearchContentResult[] {
    const allResults = [
      {
        file: '/src/components/Button.tsx',
        lines: [
          {
            line: { line_number: 10, content: 'export const Button = () => {', match: [13, 19] },
            before: [{ line_number: 9, content: 'import React from "react";' }],
            after: [{ line_number: 11, content: '  return <button>Click</button>;' }],
          },
        ],
        truncate: false,
      },
      {
        file: '/src/utils/helper.ts',
        lines: [
          {
            line: { line_number: 5, content: 'function helper() {', match: [9, 15] },
            before: [{ line_number: 4, content: '// Utility functions' }],
            after: [{ line_number: 6, content: '  return "help";' }],
          },
        ],
        truncate: false,
      },
      {
        file: '/tests/unit/button.test.ts',
        lines: [
          {
            line: { line_number: 15, content: 'describe("Button", () => {', match: [10, 16] },
            before: [{ line_number: 14, content: 'import { Button } from "../Button";' }],
            after: [{ line_number: 16, content: '  it("should render", () => {' }],
          },
        ],
        truncate: false,
      },
      {
        file: '/node_modules/react/index.js',
        lines: [
          {
            line: { line_number: 100, content: 'exports.Button = Button;', match: [8, 14] },
            before: [{ line_number: 99, content: '// React exports' }],
            after: [{ line_number: 101, content: 'exports.Component = Component;' }],
          },
        ],
        truncate: false,
      },
    ];

    let filteredResults = [...allResults];

    // Apply include filter
    if (_data.filters?.include) {
      filteredResults = filteredResults.filter((result) =>
        result.file.includes(_data.filters!.include!),
      );
    }

    // Apply exclude filter
    if (_data.filters?.exclude) {
      filteredResults = filteredResults.filter(
        (result) => !result.file.includes(_data.filters!.exclude!),
      );
    }

    return filteredResults;
  }

  private getDefaultTestData(_data: SearchContentRequest): SearchContentResult[] {
    const allMockResults: SearchContentResult[] = [
      {
        file: '/test/sample.ts',
        lines: [
          {
            line: { line_number: 10, content: 'function testFunction() {', match: [9, 21] },
            before: [{ line_number: 9, content: '// Test function' }],
            after: [
              { line_number: 11, content: '  return "test";' },
              { line_number: 12, content: '}' },
            ],
          },
        ],
        truncate: false,
      },
      {
        file: '/test/another.js',
        lines: [
          {
            line: { line_number: 5, content: 'const test = "example";', match: [6, 10] },
          },
        ],
        truncate: false,
      },
      {
        file: '/test/another-another.js',
        lines: [
          {
            line: {
              line_number: 5,
              content: `const anotherTest = "example"; // Another test`,
              match: [6, 10],
            },
          },
        ],
        truncate: false,
      },
    ];

    return allMockResults;
  }

  private createMockStream(results: SearchContentResult[]): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();

        // Send mock results
        results.forEach((result) => {
          const eventData = `event: result\ndata: ${JSON.stringify(result)}\n\n`;
          controller.enqueue(encoder.encode(eventData));
        });

        // Send done event
        const doneEvent = `event: done\ndata: {"total": ${results.length}}\n\n`;
        controller.enqueue(encoder.encode(doneEvent));

        // Close the stream
        controller.close();
      },
    });
  }
  private createInfiniteStream(_data: SearchContentRequest): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        let counter = 0;

        // Send mock results continuously without ever sending done
        const sendResult = () => {
          counter++;
          const mockResult: SearchContentResult = {
            file: `test/infinite-file-${counter}.ts`,
            lines: [
              {
                line: {
                  line_number: counter,
                  content: `Infinite result ${counter} - This is a test line that keeps generating`,
                  match: [0, 15], // Highlight "Infinite result"
                },
                before:
                  counter > 1
                    ? [{ line_number: counter - 1, content: `Previous line ${counter - 1}` }]
                    : undefined,
                after: [{ line_number: counter + 1, content: `Next line ${counter + 1}` }],
              },
            ],
            truncate: false,
          };

          const eventData = `event: result\ndata: ${JSON.stringify(mockResult)}\n\n`;
          controller.enqueue(encoder.encode(eventData));

          // Schedule next result after a delay
          setTimeout(sendResult, 500); // Send a new result every 500ms
        };

        // Start sending results
        sendResult();

        // Note: We never call controller.close() or send done event
        // This simulates an infinite stream that never completes
      },
    });
  }

  getCurrentPlatform(): string {
    return 'test-platform';
  }

  getStatus() {
    return this.status;
  }

  getDownloadProgress(): DownloadProgress {
    return this.downloadProgress;
  }

  getRetryCount() {
    return this.retryCount;
  }

  getInstallStatus() {
    return this.installStatus;
  }

  getIsSupported() {
    return true;
  }

  startServer() {
    this.status = 'running';
    this.connected = true;
    return true;
  }
}
