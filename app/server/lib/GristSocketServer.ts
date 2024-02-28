import * as http from 'http';
import * as WS from 'ws';
import * as EIO from 'engine.io';
import {GristServerSocket, GristServerSocketEIO, GristServerSocketWS} from './GristServerSocket';
import {isAffirmative} from 'app/common/gutil';

// monkeypatch Engine.IO to workaround send callbacks bug
// (https://github.com/socketio/engine.io/issues/698)
Object.defineProperty(EIO.transports.websocket.prototype, 'supportsFraming', { value: false });

const MAX_PAYLOAD = 100e6;

export abstract class GristSocketServer {
  public static create(server: http.Server): GristSocketServer {
    return isAffirmative(process.env.GRIST_USE_ENGINE_IO) ?
        new GristSocketServerEIO(server)
      : new GristSocketServerWS(server);
  }

  public abstract set onconnection(handler: (socket: GristServerSocket, req: http.IncomingMessage) => void);
  public abstract close(cb: (...args: any[]) => void): void;
}

export class GristSocketServerEIO extends GristSocketServer {
  private _server: EIO.Server;

  constructor(server: http.Server) {
    super();
    this._server = new EIO.Server({
      allowUpgrades: false,
      transports: ['polling', 'websocket'],
      maxHttpBufferSize: MAX_PAYLOAD,
    });
    this._attach(server);
  }

  public set onconnection(handler: (socket: GristServerSocket, req: http.IncomingMessage) => void) {
    this._server.on('connection', (socket: EIO.Socket) => {
      const req = socket.request;
      (socket as any).request = null; // Free initial request as recommended in the Engine.IO documentation
      handler(new GristServerSocketEIO(socket), req);
    });
  }

  public close(cb: (...args: any[]) => void) {
    this._server.close();
    cb();
  }

  private _attach(server: http.Server) {
    // At this point the Express app is installed as the handler for the server's
    // "request" event. We need to install our own listener instead, to intercept
    // requests that are meant for the Engine.IO polling implementation.
    const listeners = [...server.listeners("request")];
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      // Intercept requests that have transport=polling in their querystring
      if (/[&?]transport=polling(&|$)/.test(req.url ?? '')) {
        this._server.handleRequest(req, res);
      } else {
        // Otherwise fallback to the pre-existing listener(s)
        for (const listener of listeners) {
          listener.call(server, req, res);
        }
      }
    });

    // Forward all WebSocket upgrade requests to Engine.IO
    server.on("upgrade", this._server.handleUpgrade.bind(this._server));

    server.on("close", this._server.close.bind(this._server));
  }
}

export class GristSocketServerWS extends GristSocketServer {
  private _wss: WS.Server;

  constructor(server: http.Server) {
    super();
    this._wss = new WS.Server({ server, maxPayload: MAX_PAYLOAD });
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
