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
  | { closed: false; open: string; close: string };

export interface WeeklySchedule {
  weekly: Record<DayOfWeek, DaySchedule>;
  slotIntervalMinutes: number;
}

export interface Catalog {
  professionals: Professional[];
  services: Service[];
  schedule: WeeklySchedule;
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
};
