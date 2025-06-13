import * as assert from 'assert';
import { beforeEach } from 'mocha';
import { resetResult, getResultSnpapshot, setSearchLoading, isLoading } from '../store/result';
import { type ExtensionMessagePipeline } from '../../message/extension';
import { type WebViewMessagePipeline } from '../../message/webview';
import { getIsPlatformSupported } from '../store/support';
import { listenerExtensionMessages } from './listener';
import { createMsgPipe } from './msgPipe';
import { getStreamData } from '../store/__tests__/data';

const createStubMsgPipe = () => {
  const listeners: Array<WebViewMessagePipeline['on']> = [];
  // @ts-ignore
  const mockSendMessageFromExtension: ExtensionMessagePipeline['post'] = (type, data) => {
    listeners.forEach((listener) => {
      // @ts-ignore
      listener(type, data);
    });
    return Promise.resolve(true);
  };

  const msgPipe = createMsgPipe(
    {
      postMessage() {
        return Promise.resolve(true);
      },
    },
    {
      addEventListener(event, listener) {
        if (event === 'message') {
          const wrapper: WebViewMessagePipeline['on'] = (type, data) => {
            listener({
              data: { type, ...data },
            });
            return {
              dispose: () => listeners.splice(listeners.indexOf(wrapper) ?? -1, 1),
            };
          };
          listeners.push(wrapper);
        }
      },
      removeEventListener() {},
    },
  );
  return {
    msgPipe,
    mockSendMessageFromExtension,
  };
};

suite('Listener business messages from extension', () => {
  // Reset the result store before each test
  beforeEach(() => {
    resetResult();
  });

  // only handle searchResultStream message after search is started
  test("handle `searchResultStream` message when searching isn't started", (done) => {
    const { msgPipe, mockSendMessageFromExtension } = createStubMsgPipe();
    listenerExtensionMessages(msgPipe);
    msgPipe.on('searchResultStream', () => {
      const snap = getResultSnpapshot();
      assert.strictEqual(snap.status, 'idle');
      assert.strictEqual(Object.keys(snap.results).length, 0);
      done();
    });
    mockSendMessageFromExtension('searchResultStream', getStreamData());
  });

  test('handle `searchResultStream` message when searching is started', (done) => {
    const { msgPipe, mockSendMessageFromExtension } = createStubMsgPipe();
    listenerExtensionMessages(msgPipe);
    msgPipe.on('searchResultStream', () => {
      const snap = getResultSnpapshot();
      assert.strictEqual(snap.status, 'loading');
      assert.strictEqual(snap.results['/home/developer/my-react-app'].count, 2);
      done();
    });
    setSearchLoading();
    mockSendMessageFromExtension('searchResultStream', getStreamData());
  });

  test('handle `searchCancelled` message: no data', (done) => {
    const { msgPipe, mockSendMessageFromExtension } = createStubMsgPipe();
    listenerExtensionMessages(msgPipe);
    msgPipe.on('searchCancelled', () => {
      const snap = getResultSnpapshot();
      assert.strictEqual(snap.status, 'cancelled');
      assert.strictEqual(Object.keys(snap.results).length, 0);
      done();
    });
    mockSendMessageFromExtension('searchCancelled');
  });

  // cancelled search should not affect the results
  test('handle `searchCancelled` message: with data', (done) => {
    const { msgPipe, mockSendMessageFromExtension } = createStubMsgPipe();
    listenerExtensionMessages(msgPipe);
    msgPipe.on('searchCancelled', () => {
      const snap = getResultSnpapshot();
      assert.strictEqual(snap.status, 'cancelled');
      assert.strictEqual(snap.results['/home/developer/my-react-app'].count, 2);
      done();
    });
    setSearchLoading();
    mockSendMessageFromExtension('searchResultStream', getStreamData());
    mockSendMessageFromExtension('searchCancelled');
  });

  // because extension side has started a search, so we only need to validate the loading state
  test('handle `setSearchText` message', (done) => {
    const { msgPipe, mockSendMessageFromExtension } = createStubMsgPipe();
    listenerExtensionMessages(msgPipe);
    msgPipe.on('setSearchText', () => {
      assert.strictEqual(isLoading(), true);
      done();
    });
    mockSendMessageFromExtension('setSearchText', { text: 'test' });
  });

  test('handle `setSearchText` message', (done) => {
    const { msgPipe, mockSendMessageFromExtension } = createStubMsgPipe();
    listenerExtensionMessages(msgPipe);
    msgPipe.on('setSearchText', () => {
      assert.strictEqual(isLoading(), true);
      done();
    });
    mockSendMessageFromExtension('setSearchText', { text: 'test' });
  });

  test('handle `isPlatformSupported` message', (done) => {
    const { msgPipe, mockSendMessageFromExtension } = createStubMsgPipe();
    listenerExtensionMessages(msgPipe);
    msgPipe.on('isPlatformSupported', () => {
      assert.strictEqual(getIsPlatformSupported(), true);
      done();
    });
    mockSendMessageFromExtension('isPlatformSupported', { supported: true });
  });
});
