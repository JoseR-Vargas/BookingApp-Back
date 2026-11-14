import {
  AdminNotifiableBooking,
  buildAdminTemplateParams,
  formatAdminDate,
} from './admin-booking.params';

const booking: AdminNotifiableBooking = {
  client: { name: 'Juan Pérez', phone: '+54 9 11 5555-1234' },
  services: [{ name: 'Servicio Premium' }],
  professional: { name: 'Alex García' },
  date: '2026-03-25',
  time: '10:00',
};

describe('formatAdminDate', () => {
  it('turns an ISO date into dd/mm/yyyy', () => {
    expect(formatAdminDate('2026-03-05')).toBe('05/03/2026');
  });

  it('returns unexpected formats untouched instead of throwing', () => {
    expect(formatAdminDate('25 March')).toBe('25 March');
    expect(formatAdminDate('')).toBe('');
  });
});

describe('buildAdminTemplateParams', () => {
  it('returns exactly 6 params in the template order {{1}}..{{6}}', () => {
    expect(buildAdminTemplateParams(booking)).toEqual([
      'Juan Pérez',
      'Servicio Premium',
      'Alex García',
      '25/03/2026',
      '10:00',
      '+54 9 11 5555-1234',
    ]);
  });

  it('joins every service name with ", " in the service param', () => {
    const params = buildAdminTemplateParams({
      ...booking,
      services: [
        { name: 'Consulta Inicial' },
        { name: 'Servicio Básico' },
        { name: 'Servicio Premium' },
      ],
    });

    expect(params[1]).toBe(
      'Consulta Inicial, Servicio Básico, Servicio Premium',
    );
  });

  it('falls back to "-" when the booking has no services', () => {
    expect(buildAdminTemplateParams({ ...booking, services: [] })[1]).toBe('-');
  });

  it('never returns an empty param (Meta rejects empty values)', () => {
    const params = buildAdminTemplateParams({
      ...booking,
      client: { name: '  ', phone: '' },
    });

    expect(params).toHaveLength(6);
    expect(params.every((param) => param.trim().length > 0)).toBe(true);
  });
});
