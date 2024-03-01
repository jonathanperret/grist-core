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
  private _eioServer: EIO.Server;
  private _wsServer: GristSocketServerWS;

  constructor(server: http.Server) {
    super();
    this._eioServer = new EIO.Server({
      allowUpgrades: false,
      transports: ['polling'],
      maxHttpBufferSize: MAX_PAYLOAD,
      cors: {
        // This will cause engine.io to reflect any client-provided Origin into
        // the Access-Control-Allow-Origin header, essentially disabling the
        // protection offered by the Same-Origin Policy. This sounds insecure
        // but is actually the security model of native WebSockets (they are
        // not covered by SOP; any webpage can open a WebSocket connecting to
        // any other domain, including the target domain's cookies; it is up to
        // the receiving server to check the request's Origin header). Since
        // this CORS behavior will only apply to polling requests, which end up
        // subjected downstream to the same Origin checks as those necessarily
        // applied to WebSocket requests, it is safe to let any client attempt
        // a connection here.
        origin: true,
        // We need to allow the client to send its cookies. See above for the
        // reasoning on why it is safe to do so.
        credentials: true,
      },
    });
    this._attach(server);

    this._wsServer = new GristSocketServerWS(server);
  }

  public set onconnection(handler: (socket: GristServerSocket, req: http.IncomingMessage) => void) {
    this._eioServer.on('connection', (socket: EIO.Socket) => {
      const req = socket.request;
      (socket as any).request = null; // Free initial request as recommended in the Engine.IO documentation
      handler(new GristServerSocketEIO(socket), req);
    });
    this._wsServer.onconnection = handler;
  }

  public close(cb: (...args: any[]) => void) {
    this._eioServer.close();
    this._wsServer.close(cb);
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
        this._eioServer.handleRequest(req, res);
      } else {
        // Otherwise fallback to the pre-existing listener(s)
        for (const listener of listeners) {
          listener.call(server, req, res);
        }
      }
    });

    // Forward all WebSocket upgrade requests to Engine.IO
    //server.on("upgrade", this._server.handleUpgrade.bind(this._server));

    server.on("close", this._eioServer.close.bind(this._eioServer));
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
