import { Logger } from '@nestjs/common';
import { OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'ws';
import * as WebSocket from 'ws';

interface MessagePayload {
  event: string;
  text: string;
}

interface InfoPayload {
  event: string;
  totalClient: number;
}

@WebSocketGateway({ transports: ['websocket'], secure: false })
export class SocketGateway implements OnGatewayInit {
  private logger: Logger = new Logger('SocketEventsGateway');
  private summaryClient: number = 0;

  @WebSocketServer()
  server: Server;

  public afterInit(_server: Server) {
    this.logger.verbose(`Websocket Server Initialized & total client: [${this.summaryClient}]`);
  }

  handleConnection(_client: WebSocket, ..._args: any[]) {
    this.summaryClient++;
    this.logger.verbose(`Connection & total [${this.summaryClient}]`);

    const infoMsg: InfoPayload = {
      event: 'info',
      totalClient: this.summaryClient,
    };
    this.server.clients.forEach((ws) => {
      ws.send(JSON.stringify(infoMsg));
    });
  }

  handleDisconnect(client: WebSocket) {
    this.summaryClient--;
    this.logger.verbose(`Disconnection & total [${this.summaryClient}]`);

    const infoMsg: InfoPayload = {
      event: 'info',
      totalClient: this.summaryClient,
    };
    // client disconnected, so we broadcast to all remaining clients
    this.broadcastMessage(client, infoMsg);
  }

  @SubscribeMessage('message')
  public async handleMessage(client: WebSocket, payload: string): Promise<void> {
    const newMessage: MessagePayload = {
      event: 'message',
      text: payload,
    };

    this.logger.verbose(`NEW MESSAGE: ${payload}`);
    this.emitMessage(newMessage);
  }

  private broadcastMessage(sender: WebSocket, message: InfoPayload | MessagePayload) {
    this.server.clients.forEach((ws) => {
      if (ws !== sender && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }

  private emitMessage(message: InfoPayload | MessagePayload) {
    this.server.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    });
  }
}
