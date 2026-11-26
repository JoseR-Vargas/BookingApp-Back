// Two businesses behind the one real application: what the admin of one
// creates never shows in the other (spec 18). Runs on the integration database.
process.env.MONGO_URI = 'mongodb://localhost:27018/booking_http_int_test';
process.env.ADMIN_API_KEY = 'http-int-key';
process.env.ADMIN_USERNAME = '';

import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../main';
import { TenantService } from './application/tenant.service';

const auth = { Authorization: 'Bearer http-int-key' };
const professional = (name: string) => ({
  name,
  specialty: 'Barber',
  experience: '3 years',
});

describe('HTTP isolation between two businesses', () => {
  let app: NestExpressApplication;
  let connection: Connection;

  const http = () => request(app.getHttpServer());
  const as = (slug?: string) => (slug ? { 'X-Tenant': slug } : {});

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    configureApp(app);
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    await connection.dropDatabase();
    // The startup migration ran on the empty database: build the businesses.
    await app.get(TenantService).create({ slug: 'norte', name: 'Norte' });
    await app.get(TenantService).create({ slug: 'sur', name: 'Sur' });
  }, 60000);

  afterAll(async () => {
    await connection.dropDatabase();
    await app.close();
  });

  it('an unknown business answers 404 and the default one keeps answering', async () => {
    await http()
      .get('/api/catalog')
      .set(as('no-existe'))
      .expect(404)
      .expect((res) => expect(res.body.message).toBe('Negocio no encontrado'));
  });

  it('a professional created in one business is invisible in the other', async () => {
    const created = await http()
      .post('/api/admin/professionals')
      .set({ ...auth, ...as('norte') })
      .send(professional('Ana Norte'))
      .expect(201);
    const id = created.body.id as string;

    const north = await http().get('/api/catalog').set(as('norte')).expect(200);
    const south = await http().get('/api/catalog').set(as('sur')).expect(200);
    const names = (res: request.Response) =>
      (res.body.professionals as { id: string }[]).map((p) => p.id);
    expect(names(north)).toContain(id);
    expect(names(south)).not.toContain(id);

    const adminSouth = await http()
      .get('/api/admin/professionals')
      .set({ ...auth, ...as('sur') });
    expect(JSON.stringify(adminSouth.body)).not.toContain(id);

    // The other business cannot edit or delete it.
    await http()
      .patch(`/api/admin/professionals/${id}`)
      .set({ ...auth, ...as('sur') })
      .send({ specialty: 'Hacked' })
      .expect(404);
    await http()
      .delete(`/api/admin/professionals/${id}/permanent`)
      .set({ ...auth, ...as('sur') })
      .expect((res) => expect([404, 409]).toContain(res.status));
    const still = await http().get('/api/catalog').set(as('norte')).expect(200);
    expect(names(still)).toContain(id);
  });

  it('the same professional name can exist in both businesses', async () => {
    const a = await http()
      .post('/api/admin/professionals')
      .set({ ...auth, ...as('norte') })
      .send(professional('Luis Repetido'))
      .expect(201);
    const b = await http()
      .post('/api/admin/professionals')
      .set({ ...auth, ...as('sur') })
      .send(professional('Luis Repetido'))
      .expect(201);
    expect(b.body.id).toBe(a.body.id);
  });

  it('branding is per business', async () => {
    const current = await http().get('/api/branding').set(as('norte'));
    await http()
      .put('/api/admin/branding')
      .set({ ...auth, ...as('norte') })
      .send({ businessName: 'Barbería Norte', colors: current.body.colors })
      .expect(200);
    const north = await http().get('/api/branding').set(as('norte'));
    const south = await http().get('/api/branding').set(as('sur'));
    expect(north.body.businessName).toBe('Barbería Norte');
    expect(south.body.businessName).not.toBe('Barbería Norte');
  });

  it('bookings of one business are not listed in the other', async () => {
    const listNorth = await http()
      .get('/api/bookings')
      .set({ ...auth, ...as('norte') })
      .expect(200);
    const listSouth = await http()
      .get('/api/bookings')
      .set({ ...auth, ...as('sur') })
      .expect(200);
    expect(Array.isArray(listNorth.body)).toBe(true);
    expect(listSouth.body).toEqual([]);
  });
});
