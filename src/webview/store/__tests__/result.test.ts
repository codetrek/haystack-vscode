import * as assert from 'assert';
import { beforeEach } from 'mocha';
import {
  resetResult,
  setSearchCancelled,
  result,
  setSearchLoading,
  setSearchError,
  setSearchDone,
  setSearchStream,
  resultCounter,
  summary,
} from '../result';
import { getStreamData } from './data';

suite('Result Store', () => {
  // Reset the result store before each test
  beforeEach(() => {
    resetResult();
  });

  test('change result status correctly', () => {
    assert.strictEqual(result.status, 'idle');
    assert.strictEqual(result.searchSummary, '');
  });

  test('reset result status', () => {
    resetResult();
    assert.strictEqual(result.status, 'idle');
    assert.strictEqual(result.searchSummary, '');
  });

  test('set result status to cancelled', () => {
    setSearchCancelled();
    assert.strictEqual(result.status, 'cancelled');
    assert.match(result.searchSummary, /cancelled/);
  });

  test('set result status to loading', () => {
    setSearchLoading();
    assert.strictEqual(result.status, 'loading');
    assert.strictEqual(result.searchSummary, 'Searching...');
  });

  test('set result status to error', () => {
    setSearchError('An error occurred');
    assert.strictEqual(result.status, 'error');
    assert.strictEqual(result.errorMessage, 'An error occurred');
  });

  test('set result status to done', () => {
    setSearchDone();
    assert.strictEqual(result.status, 'done');
    assert.strictEqual(result.searchSummary, 'No results found');
  });

  test('set result stream data', async () => {
    const data = getStreamData();
    setSearchStream(data);
    // Status should remain 'idle' since setSearchStream no longer changes status
    // Normal flow: setSearchLoading() -> setSearchStream() -> setSearchDone()
    // Here we only call setSearchStream() without calling setSearchLoading() first,
    // so the status should remain at the initial 'idle' state. This aligns with the new design:
    // - setSearchStream() only updates search result data, doesn't change search status
    // - Status management is handled exclusively by setSearchLoading() and setSearchDone()
    assert.strictEqual(result.status, 'idle');
    assert.strictEqual(
      result.results['/home/developer/my-react-app'].workspaceName,
      'my-react-app',
    );
    // the key of workspace and file should be normalized
    assert.strictEqual(result.results['/home/developer/my-react-app'].count, 2);

    assert.strictEqual(
      result.results['/home/developer/my-react-app'].files['src/components/userprofile.tsx'].count,
      2,
    );
    // the derived data update asynchronously, so we need to wait a bit
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(resultCounter.totalFiles, 1);
    assert.strictEqual(resultCounter.matchedLines, 2);
    // In idle status, summary should be empty
    assert.strictEqual(summary.content, '');
  });

  test('set result status to done after setting stream data', async () => {
    const data = getStreamData();
    setSearchStream(data);
    // Wait for derive to update before calling setSearchDone
    await new Promise((resolve) => setTimeout(resolve, 50));
    setSearchDone();
    assert.strictEqual(result.status, 'done');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(summary.content, '2 results in 1 files');
  });

  test('set result stream data while searching', async () => {
    // Start search first
    setSearchLoading();
    const data = getStreamData();
    setSearchStream(data);
    assert.strictEqual(result.status, 'loading');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(summary.content, '2 results in 1 files (searching...)');
  });
});
