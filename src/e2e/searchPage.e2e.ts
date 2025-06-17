import {
  Workbench,
  EditorView,
  WebviewView,
  By,
  VSBrowser,
  InputBox,
} from 'vscode-extension-tester';
import { before, after, afterEach } from 'mocha';
import * as path from 'path';
import * as assert from 'assert';
import { sleep, clearInputText, verifyRenderResults } from './fixture';

describe('Haystack Search View Test', function () {
  this.retries(3);
  this.timeout(20e3);
  let view: WebviewView;

  before(async () => {
    // open a sample web view
    await new Workbench().executeCommand('Haystack: Focus on Search View');
    // wait for the page to load
    await sleep(500);
    // init the WebView page object
    view = new WebviewView();
    await view.switchToFrame();
  });

  after(async () => {
    // after we are done with the webview, switch webdriver back to the vscode window
    await view.switchBack();
    await new EditorView().closeAllEditors();
  });

  it('should render search text input element correctly', async () => {
    // 1. get element
    const input = await view.findWebElement(By.id('searchInput'));
    await assert.rejects(
      () => view.findWebElement(By.id('clearTextBtn')),
      'Clear text button should not be present initially',
    );
    assert.ok(input, 'Search input element should be rendered');
    assert.ok(await input.isDisplayed(), 'Search input should be visible');
    const placeholder = await input.getAttribute('placeholder');
    assert.strictEqual(placeholder, 'Search in files...');

    // 2. typing
    await input.sendKeys('test search');
    const value = await input.getAttribute('value');
    assert.strictEqual(value, 'test search', 'Search input should contain the text "test search"');

    // 3. clear text
    const clearButton = await view.findWebElement(By.id('clearTextBtn'));
    assert.ok(
      await clearButton.isDisplayed(),
      'Clear text button should be visible after input text',
    );
    await clearButton.click();
    const clearedValue = await input.getAttribute('value');
    assert.strictEqual(clearedValue, '', 'Search input should be empty after clearing text');
    await assert.rejects(
      () => view.findWebElement(By.id('clearTextBtn')),
      'Clear text button should not be present after clearing input',
    );
  });

  it('should toggle sensitivity button correctly', async () => {
    // 1. verify sensitivity toggle is off initially
    const sensitivityToggle = await view.findWebElement(By.id('caseSensitiveBtn'));
    assert.ok(sensitivityToggle, 'Sensitivity toggle should be rendered');
    assert.ok(await sensitivityToggle.isDisplayed(), 'Sensitivity toggle should be visible');
    assert.doesNotMatch(
      await sensitivityToggle.getAttribute('class'),
      /\bactive\b/,
      'Sensitivity toggle should be off initially',
    );

    // 2. toggle sensitivity
    await sensitivityToggle.click();
    assert.match(
      await sensitivityToggle.getAttribute('class'),
      /\bactive\b/,
      'Sensitivity toggle should be on after clicking',
    );

    // 3. toggle again to turn off
    await sensitivityToggle.click();
    assert.doesNotMatch(
      await sensitivityToggle.getAttribute('class'),
      /\bactive\b/,
      'Sensitivity toggle should be off initially',
    );
  });

  it('should toggle search options input correctly', async () => {
    // 1. verify search options are not visible initially
    await assert.rejects(
      () => view.findWebElement(By.id('includeFiles')),
      'Include files input should not be visible initially',
    );
    await assert.rejects(
      () => view.findWebElement(By.id('excludeFiles')),
      'Exclude files input should not be visible initially',
    );

    // 2. toggle search options
    const toggleButton = await view.findWebElement(By.id('optionsToggle'));
    assert.ok(toggleButton, 'Toggle button should be rendered');
    assert.ok(await toggleButton.isDisplayed(), 'Toggle button should be visible');
    await toggleButton.click();

    // 3. verify search options are visible after toggle
    const includeFilesInput = await view.findWebElement(By.id('includeFiles'));
    const excludeFilesInput = await view.findWebElement(By.id('excludeFiles'));
    assert.ok(
      await includeFilesInput.isDisplayed(),
      'Include files input should be visible after toggle',
    );
    assert.ok(
      await excludeFilesInput.isDisplayed(),
      'Exclude files input should be visible after toggle',
    );

    // 4. toggle again to hide options
    await toggleButton.click();
    await assert.rejects(
      () => view.findWebElement(By.id('includeFiles')),
      'Include files input should not be visible after toggling off',
    );
    await assert.rejects(
      () => view.findWebElement(By.id('excludeFiles')),
      'Exclude files input should not be visible after toggling off',
    );
  });
});

describe('Haystack Search Test', function () {
  this.retries(3);
  this.timeout(20e3);
  let view: WebviewView;

  before(async () => {
    // haystack must be running in a workspace.
    await VSBrowser.instance.openResources(path.resolve(__dirname));
    await new Workbench().executeCommand('Haystack: Focus on Search View');
    await sleep(500);
    view = new WebviewView();
    await view.switchToFrame();
  });

  after(async () => {
    // after we are done with the webview, switch webdriver back to the vscode window
    await view.switchBack();
    await new EditorView().closeAllEditors();
  });

  afterEach(async () => {
    // clear search input after each test
    const clearBtn = await view.findWebElements(By.id('clearTextBtn'));
    if (clearBtn.length > 0) {
      await clearBtn[0].click();
      await sleep(500); // wait for the input to clear
      await assert.rejects(
        () => view.findWebElement(By.id('workspace-group')),
        'Workspace group should not be removed after clearing input',
      );
    }
    // ensure search options are closed
    const sensitivityToggle = await view.findWebElement(By.id('caseSensitiveBtn'));
    if ((await sensitivityToggle.getAttribute('class')).includes('active')) {
      await sensitivityToggle.click(); // ensure sensitivity is off
    }
    const optionsToggle = await view.findWebElement(By.id('optionsToggle'));
    if ((await optionsToggle.getAttribute('class')).includes('active')) {
      await clearInputText(await view.findWebElement(By.id('includeFiles')));
      await clearInputText(await view.findWebElement(By.id('excludeFiles')));
      await optionsToggle.click(); // ensure options are closed
    }
  });

  it('should basic search work correctly', async () => {
    // 1. input & trigger search - using default test data
    const input = await view.findWebElement(By.id('searchInput'));
    await input.sendKeys('test search');
    await input.sendKeys('\n'); // simulate Enter key to trigger search

    // 2. wait for search results to load
    await sleep(500);

    // 3. verify search result container is rendered
    // these ui elements are rendered based on the default mock data in HaystackForTesting.ts
    await verifyRenderResults(view, 1, 3, 3);

    // 4. clear search input
    const clearButton = await view.findWebElement(By.id('clearTextBtn'));
    assert.ok(await clearButton.isDisplayed(), 'Clear text button should be visible');
    await clearButton.click();
    await assert.rejects(
      () => view.findWebElement(By.id('workspace-group')),
      'Workspace group should not be removed after clearing input',
    );
  });

  // it.only('should search result is empty correctly', async function () {
  //   this.timeout(100000);
  //   // 1. input & trigger search - using file name test data
  //   const input = await view.findWebElement(By.id('searchInput'));
  //   await input.sendKeys('[test:empty-results] Button');
  //   await input.sendKeys('\n'); // simulate Enter key to trigger search

  //   // 2. wait for search results to load
  //   await sleep(200);
  //   await sleep(100000);
  //   // 3. verify search result container is rendered
  //   await verifyRenderResults(view, 0, 0, 0);
  // });

  it('should search with case sensitivity work correctly', async () => {
    // 1. input & trigger search - using case-sensitive test data
    const input = await view.findWebElement(By.id('searchInput'));
    await input.sendKeys('[test:case-sensitive] testFunction');
    const sensitivityToggle = await view.findWebElement(By.id('caseSensitiveBtn'));
    await sensitivityToggle.click(); // enable case sensitivity
    await input.sendKeys('\n'); // simulate Enter key to trigger search

    // 2. wait for search results to load
    await sleep(500);
    // 3. verify search result container is rendered
    await verifyRenderResults(view, 1, 1, 1);
  });

  it('should search with file filter[include] work correctly', async () => {
    // 1. enable search options to show include/exclude filters
    const optionsToggle = await view.findWebElement(By.id('optionsToggle'));
    await optionsToggle.click();
    await sleep(500);

    // 2. input search query with file filter test marker
    const input = await view.findWebElement(By.id('searchInput'));
    await input.sendKeys('[test:file-filter] Button');

    // 3. set include filter to only search in /src directory
    const includeInput = await view.findWebElement(By.id('includeFiles'));
    await includeInput.sendKeys('/src');

    // 4. trigger search
    await input.sendKeys('\n');
    await sleep(500);

    // 5. verify only /src files are returned
    await verifyRenderResults(view, 1, 2, 2);
  });

  it('should search with file filter[exclude] work correctly', async () => {
    // 1. enable search options to show include/exclude filters
    const optionsToggle = await view.findWebElement(By.id('optionsToggle'));
    await optionsToggle.click();
    await sleep(500);

    // 2. input search query with file filter test marker
    const input = await view.findWebElement(By.id('searchInput'));
    await input.sendKeys('[test:file-filter] Button');

    // 3. set exclude filter to exclude /src directory
    const excludeInput = await view.findWebElement(By.id('excludeFiles'));
    await excludeInput.sendKeys('/src');

    // 4. trigger search
    await input.sendKeys('\n');
    await sleep(500);

    // 5. verify /src files are excluded
    await verifyRenderResults(view, 1, 2, 2);
  });
});

describe('Haystack Search Files', function () {
  this.retries(3);
  this.timeout(20e3);
  let quickPick: InputBox;

  before(async () => {
    // haystack must be running in a workspace.
    await VSBrowser.instance.openResources(path.resolve(__dirname));
    await new Workbench().executeCommand('Haystack Search Files');
    await sleep(500);
    quickPick = await InputBox.create();
  });

  it('should search files with quick pick', async () => {
    // 1. input search query
    await quickPick.setText('test file search');
    // 2. wait for results to load
    await sleep(500);
    // 3. verify results are displayed
    const picks = await quickPick.getQuickPicks();
    assert.ok(picks.length === 3, 'Search results should be displayed');
  });
});
