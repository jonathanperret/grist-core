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
  private _ws: EIOSocket;

  constructor(url: string, options?: GristClientSocketOptions) {
    super();
    this._ws = new EIOSocket(url, {
      path: '/engine.io' + new URL(url).pathname,
      transports: ['websocket'],
      upgrade: false,
      extraHeaders: options?.headers,
    });
  }

  public set onmessage(cb: null | ((event: { data: string }) => void)) {
    if(cb) {
      this._ws.on('message', (data) => cb({data}));
    } else {
      this._ws.off('message');
    }
  }

  public set onopen(cb: null | (() => void)) {
    if(cb) {
      this._ws.on('open', cb);
    } else {
      this._ws.off('open');
    }
  }

  public set onerror(cb: null | ((ev: any) => void)) {
    if(cb) {
      this._ws.on('error', cb);
    } else {
      this._ws.off('error');
    }
  }

  public set onclose(cb: null | (() => void)) {
    if(cb) {
      this._ws.on('close', cb);
    } else {
      this._ws.off('close');
    }
  }

  public close() {
    this._ws.close();
  }

  public send(data: string) {
    this._ws.send(data);
  }

  // pause() and resume() assume a WebSocket transport
  public pause() {
    (this._ws as any).transport.ws?.pause();
  }

  public resume() {
    (this._ws as any).transport.ws?.resume();
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
