import { SignupDraft } from '../../domain/signup.rules';

/**
 * `POST /signup`: `{ businessName, adminName, email, password, slug? }`. The
 * project does not use class-validator: a body that is not an object reads as
 * an empty one, and the rules of the domain answer the first missing field.
 */
export function parseSignupInput(body: unknown): SignupDraft {
  const fields =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  return {
    businessName: fields.businessName,
    adminName: fields.adminName,
    email: fields.email,
    password: fields.password,
    slug: fields.slug,
  };
}
