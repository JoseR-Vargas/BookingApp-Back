import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { BrandingAdminController } from './branding-admin.controller';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import {
  FakeBrandingModel,
  bodyOf,
  createFakeBranding,
} from './branding.testing';
import { DEFAULT_COLORS } from './schemas/branding.schema';

const LOGO_ERROR = 'El logo debe ser PNG, JPG o WebP de hasta 200 KB.';
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const image = (header: number[], size = 64): Buffer => {
  const bytes = Buffer.alloc(size);
  Buffer.from(header).copy(bytes);
  return bytes;
};

const dataUrl = (mime: string, bytes: Buffer) =>
  `data:${mime};base64,${bytes.toString('base64')}`;

const COLORS = {
  accent: '#3366ff',
  background: '#ffffff',
  text: '#1a1a1a',
  accentSecondary: null,
};

/** End-to-end over HTTP with an in-memory model: guard, routing, status codes. */
describe('Branding HTTP contract', () => {
  const KEY = 'branding-test-key';
  const auth = { Authorization: `Bearer ${KEY}` };
  let app: INestApplication;
  let model: FakeBrandingModel;
  let saved: string | undefined;

  const server = () => request(app.getHttpServer() as Server);

  beforeEach(async () => {
    saved = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = KEY;
    const fake = createFakeBranding();
    model = fake.model;
    const moduleRef = await Test.createTestingModule({
      controllers: [BrandingController, BrandingAdminController],
      providers: [{ provide: BrandingService, useValue: fake.service }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    if (saved === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = saved;
  });

  describe('public', () => {
    it('GET /api/branding answers the defaults without a key', async () => {
      const res = await server().get('/api/branding').expect(200);
      expect(res.body).toEqual({
        businessName: null,
        colors: DEFAULT_COLORS,
        logoUrl: null,
      });
    });

    it('GET /api/branding/logo answers 404 without a logo', async () => {
      await server().get('/api/branding/logo').expect(404);
    });

    it('GET /api/branding/logo serves the bytes with their type and a public cache', async () => {
      const bytes = image(PNG, 128);
      const put = await server()
        .put('/api/admin/branding/logo')
        .set(auth)
        .send({ dataUrl: dataUrl('image/png', bytes) })
        .expect(200);

      const res = await server()
        .get(bodyOf(put).logoUrl!)
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toMatch(/^public\b/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.compare(res.body as Buffer, bytes)).toBe(0);

      const branding = await server().get('/api/branding').expect(200);
      expect(bodyOf(branding).logoUrl).toBe(bodyOf(put).logoUrl);
    });
  });

  describe('admin', () => {
    const routes: ['put' | 'delete', string][] = [
      ['put', '/api/admin/branding'],
      ['put', '/api/admin/branding/logo'],
      ['delete', '/api/admin/branding/logo'],
    ];

    it.each(routes)('%s %s answers 401 without a key', async (method, path) => {
      await server()[method](path).expect(401);
      expect(model.docs).toHaveLength(0);
    });

    it.each(routes)(
      '%s %s answers 401 with a wrong key',
      async (method, path) => {
        await server()
          [method](path)
          .set('Authorization', 'Bearer nope')
          .send({ businessName: 'x', colors: COLORS })
          .expect(401);
        expect(model.docs).toHaveLength(0);
      },
    );

    it('PUT /api/admin/branding saves with and without accentSecondary', async () => {
      const res = await server()
        .put('/api/admin/branding')
        .set(auth)
        .send({ businessName: '  Barbería Don Pepe ', colors: COLORS })
        .expect(200);
      expect(res.body).toEqual({
        businessName: 'Barbería Don Pepe',
        colors: COLORS,
        logoUrl: null,
      });

      const withSecondary = await server()
        .put('/api/admin/branding')
        .set(auth)
        .send({
          businessName: 'Barbería Don Pepe',
          colors: { ...COLORS, accent: '#3366FF', accentSecondary: '#0044CC' },
        })
        .expect(200);
      expect(bodyOf(withSecondary).colors).toEqual({
        ...COLORS,
        accentSecondary: '#0044cc',
      });

      const read = await server().get('/api/branding').expect(200);
      expect(read.body).toEqual(withSecondary.body);
    });

    it('a blank business name is saved as null', async () => {
      const res = await server()
        .put('/api/admin/branding')
        .set(auth)
        .send({ businessName: '   ', colors: COLORS })
        .expect(200);
      expect(bodyOf(res).businessName).toBeNull();
      expect(model.docs[0].businessName).toBeNull();
    });

    const invalid: [string, unknown, string][] = [
      [
        'missing accent',
        { colors: { background: '#ffffff', text: '#1a1a1a' } },
        'El color "Acento" es obligatorio.',
      ],
      [
        'missing background',
        { colors: { accent: '#3366ff', text: '#1a1a1a' } },
        'El color "Fondo" es obligatorio.',
      ],
      [
        'missing text',
        { colors: { accent: '#3366ff', background: '#ffffff' } },
        'El color "Texto" es obligatorio.',
      ],
      [
        'malformed color',
        { colors: { ...COLORS, accent: '#36f' } },
        'El color "Acento" debe tener el formato #rrggbb.',
      ],
      [
        'low text contrast',
        { colors: { ...COLORS, text: '#777777', background: '#888888' } },
        'El texto no contrasta lo suficiente con el fondo (mínimo 4.5:1).',
      ],
      [
        'low accent contrast',
        { colors: { ...COLORS, accent: '#eeeeee' } },
        'El acento no contrasta lo suficiente con el fondo (mínimo 3:1).',
      ],
      [
        'low accentSecondary contrast',
        { colors: { ...COLORS, accentSecondary: '#eeeeee' } },
        'El acento secundario no contrasta lo suficiente con el fondo (mínimo 3:1).',
      ],
      [
        'a 61-character name',
        { businessName: 'a'.repeat(61), colors: COLORS },
        'El nombre del negocio puede tener hasta 60 caracteres.',
      ],
    ];

    it.each(invalid)(
      'PUT /api/admin/branding rejects %s with 400 and stores nothing',
      async (_case, body, message) => {
        const res = await server()
          .put('/api/admin/branding')
          .set(auth)
          .send(body as object)
          .expect(400);
        expect(bodyOf(res).message).toBe(message);
        expect(model.docs).toHaveLength(0);
      },
    );

    // The 200 KB / 201 KB boundary needs the 1mb body limit of main.ts and is
    // covered in main.spec.ts.
    it('PUT /api/admin/branding/logo rejects SVG and a fake PNG with 400', async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
      for (const url of [
        dataUrl('image/svg+xml', svg),
        dataUrl('image/png', Buffer.from('not really a png')),
        dataUrl('image/jpeg', image(PNG)),
      ]) {
        const res = await server()
          .put('/api/admin/branding/logo')
          .set(auth)
          .send({ dataUrl: url })
          .expect(400);
        expect(bodyOf(res).message).toBe(LOGO_ERROR);
      }
      expect(model.docs).toHaveLength(0);
    });

    it('PUT then DELETE /api/admin/branding/logo', async () => {
      await server()
        .put('/api/admin/branding')
        .set(auth)
        .send({ businessName: 'Don Pepe', colors: COLORS })
        .expect(200);
      const put = await server()
        .put('/api/admin/branding/logo')
        .set(auth)
        .send({ dataUrl: dataUrl('image/png', image(PNG)) })
        .expect(200);
      expect(put.body).toMatchObject({
        businessName: 'Don Pepe',
        colors: COLORS,
      });
      expect(bodyOf(put).logoUrl).toMatch(/^\/api\/branding\/logo\?v=\d+$/);

      const del = await server()
        .delete('/api/admin/branding/logo')
        .set(auth)
        .expect(200);
      expect(del.body).toEqual({
        businessName: 'Don Pepe',
        colors: COLORS,
        logoUrl: null,
      });
      await server().get('/api/branding/logo').expect(404);
    });
  });
});
