import { AdminUser } from '../../domain/admin-user';

/** Who an authenticated admin request is: the legacy key (an owner) or an account. */
export type AdminActor = { kind: 'key' } | { kind: 'session'; user: AdminUser };

/** The part of the request the guard and the session controller share. */
export interface AdminRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  adminActor?: AdminActor;
}
