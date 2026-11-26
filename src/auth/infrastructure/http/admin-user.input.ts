import {
  ADMIN_MESSAGES,
  InvalidAdminUserError,
} from '../../domain/admin-user.errors';

/**
 * Input shape of the admin account endpoints (the project does not use
 * class-validator): the body must be an object. The values stay untrusted and
 * go to the use cases, which apply the rules.
 */
const bodyOf = (body: unknown): Record<string, unknown> => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new InvalidAdminUserError(ADMIN_MESSAGES.invalidBody);
  }
  return body as Record<string, unknown>;
};

/** `POST /admin/users`: `{ email, name, password, role }`. */
export function parseCreateUserInput(body: unknown) {
  const { email, name, password, role } = bodyOf(body);
  return { email, name, password, role };
}

/** `PATCH /admin/users/:id/role`: `{ role }`. */
export const parseRoleInput = (body: unknown): unknown => bodyOf(body).role;

/** `PUT /admin/users/:id/password`: `{ password }`. */
export const parsePasswordInput = (body: unknown): unknown =>
  bodyOf(body).password;

/** `POST /admin/session`: a body that is not an object is a failed login, not a 400. */
export function parseLoginInput(body: unknown): {
  email: unknown;
  password: unknown;
} {
  const fields =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  return { email: fields.email, password: fields.password };
}
