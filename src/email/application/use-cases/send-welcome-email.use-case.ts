// ===== CASO DE USO: CORREO DE BIENVENIDA =====
// Welcomes the owner of a new business with the link of its panel (spec 21).
// It runs inside the scope of the new business, so the public URL already
// names it (`/n/<slug>`); the panel lives at `/login` under it.

import { Inject, Injectable } from '@nestjs/common';
import { welcomeEmail } from '../../domain/welcome-email.template';
import { EMAIL_SENDER, EmailSender } from '../ports/email-sender.port';
import { PUBLIC_APP_URL, PublicAppUrl } from '../ports/public-app-url.port';

export interface WelcomeEmailInput {
  to: string;
  adminName: string;
  businessName: string;
}

@Injectable()
export class SendWelcomeEmailUseCase {
  constructor(
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    @Inject(PUBLIC_APP_URL) private readonly appUrl: PublicAppUrl,
  ) {}

  /** Sends the email; a failure of the sender is the caller's to handle. */
  async execute(input: WelcomeEmailInput): Promise<void> {
    const base = this.appUrl.read();
    const { subject, html } = welcomeEmail({
      adminName: input.adminName,
      businessName: input.businessName,
      panelUrl: base ? `${base}/login` : null,
    });
    await this.sender.send({ to: input.to, subject, html });
  }
}
