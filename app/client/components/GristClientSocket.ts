import WS from 'ws';

interface GristClientSocketOptions {
  headers?: Record<string, string>;
}

export abstract class GristClientSocket {
  public static create(url: string, options?: GristClientSocketOptions): GristClientSocket {
    return new GristClientSocketWS(url, options);
  }

  public abstract set onmessage(cb: null | ((event: { data: string }) => void));
  public abstract set onopen(cb: null | (() => void));
  public abstract set onerror(cb: null | ((ev: any) => void));
  public abstract set onclose(cb: null | (() => void));
  public abstract close(): void;
  public abstract send(data: string): void;
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
