import { Key, WebElement, WebviewView, By } from 'vscode-extension-tester';
import * as assert from 'assert';

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const clearInputText = async (element: WebElement): Promise<void> => {
  const selectAll = process.platform === 'darwin' ? Key.COMMAND : Key.CONTROL;
  await element.click();
  await element.sendKeys(selectAll, 'a');
  await element.sendKeys(Key.BACK_SPACE);
};

/**
 * verify render workspace group, file group , result item and summary
 */
export const verifyRenderResults = async (
  view: WebviewView,
  workspaceCount: number,
  fileCount: number,
  lineCount: number,
): Promise<void> => {
  const workspaceGroups = await view.findWebElements(By.className('workspace-group'));
  console.log(`Workspace groups found: ${workspaceGroups.length}, expected: ${workspaceCount}`);
  assert.ok(
    workspaceGroups.length === workspaceCount,
    'Workspace groups should be rendered correctly',
  );
  const fileGroups = await view.findWebElements(By.className('file-group'));
  console.log(`File groups found: ${fileGroups.length}, expected: ${fileCount}`);
  assert.ok(fileGroups.length === fileCount, 'File groups should be rendered correctly');
  const resultItems = await view.findWebElements(By.className('result-item'));
  console.log(`Result items found: ${resultItems.length}, expected: ${lineCount}`);
  assert.ok(resultItems.length === lineCount, 'Result items should be rendered correctly');
  const summary = await view.findWebElement(By.className('search-summary'));
  assert.ok(summary.getText(), `${lineCount} results in ${fileCount} files`);
};
