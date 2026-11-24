import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DomainErrorFilter } from '../shared/infrastructure/http/domain-error.filter';
import * as request from 'supertest';
import { AdminController } from '../admin/admin.controller';
import { ScheduleImpactService } from '../admin/schedule-impact';
import { CatalogController } from './catalog.controller';
import {
  FakeModel,
  createFakeCatalog,
  CATALOG_ROUTE_CONTROLLERS,
} from './catalog.testing';

const PHOTO_ERROR = 'La foto debe ser PNG, JPG o WebP de hasta 200 KB.';
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const UPDATED_AT = new Date('2025-11-17T12:00:00.000Z');

const image = (header: number[], size = 64): Buffer => {
  const bytes = Buffer.alloc(size, 7);
  Buffer.from(header).copy(bytes);
  return bytes;
};

const dataUrl = (mime: string, bytes: Buffer) =>
  `data:${mime};base64,${bytes.toString('base64')}`;

const PNG_BYTES = image(PNG);
const VALID = dataUrl('image/png', PNG_BYTES);

interface StoredDoc {
  id: string;
  active: boolean;
  photo?: {
    mimeType: string;
    data: Uint8Array;
    updatedAt: Date;
  } | null;
}

interface Json {
  professionals: { id: string; photoUrl: string | null }[];
}

/** Public + admin HTTP contract of the professional photo, in-memory models. */
describe('Professional photo HTTP contract', () => {
  const KEY = 'photo-test-key';
  const auth = { Authorization: `Bearer ${KEY}` };
  let app: INestApplication;
  let professionals: FakeModel;
  let saved: string | undefined;

  const server = () => request(app.getHttpServer() as Server);
  const stored = (id: string) =>
    professionals.docs.find((doc) => doc.id === id) as StoredDoc | undefined;

  beforeEach(async () => {
    saved = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = KEY;
    const fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
    professionals = fake.professionalModel;
    // Alex has a photo; María has none.
    stored('alex-garcia')!.photo = {
      mimeType: 'image/png',
      data: PNG_BYTES,
      updatedAt: UPDATED_AT,
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [
        CatalogController,
        AdminController,
        ...CATALOG_ROUTE_CONTROLLERS,
      ],
      providers: [
        ...fake.providers,
        { provide: ScheduleImpactService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainErrorFilter());
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    if (saved === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = saved;
  });

  const urlOf = (json: Json, id: string) =>
    json.professionals.find((p) => p.id === id)?.photoUrl;

  describe('catalog responses', () => {
    it('GET /api/catalog adds photoUrl with ?v= or null, and no bytes', async () => {
      const res = await server().get('/api/catalog').expect(200);
      const json = res.body as Json;
      expect(urlOf(json, 'alex-garcia')).toBe(
        `/api/catalog/professionals/alex-garcia/photo?v=${UPDATED_AT.getTime()}`,
      );
      expect(urlOf(json, 'maria-lopez')).toBeNull();
      expect(res.text).not.toContain(PNG_BYTES.toString('base64'));
      expect(res.text).not.toContain('"data"');
    });

    it('GET /api/admin/catalog adds photoUrl and no bytes', async () => {
      const res = await server()
        .get('/api/admin/catalog')
        .set(auth)
        .expect(200);
      const json = res.body as Json;
      expect(urlOf(json, 'alex-garcia')).toBe(
        `/api/catalog/professionals/alex-garcia/photo?v=${UPDATED_AT.getTime()}`,
      );
      expect(urlOf(json, 'maria-lopez')).toBeNull();
      expect(res.text).not.toContain(PNG_BYTES.toString('base64'));
      expect(res.text).not.toContain('"data"');
    });

    it('treats a professional stored with photo: null as having no photo', async () => {
      stored('alex-garcia')!.photo = null;
      const res = await server().get('/api/catalog').expect(200);
      expect(urlOf(res.body as Json, 'alex-garcia')).toBeNull();
    });
  });

  describe('GET /api/catalog/professionals/:id/photo', () => {
    it('serves the bytes without a key, with type and cache headers', async () => {
      const res = await server()
        .get('/api/catalog/professionals/alex-garcia/photo')
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toBe('public, max-age=86400');
      expect((res.body as Buffer).equals(PNG_BYTES)).toBe(true);
    });

    it('serves the photo of an inactive professional', async () => {
      stored('alex-garcia')!.active = false;
      await server()
        .get('/api/catalog/professionals/alex-garcia/photo')
        .expect(200);
    });

    it('returns 404 without a photo and for an unknown professional', async () => {
      await server()
        .get('/api/catalog/professionals/maria-lopez/photo')
        .expect(404);
      await server().get('/api/catalog/professionals/nobody/photo').expect(404);
    });

    it('returns 404 for a professional stored before the photo field existed', async () => {
      delete stored('alex-garcia')!.photo;
      await server()
        .get('/api/catalog/professionals/alex-garcia/photo')
        .expect(404);
    });
  });

  describe('PUT /api/admin/professionals/:id/photo', () => {
    it('requires the admin key', async () => {
      await server()
        .put('/api/admin/professionals/maria-lopez/photo')
        .send({ dataUrl: VALID })
        .expect(401);
      expect(stored('maria-lopez')!.photo).toBeUndefined();
    });

    it('returns 404 for an unknown professional', async () => {
      await server()
        .put('/api/admin/professionals/nobody/photo')
        .set(auth)
        .send({ dataUrl: VALID })
        .expect(404);
    });

    it('stores a valid photo and serves it afterwards', async () => {
      const res = await server()
        .put('/api/admin/professionals/maria-lopez/photo')
        .set(auth)
        .send({ dataUrl: VALID })
        .expect(200);
      const body = res.body as {
        id: string;
        photoUrl: string;
        active: boolean;
      };
      expect(body.id).toBe('maria-lopez');
      expect(body.photoUrl).toMatch(
        /^\/api\/catalog\/professionals\/maria-lopez\/photo\?v=\d+$/,
      );
      expect(res.text).not.toContain(PNG_BYTES.toString('base64'));
      expect(res.body).not.toHaveProperty('photo');
      expect(stored('maria-lopez')!.photo?.mimeType).toBe('image/png');
      await server()
        .get('/api/catalog/professionals/maria-lopez/photo')
        .expect(200);
    });

    // The 200 KB / 201 KB boundary needs the 1mb body limit of main.ts and is
    // covered in image-data-url.spec.ts.
    it.each([
      ['an SVG', dataUrl('image/svg+xml', Buffer.from('<svg></svg>'))],
      ['a .jpg that is not an image', dataUrl('image/jpeg', Buffer.from('hi'))],
      [
        'a declared type that differs from the bytes',
        dataUrl('image/jpeg', PNG_BYTES),
      ],
    ])('rejects %s with 400 and keeps the stored photo', async (_, bad) => {
      const res = await server()
        .put('/api/admin/professionals/alex-garcia/photo')
        .set(auth)
        .send({ dataUrl: bad })
        .expect(400);
      expect((res.body as { message: string }).message).toBe(PHOTO_ERROR);
      expect(stored('alex-garcia')!.photo?.updatedAt).toEqual(UPDATED_AT);
    });

    it('rejects a body without dataUrl with 400', async () => {
      const res = await server()
        .put('/api/admin/professionals/alex-garcia/photo')
        .set(auth)
        .send({})
        .expect(400);
      expect((res.body as { message: string }).message).toBe(PHOTO_ERROR);
    });
  });

  describe('DELETE /api/admin/professionals/:id/photo', () => {
    it('requires the admin key', async () => {
      await server()
        .delete('/api/admin/professionals/alex-garcia/photo')
        .expect(401);
      expect(stored('alex-garcia')!.photo).not.toBeNull();
    });

    it('returns 404 for an unknown professional', async () => {
      await server()
        .delete('/api/admin/professionals/nobody/photo')
        .set(auth)
        .expect(404);
    });

    it('removes the photo and leaves the professional active', async () => {
      const res = await server()
        .delete('/api/admin/professionals/alex-garcia/photo')
        .set(auth)
        .expect(200);
      expect(res.body).toMatchObject({
        id: 'alex-garcia',
        photoUrl: null,
        active: true,
      });
      expect(stored('alex-garcia')!.photo).toBeNull();
      await server()
        .get('/api/catalog/professionals/alex-garcia/photo')
        .expect(404);
    });
  });

  describe('POST /api/admin/professionals with photoDataUrl', () => {
    it('creates the professional with its photo', async () => {
      const res = await server()
        .post('/api/admin/professionals')
        .set(auth)
        .send({ name: 'Nuevo Pro', photoDataUrl: VALID })
        .expect(201);
      const body = res.body as { id: string; photoUrl: string };
      expect(body.id).toBe('nuevo-pro');
      expect(body.photoUrl).toMatch(
        /^\/api\/catalog\/professionals\/nuevo-pro\/photo\?v=\d+$/,
      );
      expect(res.body).not.toHaveProperty('photo');
      expect(stored('nuevo-pro')!.photo?.mimeType).toBe('image/png');
      await server()
        .get('/api/catalog/professionals/nuevo-pro/photo')
        .expect(200);
    });

    it('creates the professional without a photo (photoUrl null)', async () => {
      const res = await server()
        .post('/api/admin/professionals')
        .set(auth)
        .send({ name: 'Sin Foto' })
        .expect(201);
      expect((res.body as { photoUrl: null }).photoUrl).toBeNull();
    });

    it('rejects an invalid photoDataUrl with 400 and creates nothing', async () => {
      const before = professionals.docs.length;
      const res = await server()
        .post('/api/admin/professionals')
        .set(auth)
        .send({ name: 'Nuevo Pro', photoDataUrl: 'data:image/png;base64,AAAA' })
        .expect(400);
      expect((res.body as { message: string }).message).toBe(PHOTO_ERROR);
      expect(professionals.docs).toHaveLength(before);
    });
  });

  describe('PATCH /api/admin/professionals/:id', () => {
    it('ignores photo and photoDataUrl', async () => {
      const res = await server()
        .patch('/api/admin/professionals/alex-garcia')
        .set(auth)
        .send({
          specialty: 'Barbero',
          photo: { mimeType: 'image/png', data: 'x' },
          photoDataUrl: dataUrl('image/png', image(PNG, 99)),
        })
        .expect(200);
      expect(res.body).toMatchObject({
        id: 'alex-garcia',
        specialty: 'Barbero',
        photoUrl: `/api/catalog/professionals/alex-garcia/photo?v=${UPDATED_AT.getTime()}`,
      });
      const photo = stored('alex-garcia')!.photo;
      expect(photo?.updatedAt).toEqual(UPDATED_AT);
      expect(Buffer.from(photo!.data).equals(PNG_BYTES)).toBe(true);
    });
  });
});
