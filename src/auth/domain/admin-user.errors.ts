import { DomainError } from '../../shared/domain/domain-error';

/** User-facing (Spanish) messages of the admin account rules. */
export const ADMIN_MESSAGES = {
  invalidEmail: 'El correo no es válido.',
  invalidName: 'El nombre debe tener entre 1 y 80 caracteres.',
  shortPassword: 'La contraseña debe tener al menos 10 caracteres.',
  longPassword: 'La contraseña puede tener hasta 128 caracteres.',
  invalidRole: 'El rol debe ser owner, staff o viewer.',
  invalidBody: 'Los datos del usuario no son válidos.',
  invalidCredentials: 'Correo o contraseña incorrectos',
  invalidSession: 'La sesión no es válida o venció.',
  emailTaken: 'Ya existe un usuario con ese correo.',
  userNotFound: 'Usuario no encontrado.',
  lastOwner: 'Debe quedar al menos un propietario activo en el negocio.',
  forbiddenRole: 'No tienes permiso para realizar esta acción.',
} as const;

/** The data of an account breaks a rule. */
export class InvalidAdminUserError extends DomainError {
  constructor(message: string) {
    super('validation', message);
  }
}

/**
 * The login failed. One message for every cause: it never says which. Its kind
 * is `forbidden` (the shared kinds have no "unauthorized"); the HTTP edge of
 * the auth module answers it as a 401 (`respondAuth`).
 */
export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('forbidden', ADMIN_MESSAGES.invalidCredentials);
  }
}

/** The session does not exist, expired, or its account is gone or inactive. */
export class InvalidSessionError extends DomainError {
  constructor() {
    super('forbidden', ADMIN_MESSAGES.invalidSession);
  }
}

export class AdminUserNotFoundError extends DomainError {
  constructor() {
    super('not-found', ADMIN_MESSAGES.userNotFound);
  }
}

/** The email already belongs to an account of the business. */
export class AdminEmailTakenError extends DomainError {
  constructor() {
    super('conflict', ADMIN_MESSAGES.emailTaken);
  }
}

/** The change would leave the business without an active owner. */
export class LastOwnerError extends DomainError {
  constructor() {
    super('conflict', ADMIN_MESSAGES.lastOwner);
  }
}
