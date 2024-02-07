import * as WebSocket from 'ws';

export abstract class GristServerSocket {
  public abstract set onerror(handler: (err: unknown) => void);
  public abstract set onclose(handler: () => void);
  public abstract set onmessage(handler: (msg: string) => void);
  public abstract removeAllListeners(): void;
  public abstract close(): void;
  public abstract terminate(): void;
  public abstract get isOpen(): boolean;
  public abstract send(data: string, cb: (err?: Error) => void): void;
}

export class GristServerSocketWS extends GristServerSocket {
  private _eventHandlers: Array<{event: string, handler: (...args: any[]) => void}> = [];

  constructor(private _ws: WebSocket) { super(); }

  public set onerror(handler: (err: unknown) => void) {
    this._ws.on('error', handler);
    this._eventHandlers.push({event: 'error', handler});
  }

  public set onclose(handler: () => void) {
    this._ws.on('close', handler);
    this._eventHandlers.push({event: 'close', handler});
  }

  public set onmessage(handler: (msg: string) => void) {
    this._ws.on('message', (msg: Buffer) => handler(msg.toString()));
    this._eventHandlers.push({event: 'message', handler});
  }

  public removeAllListeners() {
    // Avoiding websocket.removeAllListeners() because WebSocket.Server registers listeners
    // internally for websockets it keeps track of, and we should not accidentally remove those.
    for (const {event, handler} of this._eventHandlers) {
      this._ws.off(event, handler);
    }
    this._eventHandlers = [];
  }

  public close() {
    this._ws.close();
  }

  public terminate() {
    this._ws.terminate();
  }

  public get isOpen() {
    return this._ws.readyState === WebSocket.OPEN;
  }

  public send(data: string, cb: (err?: Error) => void) {
    this._ws.send(data, cb);
  }
}
