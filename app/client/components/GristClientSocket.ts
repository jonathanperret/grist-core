import WS from 'ws';
import {Socket as EIOSocket} from 'engine.io-client';
import {isAffirmative} from 'app/common/gutil';
import {isClient} from 'app/common/gristUrls';
import {getGristConfig} from 'app/common/urlUtils';

interface GristClientSocketOptions {
  headers?: Record<string, string>;
}

export abstract class GristClientSocket {
  public static create(url: string, options?: GristClientSocketOptions): GristClientSocket {
    const useEngineIO = isClient() ?
      getGristConfig().useEngineIO
      : isAffirmative(process.env.GRIST_USE_ENGINE_IO);

    return useEngineIO ?
      new GristClientSocketEIO(url, options)
      : new GristClientSocketWS(url, options);
  }

  public abstract set onmessage(cb: null | ((data: string) => void));
  public abstract set onopen(cb: null | (() => void));
  public abstract set onerror(cb: null | ((ev: any) => void));
  public abstract set onclose(cb: null | (() => void));
  public abstract close(): void;
  public abstract send(data: string): void;

  // only for testing
  public abstract pause(): void;
  public abstract resume(): void;
}

export class GristClientSocketEIO extends GristClientSocket {
  private _url: string;
  private _options: GristClientSocketOptions | undefined;

  private _eioSocket: EIOSocket;
  private _wsSocket: GristClientSocketWS | null;

  // Set to true when the connection process is complete, either succesfully or
  // after the WebSocket and polling transports have both failed.  Events from
  // the underlying socket are not forwarded to the client until that point.
  private _openDone: boolean = false;

  // Means that the WebSocket connection attempt failed and we are now trying
  // to establish a polling connection.
  private _downgraded: boolean = false;

  private _messageHandler: null | ((data: string) => void);
  private _openHandler: null | (() => void);
  private _errorHandler: null | ((ev: any) => void);
  private _closeHandler: null | (() => void);

  constructor(url: string, options?: GristClientSocketOptions) {
    super();
    this._url = url;
    this._options = options;

    if (isAffirmative(process.env.GRIST_FORCE_POLLING)) {
      this._downgraded = true;
    }

    this._createSocket();
  }

  public set onmessage(cb: null | ((data: string) => void)) {
    this._messageHandler = cb;
  }

  public set onopen(cb: null | (() => void)) {
    this._openHandler = cb;
  }

  public set onerror(cb: null | ((ev: any) => void)) {
    this._errorHandler = cb;
  }

  public set onclose(cb: null | (() => void)) {
    this._closeHandler = cb;
  }

  public close() {
    if (this._wsSocket) {
      this._wsSocket.close();
    } else {
      this._eioSocket.close();
    }
  }

  public send(data: string) {
    if (this._wsSocket) {
      this._wsSocket.send(data);
    } else {
      this._eioSocket.send(data);
    }
  }

  // pause() and resume() assume a WebSocket transport
  public pause() {
    this._wsSocket?.pause();
  }

  public resume() {
    this._wsSocket?.resume();
  }

  private _createSocket() {
    if (this._wsSocket) {
      this._wsSocket.onmessage = null;
      this._wsSocket.onopen = null;
      this._wsSocket.onerror = null;
      this._wsSocket.onclose = null;
      this._wsSocket = null;
    }
    if (this._downgraded) {
      this._eioSocket = new EIOSocket(this._url, {
        path: new URL(this._url).pathname,
        transports: ['polling'],
        upgrade: false,
        extraHeaders: this._options?.headers,
        withCredentials: true,
      });
      this._eioSocket.on('message', this._onEIOMessage.bind(this));
      this._eioSocket.on('open', this._onEIOOpen.bind(this));
      this._eioSocket.on('error', this._onEIOError.bind(this));
      this._eioSocket.on('close', this._onEIOClose.bind(this));
    } else {
      this._wsSocket = new GristClientSocketWS(this._url, this._options);
      this._wsSocket.onmessage = this._onWSMessage.bind(this);
      this._wsSocket.onopen = this._onWSOpen.bind(this);
      this._wsSocket.onerror = this._onWSError.bind(this);
      this._wsSocket.onclose = this._onWSClose.bind(this);
    }
  }

  private _onEIOMessage(data: string) {
    this._messageHandler?.(data);
  }

  private _onEIOOpen() {
    this._openHandler?.();
  }

  private _onEIOError(ev: any) {
    // We will make no further attempt to connect. Any future events can now
    // be forwarded to the client.
    this._openDone = true;
    this._errorHandler?.(ev);
  }

  private _onEIOClose() {
    this._closeHandler?.();
  }

  private _onWSMessage(data: string) {
    if (this._openDone) {
      this._messageHandler?.(data);
    }
  }

  private _onWSOpen() {
    // The connection was established successfully. Any future events can now
    // be forwarded to the client.
    this._openDone = true;
    this._openHandler?.();
  }

  private _onWSError(ev: any) {
    if (!this._openDone) {
      // The first connection attempt failed. Trigger an attempt with another
      // transport.
      this._downgraded = true;
      this._createSocket();
    } else {
      this._errorHandler?.(ev);
    }
  }

  private _onWSClose() {
    if (this._openDone) {
      this._closeHandler?.();
    }
  }
}

export class GristClientSocketWS extends GristClientSocket {
  private _ws: WS|WebSocket;

  constructor(url: string, options?: GristClientSocketOptions) {
    super();
    if(typeof WebSocket !== 'undefined') {
      this._ws = new WebSocket(url);
    } else {
      this._ws = new WS(url, undefined, options);
    }
  }

  public set onmessage(cb: null | ((data: string) => void)) {
    this._ws.onmessage = cb ?
      (event: WS.MessageEvent | MessageEvent<any>) => {
        cb(event.data instanceof String ? event.data : event.data.toString());
      }
      : null;
  }

  public set onopen(cb: null | (() => void)) {
    this._ws.onopen = cb;
  }

  public set onerror(cb: null | ((ev: any) => void)) {
    this._ws.onerror = cb;
  }

  public set onclose(cb: null | (() => void)) {
    this._ws.onclose = cb;
  }

  public close() {
    this._ws.close();
  }

  public send(data: string) {
    this._ws.send(data);
  }

  public pause() {
    (this._ws as any).pause();
  }

  public resume() {
    (this._ws as any).resume();
  }
}
