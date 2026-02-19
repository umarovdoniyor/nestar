import { Logger } from '@nestjs/common';
import { OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'ws';
import * as WebSocket from 'ws';
import * as url from 'url';
import { AuthService } from '../components/auth/auth.service';
import { Member } from '../libs/dto/member/member';

interface MessagePayload {
  event: string;
  text: string;
  memberData?: Member;
}

interface InfoPayload {
  event: string;
  totalClient: number;
  memberData?: Member;
  action: string;
}

@WebSocketGateway({ transports: ['websocket'], secure: false })
export class SocketGateway implements OnGatewayInit {
  private logger: Logger = new Logger('SocketEventsGateway');
  private summaryClient: number = 0;
  private clientAuthMap: Map<WebSocket, Member> = new Map();
  private messagesList: MessagePayload[] = [];

  constructor(private authService: AuthService) {}

  @WebSocketServer()
  server: Server;

  public afterInit(_server: Server) {
    this.logger.verbose(`Websocket Server Initialized & total client: [${this.summaryClient}]`);
  }

  private async retrieveAuth(req: any): Promise<Member> {
    try {
      const parsedUrl = url.parse(req.url, true);
      const token = parsedUrl.query.token as string;
      console.log('token: ', token);
      const authMember = await this.authService.verifyToken(token);
      return authMember;
    } catch (err) {
      return null;
    }
  }

  public async handleConnection(client: WebSocket, req: any) {
    const authMember = await this.retrieveAuth(req);
    this.summaryClient++;
    this.clientAuthMap.set(client, authMember);

    const clientNick = authMember ? authMember.memberNick : 'Guest';
    this.logger.verbose(`Connection [${clientNick}] & total [${this.summaryClient}]`);

    const infoMsg: InfoPayload = {
      event: 'info',
      totalClient: this.summaryClient,
      memberData: authMember,
      action: 'joined',
    };
    this.emitMessage(infoMsg);
    client.send(JSON.stringify({ event: 'getMessages', list: this.messagesList }));
  }

  handleDisconnect(client: WebSocket) {
    const authMember = this.clientAuthMap.get(client);
    this.summaryClient--;
    this.clientAuthMap.delete(client);

    const clientNick = authMember ? authMember.memberNick : 'Guest';
    this.logger.verbose(`Disconnection [${clientNick}] & total [${this.summaryClient}]`);

    const infoMsg: InfoPayload = {
      event: 'info',
      totalClient: this.summaryClient,
      memberData: authMember,
      action: 'left',
    };
    // client disconnected, so we broadcast to all remaining clients
    this.broadcastMessage(client, infoMsg);
  }

  @SubscribeMessage('message')
  public async handleMessage(client: WebSocket, payload: string): Promise<void> {
    const authMember = this.clientAuthMap.get(client);
    const newMessage: MessagePayload = {
      event: 'message',
      text: payload,
      memberData: authMember,
    };

    const clientNick = authMember ? authMember.memberNick : 'Guest';

    this.logger.verbose(`NEW MESSAGE from [${clientNick}]: ${payload}`);
    this.messagesList.push(newMessage);
    if (this.messagesList.length >= 5) this.messagesList.splice(0, this.messagesList.length - 5); // keep only the latest 5 messages
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

/*
MESSAGE TARGET:
- Client (only client)
- Broadcast (all clients except sender)
- Emit (all clients including sender)
*/
