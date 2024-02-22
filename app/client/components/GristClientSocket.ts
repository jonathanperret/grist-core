import WS from 'ws';
import {Socket as EIOSocket} from 'engine.io-client';
import {isAffirmative} from 'app/common/gutil';

interface GristClientSocketOptions {
  headers?: Record<string, string>;
}

export abstract class GristClientSocket {
  public static create(url: string, options?: GristClientSocketOptions, useEngineIO: boolean=false): GristClientSocket {
    return (useEngineIO || isAffirmative(process.env.GRIST_USE_ENGINE_IO)) ?
        new GristClientSocketEIO(url, options)
      : new GristClientSocketWS(url, options);
  }

  public abstract set onmessage(cb: null | ((event: { data: string }) => void));
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

  private _socket: EIOSocket;

  private _openSuccess: boolean = false;
  private _downgraded: boolean = false;

  private _messageHandler: null | ((event: { data: string }) => void);
  private _openHandler: null | (() => void);
  private _errorHandler: null | ((ev: any) => void);
  private _closeHandler: null | (() => void);

  constructor(url: string, options?: GristClientSocketOptions) {
    super();
    this._url = url;
    this._options = options;

    this._createSocket();
  }

  public set onmessage(cb: null | ((event: { data: string }) => void)) {
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
    this._socket.close();
  }

  public send(data: string) {
    this._socket.send(data);
  }

  // pause() and resume() assume a WebSocket transport
  public pause() {
    (this._socket as any).transport.ws?.pause();
  }

  public resume() {
    (this._socket as any).transport.ws?.resume();
  }

  private _createSocket() {
    if (this._socket) {
      this._socket.off('message');
      this._socket.off('open');
      this._socket.off('error');
      this._socket.off('close');
    }
    this._socket = new EIOSocket(this._url, {
      path: '/engine.io' + new URL(this._url).pathname,
      transports: this._downgraded ? ['polling'] : ['websocket'],
      upgrade: false,
      extraHeaders: this._options?.headers,
    });
    this._socket.on('message', this._onMessage.bind(this));
    this._socket.on('open', this._onOpen.bind(this));
    this._socket.on('error', this._onError.bind(this));
    this._socket.on('close', this._onClose.bind(this));
  }

  private _onMessage(data: string) {
    if (this._openSuccess && this._messageHandler) {
      this._messageHandler({ data });
    }
  }

  private _onOpen() {
    this._openSuccess = true;
    if (this._openHandler) {
      this._openHandler();
    }
  }

  private _onError(ev: any) {
    if (!this._openSuccess && !this._downgraded) {
      this._downgraded = true;
      this._createSocket();
    } else {
      if (this._errorHandler) {
        this._errorHandler(ev);
      }
    }
  }

  private _onClose() {
    if (this._openSuccess && this._closeHandler) {
      this._closeHandler();
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

  public set onmessage(cb: null | ((event: { data: string }) => void)) {
    this._ws.onmessage = cb;
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
