import { DomainError } from '../../shared/domain/domain-error';

/** User-facing (Spanish) messages of the branding rules. */
export type ColorField = 'accent' | 'background' | 'text' | 'button';

const COLOR_LABELS: Record<ColorField, string> = {
  accent: 'Acento',
  background: 'Fondo',
  text: 'Texto',
  button: 'Botones',
};

const byField = (build: (label: string) => string) =>
  Object.fromEntries(
    Object.entries(COLOR_LABELS).map(([field, label]) => [field, build(label)]),
  ) as Record<ColorField, string>;

export const BRANDING_MESSAGES = {
  invalidBody: 'Los datos de la marca no son válidos.',
  requiredColor: byField((label) => `El color "${label}" es obligatorio.`),
  invalidColor: byField(
    (label) => `El color "${label}" debe tener el formato #rrggbb.`,
  ),
  textContrast:
    'El texto no contrasta lo suficiente con el fondo (mínimo 4.5:1).',
  accentContrast:
    'El acento no contrasta lo suficiente con el fondo (mínimo 3:1).',
  buttonContrast:
    'El color de los botones no contrasta lo suficiente con el fondo (mínimo 2:1).',
  invalidBusinessName: 'El nombre del negocio debe ser texto.',
  businessNameTooLong: 'El nombre del negocio puede tener hasta 60 caracteres.',
  invalidLogo: 'El logo debe ser PNG, JPG o WebP de hasta 200 KB.',
} as const;

/** The name or the colors break a branding rule. */
export class InvalidBrandingError extends DomainError {
  constructor(message: string) {
    super('validation', message);
  }
}

/** The logo is not an accepted image. */
export class InvalidLogoError extends DomainError {
  constructor(message: string = BRANDING_MESSAGES.invalidLogo) {
    super('validation', message);
  }
}

/** There is no logo to serve. */
export class LogoNotFoundError extends DomainError {
  constructor() {
    super('not-found', 'Logo not found');
  }
}
