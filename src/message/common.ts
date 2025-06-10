import type { Disposable, Webview } from 'vscode';

export type MessageTypes = Record<string, unknown>;

type SendClient = Pick<Webview, 'postMessage'>;
type BrowserMessageClient = {
  addEventListener: (event: 'message', listener: (event: { data: unknown }) => void) => void;
  removeEventListener: (event: 'message', listener: (event: { data: unknown }) => void) => void;
};

type ReceiveClient = BrowserMessageClient | Pick<Webview, 'onDidReceiveMessage'>;

export abstract class MessageWrapper<Receive extends MessageTypes, Send extends MessageTypes> {
  constructor(
    private sendClient: SendClient,
    private receiveClient: ReceiveClient,
  ) {}
  /**
   * Register a callback for receiving messages of a specific type.
   * @param type The type of message to listen for:
   * - Extension types: {@link ./extension.ts}
   * - Webview types: {@link ./webview.ts}
   * @param callback The function to call when a message of the specified type is received.
   */
  on<K extends keyof Receive>(type: K, callback: (data: Receive[K]) => void): Disposable {
    if ('onDidReceiveMessage' in this.receiveClient) {
      return this.receiveClient.onDidReceiveMessage((message) => {
        if (message.type === type) {
          callback(message);
        }
      });
    } else if ('addEventListener' in this.receiveClient) {
      const listener = (event: { data: unknown }) => {
        const message = event.data as Receive[K] & { type: K };
        if (message.type === type) {
          callback(message);
        }
      };
      this.receiveClient.addEventListener('message', listener);
      return {
        dispose: () => {
          (this.receiveClient as BrowserMessageClient).removeEventListener('message', listener);
        },
      };
    }
    return {
      dispose: () => {},
    };
  }

  /**
   * Send a message of a specific type to the other side.
   * @param type The type of message to send:
   * - Extension types: {@link ./extension.ts}
   * - Webview types: {@link ./webview.ts}
   * @param args The data to send with the message. If the type has no data, pass nothing.
   * @returns A promise that resolves to true if the message was sent successfully, or false if it was not.
   */
  async post<O extends keyof Send>(
    type: O,
    ...args: Send[O] extends never ? [] : [data: Send[O]]
  ): Promise<boolean> {
    const ret = await this.sendClient.postMessage({
      type,
      ...(args[0] as object),
    });
    return ret ?? true;
  }
}
