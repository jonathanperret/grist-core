import * as http from 'http';
import * as WS from 'ws';
import {GristServerSocket, GristServerSocketWS} from './GristServerSocket';

export abstract class GristSocketServer {
  public static create(server: http.Server): GristSocketServer {
    return new GristSocketServerWS(server);
  }

  public abstract set onconnection(handler: (socket: GristServerSocket, req: http.IncomingMessage) => void);
  public abstract close(cb: (...args: any[]) => void): void;
}

class GristSocketServerWS extends GristSocketServer {
  private _wss: WS.Server;

  constructor(server: http.Server) {
    super();
    this._wss = new WS.Server({ server });
  }

  public set onconnection(handler: (socket: GristServerSocket, req: http.IncomingMessage) => void) {
    this._wss.on('connection', (socket: WS, request: http.IncomingMessage) => {
      handler(new GristServerSocketWS(socket), request);
    });
  }

  public close(cb: (...args: any[]) => void) {
    // Terminate all clients. WS.Server used to do it automatically in close() but no
    // longer does (see https://github.com/websockets/ws/pull/1904#discussion_r668844565).
    for (const ws of this._wss.clients) {
      ws.terminate();
    }
    this._wss.close(cb);
  }
}
