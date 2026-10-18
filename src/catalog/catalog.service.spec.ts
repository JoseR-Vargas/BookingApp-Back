import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from './catalog.service';

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
      expect(schedule.lunchBreak).toEqual({ start: 13, end: 14 });
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
