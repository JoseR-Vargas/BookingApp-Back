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

/** 0 = Sunday ... 6 = Saturday, matching Date.prototype.getDay(). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DaySchedule =
  | { closed: true }
  /** `open` and `close` are 'HH:mm' wall-clock strings; `close` is exclusive. */
  | {
      closed: false;
      open: string;
      close: string;
      /**
       * Start times offered that day ('HH:mm', on the 30-minute grid, inside
       * [open, close), sorted). Absent = the global start interval applies.
       */
      starts?: string[];
    };

export interface WeeklySchedule {
  weekly: Record<DayOfWeek, DaySchedule>;
  slotIntervalMinutes: number;
  /** Minutes between the start times offered to the public; a multiple of 30. */
  startIntervalMinutes: number;
}

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

/**
 * What the public availability page (`/disponibilidad`) shows. `serviceIds: null`
 * publishes every active service.
 */
export interface PublicAvailabilitySettings {
  enabled: boolean;
  days: number;
  serviceIds: string[] | null;
}

/** Off until the admin turns it on; a stored document without it reads as this. */
export const PUBLIC_AVAILABILITY: PublicAvailabilitySettings = {
  enabled: false,
  days: 7,
  serviceIds: null,
};

const WEEKDAY: DaySchedule = { closed: false, open: '09:00', close: '20:00' };

export const SCHEDULE: WeeklySchedule = {
  weekly: {
    0: { closed: true },
    1: WEEKDAY,
    2: WEEKDAY,
    3: WEEKDAY,
    4: WEEKDAY,
    5: WEEKDAY,
    6: { closed: false, open: '09:00', close: '18:00' },
  },
  slotIntervalMinutes: 30,
  startIntervalMinutes: 30,
};
