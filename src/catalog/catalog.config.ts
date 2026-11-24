import type { WeeklySchedule } from '../shared/domain/schedule/schedule';
import { DEFAULT_PUBLIC_AVAILABILITY } from './domain/public-availability';
import { SEED_SCHEDULE } from './domain/seed-schedule';

export interface Professional {
  id: string;
  name: string;
  specialty: string;
  experience: string;
  rating: number;
  avatar: string;
  available: boolean;
  /** Public photo URL, added by the catalog service; `null` without photo. */
  photoUrl?: string | null;
  /**
   * Ids of the active locations the professional works at. Only the catalog
   * read (`GET /catalog`) fills it in.
   */
  locations?: string[];
}

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  professionals: string[];
  icon: string;
}

export type {
  DayOfWeek,
  DaySchedule,
  WeeklySchedule,
} from '../shared/domain/schedule/schedule';

/** A location as the public catalog shows it. */
export interface PublicLocation {
  id: string;
  name: string;
  address: string;
  schedule: WeeklySchedule;
}

/** A location as the admin panel sees it: the public fields plus `active`. */
export type AdminLocation = PublicLocation & { active: boolean };

export interface Catalog {
  professionals: Professional[];
  services: Service[];
  /** The default location's schedule, kept for clients that predate locations. */
  schedule: WeeklySchedule;
  /** Active locations only. */
  locations: PublicLocation[];
}

export const PROFESSIONALS: Professional[] = [
  {
    id: 'alex-garcia',
    name: 'Alex García',
    specialty: 'Especialista',
    experience: '8 años',
    rating: 4.9,
    avatar: 'fas fa-user-tie',
    available: true,
  },
  {
    id: 'maria-lopez',
    name: 'María López',
    specialty: 'Consultora',
    experience: '6 años',
    rating: 4.8,
    avatar: 'fas fa-user',
    available: true,
  },
];

export const SERVICES: Service[] = [
  {
    id: 'consulta-inicial',
    name: 'Consulta Inicial',
    description: 'Sesión introductoria para evaluar tus necesidades',
    price: 500,
    duration: 30,
    professionals: ['alex-garcia', 'maria-lopez'],
    icon: 'fas fa-clipboard-list',
  },
  {
    id: 'servicio-basico',
    name: 'Servicio Básico',
    description: 'Atención estándar completa con seguimiento profesional',
    price: 1200,
    duration: 60,
    professionals: ['alex-garcia', 'maria-lopez'],
    icon: 'fas fa-star',
  },
  {
    id: 'servicio-premium',
    name: 'Servicio Premium',
    description:
      'Experiencia premium con atención prioritaria y resultados garantizados',
    price: 2500,
    duration: 90,
    professionals: ['alex-garcia', 'maria-lopez'],
    icon: 'fas fa-gem',
  },
  {
    id: 'sesion-expres',
    name: 'Sesión Exprés',
    description: 'Atención rápida y efectiva para ajustarse a tu agenda',
    price: 700,
    duration: 20,
    professionals: ['alex-garcia', 'maria-lopez'],
    icon: 'fas fa-bolt',
  },
];

export type { PublicAvailabilitySettings } from './domain/public-availability';

/** Off until the admin turns it on; a stored document without it reads as this. */
export const PUBLIC_AVAILABILITY = DEFAULT_PUBLIC_AVAILABILITY;

/** The schedule every new installation and every new location starts with. */
export const SCHEDULE: WeeklySchedule = SEED_SCHEDULE;
