import { Inject, Optional } from '@nestjs/common';
import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthenticateAdminSessionUseCase } from '../auth/application/use-cases/authenticate-admin-session.use-case';
import { EnvAdminCredentials } from '../auth/infrastructure/env-admin-credentials';
import { readSessionToken } from '../auth/infrastructure/http/session-cookie';
import {
  TENANT_CONTEXT,
  TENANT_SCOPE,
  TenantContext,
  TenantScope,
} from '../shared/application/tenant-context.port';
import { TenantService } from '../tenancy/application/tenant.service';

/** The room every socket of a business joins (spec 18). */
export const tenantRoom = (tenantId: string): string => `tenant:${tenantId}`;

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
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly credentials = new EnvAdminCredentials();

  constructor(
    @Optional() private readonly tenants?: TenantService,
    @Optional()
    @Inject(TENANT_CONTEXT)
    private readonly context?: TenantContext,
    @Optional() @Inject(TENANT_SCOPE) private readonly scope?: TenantScope,
    @Optional() private readonly sessions?: AuthenticateAdminSessionUseCase,
  ) {}

  /**
   * The handshake needs the admin credentials and names the business
   * (`auth: { key, username, tenant }`). Without valid credentials the socket
   * is refused; a valid one joins the room of its business only.
   */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authenticate(socket).then(
        () => next(),
        () => next(new Error('Unauthorized')),
      );
    });
  }

  private async authenticate(socket: Socket): Promise<void> {
    const auth = (socket.handshake?.auth ?? {}) as Record<string, unknown>;
    const text = (value: unknown) =>
      typeof value === 'string' && value !== '' ? value : undefined;
    if (!this.tenants) throw new Error('Unauthorized');
    const slug = text(auth.tenant);
    const resolved = slug
      ? await this.tenants.resolve(slug)
      : await this.tenants.resolveDefault();
    if (!resolved.ok) throw new Error('Unauthorized');
    const tenant = resolved.value;

    // The shared key, or the cookie session of an account of that business.
    if (!this.credentials.isValid(text(auth.key), text(auth.username))) {
      const token = readSessionToken(socket.handshake?.headers?.cookie);
      const valid =
        token !== undefined &&
        this.sessions !== undefined &&
        this.scope !== undefined &&
        (
          await this.scope.run(
            { id: tenant.id, slug: tenant.slug, isDefault: tenant.isDefault },
            () => this.sessions!.execute(token),
          )
        ).ok;
      if (!valid) throw new Error('Unauthorized');
    }
    await socket.join(tenantRoom(tenant.id));
  }

  /** The room of the business in force, or undefined outside a business. */
  private room(): string | undefined {
    try {
      return tenantRoom(this.context!.current().id);
    } catch {
      return undefined;
    }
  }

  handleConnection(client: { id: string }) {
    console.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: { id: string }) {
    console.log(`Cliente desconectado: ${client.id}`);
  }

  notifyNewBooking(booking: any) {
    // Solo emitir si hay servidor y clientes conectados
    const room = this.room();
    if (this.server && room) {
      try {
        this.server.to(room).emit('newBooking', booking);
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
    const room = this.room();
    if (this.server && room) {
      try {
        this.server
          .to(room)
          .emit('bookingCancelled', { id, status: 'cancelled' });
      } catch (error) {
        console.error('Error al notificar cancelación por WebSocket:', error);
      }
    }
  }
}
