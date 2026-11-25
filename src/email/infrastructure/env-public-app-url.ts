// ===== URL PÚBLICA (ENTORNO) =====
// The public base URL of the frontend (`PUBLIC_APP_URL`), without a trailing
// slash, or null when it is missing or is not an http(s) URL. Emails link to
// it, so nothing else is ever put in an href.

import { Injectable } from '@nestjs/common';
import { PublicAppUrl } from '../application/ports/public-app-url.port';

@Injectable()
export class EnvPublicAppUrl implements PublicAppUrl {
  read(): string | null {
    const url = process.env.PUBLIC_APP_URL?.trim();
    return url && /^https?:\/\//i.test(url) ? url.replace(/\/+$/, '') : null;
  }
}
