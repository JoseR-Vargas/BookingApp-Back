// ===== PUERTO: BIENVENIDA AL ADMINISTRADOR =====
// Tells the owner of a new business where its panel is. The signup never
// depends on it (spec 21).

export interface WelcomeMessage {
  to: string;
  adminName: string;
  businessName: string;
}

export interface WelcomeNotifier {
  /**
   * Sends the welcome from inside the scope of the new business. It NEVER
   * rejects: when the mail is not configured or fails, it only leaves a
   * warning, and the signup goes on.
   */
  send(message: WelcomeMessage): Promise<void>;
}

export const WELCOME_NOTIFIER = Symbol('WELCOME_NOTIFIER');
