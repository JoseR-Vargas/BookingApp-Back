import { Test, TestingModule } from '@nestjs/testing';
import { TENANT_CONTEXT } from '../shared/application/tenant-context.port';
import { BookingsGateway, tenantRoom } from './bookings.gateway';

describe('BookingsGateway', () => {
  let gateway: BookingsGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsGateway,
        {
          provide: TENANT_CONTEXT,
          useValue: { current: () => ({ id: 'tenant-a', slug: 'a' }) },
        },
      ],
    }).compile();

    gateway = module.get<BookingsGateway>(BookingsGateway);
  });

  it('debería estar definido', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('debería loguear la conexión del cliente', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const mockClient = { id: 'test-client-123' };

      gateway.handleConnection(mockClient);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Cliente conectado: test-client-123',
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handleDisconnect', () => {
    it('debería loguear la desconexión del cliente', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const mockClient = { id: 'test-client-123' };

      gateway.handleDisconnect(mockClient);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Cliente desconectado: test-client-123',
      );
      consoleSpy.mockRestore();
    });
  });

  describe('notifyNewBooking', () => {
    it('debería emitir evento newBooking cuando el servidor está disponible', () => {
      const mockEmit = jest.fn();
      gateway.server = { to: jest.fn(() => ({ emit: mockEmit })) } as any;

      const booking = { _id: '123', date: '2026-03-25', time: '10:00' };
      gateway.notifyNewBooking(booking);

      expect(mockEmit).toHaveBeenCalledWith('newBooking', booking);
    });

    it('no debería fallar cuando el servidor no está disponible', () => {
      gateway.server = null as any;

      expect(() => {
        gateway.notifyNewBooking({ _id: '123' });
      }).not.toThrow();
    });

    it('no debería fallar cuando server.emit lanza un error', () => {
      gateway.server = {
        to: () => ({
          emit: () => {
            throw new Error('Socket error');
          },
        }),
      } as any;

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        gateway.notifyNewBooking({ _id: '123' });
      }).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('debería emitir el objeto completo de la reserva', () => {
      const mockEmit = jest.fn();
      gateway.server = { to: jest.fn(() => ({ emit: mockEmit })) } as any;

      const fullBooking = {
        _id: '507f1f77bcf86cd799439011',
        client: { name: 'Juan', email: 'juan@test.com', phone: '123' },
        services: [
          {
            id: 'corte-cabello',
            name: 'Corte comun',
            price: 450,
            duration: 45,
          },
        ],
        totalPrice: 450,
        totalDuration: 45,
        professional: { id: 'cesar-viloria', name: 'Cesar Viloria' },
        date: '2026-03-25',
        time: '10:00',
        status: 'confirmed',
      };

      gateway.notifyNewBooking(fullBooking);

      expect(mockEmit).toHaveBeenCalledWith('newBooking', fullBooking);
    });
  });

  describe('notifyBookingCancelled', () => {
    it('emits bookingCancelled with only the id and the status', () => {
      const mockEmit = jest.fn();
      gateway.server = { to: jest.fn(() => ({ emit: mockEmit })) } as any;

      gateway.notifyBookingCancelled('507f1f77bcf86cd799439011');

      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit).toHaveBeenCalledWith('bookingCancelled', {
        id: '507f1f77bcf86cd799439011',
        status: 'cancelled',
      });
    });

    it('does not fail when there is no server', () => {
      gateway.server = null as any;

      expect(() => gateway.notifyBookingCancelled('123')).not.toThrow();
    });

    it('does not fail when server.emit throws', () => {
      gateway.server = {
        to: () => ({
          emit: () => {
            throw new Error('Socket error');
          },
        }),
      } as any;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => gateway.notifyBookingCancelled('123')).not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe('business rooms (spec 18)', () => {
    it('emits only to the room of the business in force', () => {
      const to = jest.fn(() => ({ emit: jest.fn() }));
      gateway.server = { to } as any;

      gateway.notifyNewBooking({ _id: '1' });
      gateway.notifyBookingCancelled('1');

      expect(to).toHaveBeenCalledTimes(2);
      expect(to).toHaveBeenCalledWith(tenantRoom('tenant-a'));
    });

    it('emits nothing when there is no business in the context', () => {
      const to = jest.fn(() => ({ emit: jest.fn() }));
      const bare = new BookingsGateway(undefined, {
        current: () => {
          throw new Error('no business');
        },
      });
      bare.server = { to } as any;

      bare.notifyNewBooking({ _id: '1' });
      bare.notifyBookingCancelled('1');

      expect(to).not.toHaveBeenCalled();
    });
  });

  describe('handshake', () => {
    const OLD = { ...process.env };
    afterEach(() => {
      process.env = { ...OLD };
    });

    const socketWith = (auth: Record<string, unknown>) => {
      const join = jest.fn().mockResolvedValue(undefined);
      return { socket: { handshake: { auth }, join } as any, join };
    };
    const tenants = {
      resolve: jest.fn((slug: string) =>
        Promise.resolve(
          slug === 'sur'
            ? { ok: true, value: { id: 'tenant-sur' } }
            : { ok: false },
        ),
      ),
      resolveDefault: jest.fn(() =>
        Promise.resolve({ ok: true, value: { id: 'tenant-main' } }),
      ),
    };

    const run = async (auth: Record<string, unknown>) => {
      process.env.ADMIN_API_KEY = 'secret';
      delete process.env.ADMIN_USERNAME;
      const g = new BookingsGateway(tenants as any, undefined);
      let middleware!: (s: any, n: (e?: Error) => void) => void;
      g.afterInit({ use: (fn: any) => (middleware = fn) } as any);
      const { socket, join } = socketWith(auth);
      const error = await new Promise<Error | undefined>((resolve) =>
        middleware(socket, resolve),
      );
      return { error, join };
    };

    it('refuses a socket without valid credentials', async () => {
      const { error, join } = await run({ key: 'wrong' });
      expect(error?.message).toBe('Unauthorized');
      expect(join).not.toHaveBeenCalled();
    });

    it('joins the default business when none is named', async () => {
      const { error, join } = await run({ key: 'secret' });
      expect(error).toBeUndefined();
      expect(join).toHaveBeenCalledWith(tenantRoom('tenant-main'));
    });

    it('joins the room of the named business', async () => {
      const { join } = await run({ key: 'secret', tenant: 'sur' });
      expect(join).toHaveBeenCalledWith(tenantRoom('tenant-sur'));
    });

    it('refuses an unknown business', async () => {
      const { error } = await run({ key: 'secret', tenant: 'nope' });
      expect(error?.message).toBe('Unauthorized');
    });
  });
});
