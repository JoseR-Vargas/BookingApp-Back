import { Booking, BookingSchema } from './booking.schema';

describe('BookingSchema', () => {
  it('debería tener el schema definido', () => {
    expect(BookingSchema).toBeDefined();
  });

  it('debería tener timestamps habilitados', () => {
    const options = (BookingSchema as any).options;
    expect(options.timestamps).toBe(true);
  });

  it('debería tener los paths requeridos definidos', () => {
    const paths = BookingSchema.paths;

    expect(paths).toHaveProperty('client');
    expect(paths).toHaveProperty('services');
    expect(paths).toHaveProperty('totalPrice');
    expect(paths).toHaveProperty('totalDuration');
    expect(paths).not.toHaveProperty('service');
    expect(paths).toHaveProperty('professional');
    expect(paths).toHaveProperty('date');
    expect(paths).toHaveProperty('time');
    expect(paths).toHaveProperty('notes');
    expect(paths).toHaveProperty('status');
  });

  it('debería tener date como campo requerido', () => {
    const datePath = BookingSchema.path('date');
    expect(datePath.isRequired).toBe(true);
  });

  it('debería tener time como campo requerido', () => {
    const timePath = BookingSchema.path('time');
    expect(timePath.isRequired).toBe(true);
  });

  it('debería tener notes con valor por defecto vacío', () => {
    const notesPath = BookingSchema.path('notes') as any;
    expect(notesPath.defaultValue).toBe('');
  });

  it('debería tener status con valor por defecto confirmed', () => {
    const statusPath = BookingSchema.path('status') as any;
    expect(statusPath.defaultValue).toBe('confirmed');
  });

  it('debería tener client como campo requerido', () => {
    const clientPath = BookingSchema.path('client');
    expect(clientPath.isRequired).toBe(true);
  });

  it('debería declarar services como array requerido de líneas de servicio', () => {
    const servicesPath = BookingSchema.path('services') as any;
    expect(servicesPath.instance).toBe('Array');
    expect(servicesPath.isRequired).toBe(true);
    const line = servicesPath.schema;
    expect(
      ['id', 'name', 'price', 'duration'].map((k) => line.path(k).isRequired),
    ).toEqual([true, true, true, true]);
    expect(line.path('_id')).toBeUndefined();
  });

  it('debería tener totalPrice y totalDuration como campos requeridos', () => {
    expect(BookingSchema.path('totalPrice').isRequired).toBe(true);
    expect(BookingSchema.path('totalDuration').isRequired).toBe(true);
  });

  it('debería tener professional como campo requerido', () => {
    const professionalPath = BookingSchema.path('professional');
    expect(professionalPath.isRequired).toBe(true);
  });
  it('debería declarar slots como array de strings', () => {
    const slotsPath = BookingSchema.path('slots') as any;
    expect(slotsPath).toBeDefined();
    expect(slotsPath.instance).toBe('Array');
    expect(slotsPath.caster.instance).toBe('String');
  });

  it('debería restringir status a confirmed y cancelled', () => {
    const statusPath = BookingSchema.path('status') as any;
    expect(statusPath.enumValues).toEqual(['confirmed', 'cancelled']);
  });

  it('debería tener client.email opcional y client.phone requerido', () => {
    const clientSchema = (BookingSchema.path('client') as any).schema;
    expect(clientSchema.path('email').isRequired).toBeFalsy();
    expect(clientSchema.path('phone').isRequired).toBe(true);
  });

  it('debería declarar el índice único parcial por profesional, fecha y slot', () => {
    const index = BookingSchema.indexes().find(([fields]) => 'slots' in fields);

    expect(index).toBeDefined();
    const [fields, options] = index!;
    expect(fields).toEqual({ 'professional.id': 1, date: 1, slots: 1 });
    expect(options).toEqual(
      expect.objectContaining({
        unique: true,
        partialFilterExpression: expect.objectContaining({
          status: 'confirmed',
        }),
      }),
    );
  });
});
