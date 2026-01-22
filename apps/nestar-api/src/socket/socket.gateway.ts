import { Logger } from '@nestjs/common';
import { OnGatewayInit, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Server } from 'ws';

@WebSocketGateway({ transports: ['websocket'], secure: false })
export class SocketGateway implements OnGatewayInit {
  private logger: Logger = new Logger('SocketEventsGateway');
  private summaryClient: number = 0;

  public afterInit(server: Server) {
    this.logger.log(`Websocket Server Initialized total client: ${this.summaryClient}`);
  }

  handleConnection(client: WebSocket, ...args: any[]) {
    this.summaryClient++;
    this.logger.log(`=== Client connected: ${client.url} total client: ${this.summaryClient} ===`);
  }

  handleDisconnect(client: WebSocket) {
    this.summaryClient--;
    this.logger.log(`=== Client disconnected: ${client.url} left total client: ${this.summaryClient} ===`);
  }

  @SubscribeMessage('message')
  public handleMessage(client: WebSocket, payload: any): string {
    return 'Hello world!';
  }
}
