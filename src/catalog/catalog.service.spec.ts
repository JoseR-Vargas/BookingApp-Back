import { Test, TestingModule } from '@nestjs/testing';
import { SERVICES } from './catalog.config';
import { CatalogService } from './catalog.service';
import { ServiceSelectionError } from './service-selection';

describe('CatalogService', () => {
  let service: CatalogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CatalogService],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  describe('getCatalog', () => {
    it('returns both professionals', () => {
      const { professionals } = service.getCatalog();

      expect(professionals.map((p) => p.id)).toEqual([
        'alex-garcia',
        'maria-lopez',
      ]);
      expect(professionals[0]).toEqual({
        id: 'alex-garcia',
        name: 'Alex García',
        specialty: 'Especialista',
        experience: '8 años',
        rating: 4.9,
        avatar: 'fas fa-user-tie',
        available: true,
      });
    });

    it('returns the 4 services with their exact ids and durations', () => {
      const { services } = service.getCatalog();

      expect(services.map((s) => [s.id, s.duration])).toEqual([
        ['consulta-inicial', 30],
        ['servicio-basico', 60],
        ['servicio-premium', 90],
        ['sesion-expres', 20],
      ]);
      expect(services[2]).toEqual({
        id: 'servicio-premium',
        name: 'Servicio Premium',
        description:
          'Experiencia premium con atención prioritaria y resultados garantizados',
        price: 2500,
        duration: 90,
        professionals: ['alex-garcia', 'maria-lopez'],
        icon: 'fas fa-gem',
      });
    });

    it('returns a weekly schedule: Sunday closed, Saturday 9-18, weekdays 9-20', () => {
      const { schedule } = service.getCatalog();

      expect(schedule.weekly[0]).toEqual({ closed: true });
      expect(schedule.weekly[6]).toEqual({ closed: false, open: 9, close: 18 });
      for (const day of [1, 2, 3, 4, 5] as const) {
        expect(schedule.weekly[day]).toEqual({
          closed: false,
          open: 9,
          close: 20,
        });
      }
      expect(schedule.slotIntervalMinutes).toBe(60);
      expect(Object.keys(schedule).sort()).toEqual([
        'slotIntervalMinutes',
        'weekly',
      ]);
    });
  });

  describe('findService', () => {
    it('returns the service when the id exists', () => {
      expect(service.findService('sesion-expres')?.price).toBe(700);
    });

    it('returns undefined when the id does not exist', () => {
      expect(service.findService('unknown')).toBeUndefined();
    });
  });

  describe('findProfessional', () => {
    it('returns the professional when the id exists', () => {
      expect(service.findProfessional('maria-lopez')?.name).toBe('María López');
    });

    it('returns undefined when the id does not exist', () => {
      expect(service.findProfessional('unknown')).toBeUndefined();
    });
  });

  describe('resolveServices', () => {
    it('resolves the services in the given order with accumulated totals', () => {
      const selection = service.resolveServices([
        'servicio-premium',
        'consulta-inicial',
        'servicio-basico',
      ]);

      expect(selection.services.map((s) => s.id)).toEqual([
        'servicio-premium',
        'consulta-inicial',
        'servicio-basico',
      ]);
      expect(selection.totalPrice).toBe(4200);
      expect(selection.totalDuration).toBe(180);
    });

    it('returns the professionals that offer every selected service', () => {
      const selection = service.resolveServices([
        'consulta-inicial',
        'sesion-expres',
      ]);

      expect(selection.professionals.map((p) => p.id)).toEqual([
        'alex-garcia',
        'maria-lopez',
      ]);
    });

    it('keeps only professionals common to all services', () => {
      jest.spyOn(service, 'findService').mockImplementation((id) => {
        const base = SERVICES.find((s) => s.id === id)!;
        return id === 'servicio-premium'
          ? { ...base, professionals: ['maria-lopez'] }
          : base;
      });

      const selection = service.resolveServices([
        'consulta-inicial',
        'servicio-premium',
      ]);

      expect(selection.professionals.map((p) => p.id)).toEqual(['maria-lopez']);
    });

    it('rejects an empty list', () => {
      expect(() => service.resolveServices([])).toThrow(ServiceSelectionError);
      expect(() => service.resolveServices([])).toThrow(
        'debes seleccionar al menos un servicio',
      );
    });

    it('rejects an unknown service id', () => {
      expect.assertions(3);
      try {
        service.resolveServices(['consulta-inicial', 'unknown']);
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceSelectionError);
        expect((error as ServiceSelectionError).failure).toBe('unknown');
        expect((error as ServiceSelectionError).serviceId).toBe('unknown');
      }
    });

    it('rejects a duplicated service id', () => {
      expect.assertions(2);
      try {
        service.resolveServices(['consulta-inicial', 'consulta-inicial']);
      } catch (error) {
        expect((error as ServiceSelectionError).failure).toBe('duplicate');
        expect((error as ServiceSelectionError).serviceId).toBe(
          'consulta-inicial',
        );
      }
    });
  });

  describe('getProfessionalsForService', () => {
    it('returns the professionals assigned to a known service', () => {
      const professionals =
        service.getProfessionalsForService('consulta-inicial');

      expect(professionals.map((p) => p.id)).toEqual([
        'alex-garcia',
        'maria-lopez',
      ]);
    });

    it('returns an empty list for an unknown service', () => {
      expect(service.getProfessionalsForService('unknown')).toEqual([]);
    });
  });
});
