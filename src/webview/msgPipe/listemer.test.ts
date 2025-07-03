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

  // updateResult can be handled even when search isn't started (for research functionality)
  test("handle `updateResult` message when searching isn't started", (done) => {
    const { msgPipe, mockSendMessageFromExtension } = createStubMsgPipe();
    listenerExtensionMessages(msgPipe);
    msgPipe.on('updateResult', () => {
      // Wait for throttled function to execute
      setTimeout(() => {
        const snap = getResultSnpapshot();
        assert.strictEqual(snap.status, 'idle');
        assert.strictEqual(snap.results['/home/developer/my-react-app'].count, 2);
        done();
      }, 100);
    });
    mockSendMessageFromExtension('updateResult', getStreamData());
  });

  test('handle `updateResult` message when searching is started', (done) => {
    const { msgPipe, mockSendMessageFromExtension } = createStubMsgPipe();
    listenerExtensionMessages(msgPipe);
    msgPipe.on('updateResult', () => {
      // Wait for throttled function to execute
      setTimeout(() => {
        const snap = getResultSnpapshot();
        assert.strictEqual(snap.status, 'loading');
        assert.strictEqual(snap.results['/home/developer/my-react-app'].count, 2);
        done();
      }, 100);
    });
    setSearchLoading();
    mockSendMessageFromExtension('updateResult', getStreamData());
  });

  test('handle `searchDone` message', (done) => {
    const { msgPipe, mockSendMessageFromExtension } = createStubMsgPipe();
    listenerExtensionMessages(msgPipe);
    msgPipe.on('searchDone', () => {
      const snap = getResultSnpapshot();
      assert.strictEqual(snap.status, 'done');
      done();
    });
    setSearchLoading();
    mockSendMessageFromExtension('searchDone', { truncated: false });
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
      // Wait for throttled function to execute
      setTimeout(() => {
        const snap = getResultSnpapshot();
        assert.strictEqual(snap.status, 'cancelled');
        assert.strictEqual(snap.results['/home/developer/my-react-app'].count, 2);
        done();
      }, 100);
    });
    setSearchLoading();
    mockSendMessageFromExtension('updateResult', getStreamData());
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
