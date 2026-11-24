import { model } from 'mongoose';
import { BookingSchema } from './booking.schema';
import { LocationSchema } from '../../catalog/schemas/location.schema';
import { ProfessionalSchema } from '../../catalog/schemas/professional.schema';

/** Real Mongoose schemas (no connection needed) for the location fields (S2). */
describe('location fields in the Mongoose schemas', () => {
  const BookingModel = model('LocationSchemaSpecBooking', BookingSchema);
  const base = {
    client: { name: 'Juan', phone: '1' },
    services: [{ id: 's', name: 'S', price: 1, duration: 30 }],
    totalPrice: 1,
    totalDuration: 30,
    professional: { id: 'alex-garcia', name: 'Alex' },
    date: '2026-10-19',
    time: '11:00',
    slots: ['11:00'],
  };

  it('keeps the location { id, name } of a booking', () => {
    const doc = new BookingModel({
      ...base,
      location: { id: 'centro', name: 'Centro' },
    });

    expect(doc.validateSync()).toBeUndefined();
    expect(doc.toObject().location).toEqual({ id: 'centro', name: 'Centro' });
  });

  it('a legacy booking without location is still valid and gets none', () => {
    const doc = new BookingModel(base);

    expect(doc.validateSync()).toBeUndefined();
    expect(doc.toObject()).not.toHaveProperty('location.id');
  });

  it('the unique slot index stays per professional, date and slot (not per location)', () => {
    const unique = BookingSchema.indexes().find(
      ([, options]) =>
        options?.name === 'uniq_confirmed_professional_date_slot',
    );

    expect(unique?.[0]).toEqual({
      'professional.id': 1,
      date: 1,
      slots: 1,
    });
  });

  it('a professional without locationIds does not get an empty array by default', () => {
    const Professional = model(
      'LocationSchemaSpecProfessional',
      ProfessionalSchema,
    );

    const doc = new Professional({ id: 'p', name: 'P' });

    expect(doc.toObject().locationIds).toBeUndefined();
  });

  it('locations are unique by id', () => {
    expect(
      LocationSchema.indexes().some(
        ([fields, options]) => fields.id === 1 && options?.unique === true,
      ),
    ).toBe(true);
  });
});
