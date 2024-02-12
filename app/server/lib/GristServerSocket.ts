import * as WS from 'ws';
import * as EIO from 'engine.io';
import log from 'app/server/lib/log';

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

export class GristServerSocketEIO extends GristServerSocket {
  private _eventHandlers: Array<{event: string, handler: (...args: any[]) => void}> = [];
  private _messageCounter = 0;
  private _messageCallbacks: Map<number, (err: any) => void> = new Map();

  constructor(private _socket: EIO.Socket) { super(); }

  public set onerror(handler: (err: unknown) => void) {
    // Note that as far as I can tell, Engine.IO sockets never emit "error"
    // but instead include error information in the "close" event.
    this._socket.on('error', handler);
    this._eventHandlers.push({event: 'error', handler});
  }

  public set onclose(handler: () => void) {
    const wrappedHandler = (reason: string, description: any) => {
      log.debug("got socket close reason=%s description=%s messages=%s",
        reason, description?.message ?? description, [...this._messageCallbacks.keys()]);

      const err = description ?? new Error(reason);
      for(const msgNum of this._messageCallbacks.keys()) {
        const cb = this._messageCallbacks.get(msgNum);
        if (cb) {
          log.debug("calling cb for msg %d with %s", msgNum, err?.message || err);
          cb(err);
        }
      }
      this._messageCallbacks.clear();

      log.debug("calling close handler");
      handler();
    };
    this._socket.on('close', wrappedHandler);
    this._eventHandlers.push({event: 'close', handler: wrappedHandler});
  }

  public set onmessage(handler: (msg: string) => void) {
    const wrappedHandler = (msg: Buffer) => {
      log.debug("got message (%d bytes) %s", msg.length, msg.slice(0, 100));
      handler(msg.toString());
    };
    this._socket.on('message', wrappedHandler);
    this._eventHandlers.push({event: 'message', handler: wrappedHandler});
  }

  public removeAllListeners() {
    for (const {event, handler} of this._eventHandlers) {
      this._socket.off(event, handler);
    }
    this._eventHandlers = [];
  }

  public close() {
    this._socket.close();
  }

  public terminate() {
    this._socket.close(/*discard*/ true);
  }

  public get isOpen() {
    return this._socket.readyState === 'open';
  }

  public send(data: string, cb: (err?: Error) => void) {
    const msgNum = this._messageCounter++;
    this._messageCallbacks.set(msgNum, cb);
    log.debug("sending msg %d: %s", msgNum, { toString:()=>data.slice(0, 100) });
    this._socket.send(data, {}, () => {
      this._messageCallbacks.delete(msgNum);
      log.debug("calling cb for msg %d", msgNum);
      cb();
    });
  }
}

export class GristServerSocketWS extends GristServerSocket {
  private _eventHandlers: Array<{event: string, handler: (...args: any[]) => void}> = [];
  private _messageCounter = 0;

  constructor(private _ws: WS) { super(); }

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
    // Avoiding websocket.removeAllListeners() because WS.Server registers listeners
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
    return this._ws.readyState === WS.OPEN;
  }

  public send(data: string, cb: (err?: Error) => void) {
    const msgNum = this._messageCounter++;
    log.debug("sending msg %d: %s", msgNum, { toString:()=>data.slice(0, 100) });
    this._ws.send(data, (err) => {
      log.debug("calling cb for msg %d with %s", msgNum, err?.message);
      cb(err);
    });
  }
}
