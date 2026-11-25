import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin:
      process.env.NODE_ENV === 'production'
        ? ['https://booking-app-front-peach.vercel.app']
        : true,
    credentials: true,
  },
})
export class BookingsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  handleConnection(client: any) {
    console.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: any) {
    console.log(`Cliente desconectado: ${client.id}`);
  }

  notifyNewBooking(booking: any) {
    // Solo emitir si hay servidor y clientes conectados
    if (this.server) {
      try {
        this.server.emit('newBooking', booking);
      } catch (error) {
        // Si falla la notificación WebSocket, no es crítico, solo loguear
        console.error('Error al notificar nueva reserva por WebSocket:', error);
      }
    }
  }

  /**
   * Lets the admin panel refresh a row after a cancellation. It takes only the
   * id, so the payload can never carry client data.
   */
  notifyBookingCancelled(id: string) {
    if (this.server) {
      try {
        this.server.emit('bookingCancelled', { id, status: 'cancelled' });
      } catch (error) {
        console.error('Error al notificar cancelación por WebSocket:', error);
      }
    }
  }
}
