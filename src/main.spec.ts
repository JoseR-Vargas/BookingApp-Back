import { Body, Controller, Post, Req } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import {
  BRANDING_CONTROLLERS,
  bodyOf,
  inMemoryBrandingProviders,
} from './branding/infrastructure/http/branding-http.testing';
import { InMemoryBrandingRepository } from './branding/infrastructure/persistence/in-memory/in-memory-branding.repository';
import { configureApp } from './main';

/** Reports what the body parser left on the request. */
@Controller('echo')
class EchoController {
  @Post()
  echo(@Req() req: { rawBody?: Buffer }, @Body() body: unknown) {
    return {
      rawLength: req.rawBody?.length ?? null,
      parsed: body !== undefined,
    };
  }
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (size: number): Buffer => {
  const bytes = Buffer.alloc(size);
  Buffer.from(PNG).copy(bytes);
  return bytes;
};
const logoBody = (size: number) => ({
  dataUrl: `data:image/png;base64,${png(size).toString('base64')}`,
});

/** The production HTTP setup of main.ts over in-memory providers. */
describe('configureApp', () => {
  const KEY = 'main-test-key';
  const auth = { Authorization: `Bearer ${KEY}` };
  let app: NestExpressApplication;
  let model: InMemoryBrandingRepository;
  let saved: string | undefined;

  beforeAll(async () => {
    saved = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = KEY;
    model = new InMemoryBrandingRepository();
    const moduleRef = await Test.createTestingModule({
      controllers: [...BRANDING_CONTROLLERS, EchoController],
      providers: inMemoryBrandingProviders(model),
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (saved === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = saved;
  });

  it('accepts a 200 KB logo (a JSON body over the 100kb default)', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/admin/branding/logo')
      .set(auth)
      .send(logoBody(200 * 1024))
      .expect(200);
    expect(bodyOf(res).logoUrl).toMatch(/^\/api\/branding\/logo\?v=\d+$/);
    expect(model.docs[0].logo?.data.length).toBe(200 * 1024);
  });

  it('rejects a 201 KB logo with 400, not 413', async () => {
    const before = structuredClone(model.docs);
    const res = await request(app.getHttpServer())
      .put('/api/admin/branding/logo')
      .set(auth)
      .send(logoBody(201 * 1024))
      .expect(400);
    expect(bodyOf(res).message).toBe(
      'El logo debe ser PNG, JPG o WebP de hasta 200 KB.',
    );
    expect(model.docs).toEqual(before);
  });

  it('still rejects JSON bodies over 1mb with 413', async () => {
    await request(app.getHttpServer())
      .post('/api/echo')
      .send({ filler: 'x'.repeat(1024 * 1024) })
      .expect(413);
  });

  it('keeps the raw body for signature checks (WhatsApp webhook)', async () => {
    const payload = JSON.stringify({ hello: 'world' });
    const res = await request(app.getHttpServer())
      .post('/api/echo')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201);
    expect(res.body).toEqual({ rawLength: payload.length, parsed: true });
  });

  it('allows the X-Admin-Username header in CORS preflights', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/admin/session')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,x-admin-username');
    const allowed = String(res.headers['access-control-allow-headers'] ?? '');
    expect(allowed.toLowerCase()).toContain('x-admin-username');
  });

  it('keeps the /api prefix', async () => {
    await request(app.getHttpServer()).get('/api/branding').expect(200);
    await request(app.getHttpServer()).get('/branding').expect(404);
  });
});
