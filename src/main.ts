import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DomainErrorFilter } from './shared/infrastructure/http/domain-error.filter';

export async function createApp(): Promise<NestExpressApplication> {
  // rawBody: the WhatsApp webhook signature is computed over the raw bytes.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  configureApp(app);
  return app;
}

/** HTTP setup shared by the server and its tests: body parsing, prefix, CORS, domain errors. */
export function configureApp(app: NestExpressApplication): void {
  // A 200 KB logo is ~270 KB in base64, above the 100kb default. Nest passes
  // the app's `rawBody` option to this parser, so the webhook keeps req.rawBody.
  app.useBodyParser('json', { limit: '1mb' });

  // Business-rule errors (src/shared) leave the app as the matching HTTP error.
  app.useGlobalFilters(new DomainErrorFilter());

  // Configurar prefijo global /api para todas las rutas excepto la raíz
  app.setGlobalPrefix('api', {
    exclude: ['/', '/health'],
  });

  // Configuración CORS más permisiva para producción
  const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://booking-app-front-peach.vercel.app']
      : true, // En desarrollo permite cualquier origen
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Admin-Username',
    ],
    exposedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  };

  app.enableCors(corsOptions);
}

async function bootstrap() {
  const app = await createApp();
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}

if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('Error fatal al iniciar la aplicación:', error);
    process.exit(1);
  });
}
