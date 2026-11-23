import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { getBusinessNow } from '../whatsapp/bot/business-time';
import { AvailabilityService } from './availability.service';

export interface PublicAvailabilityDay {
  date: string;
  closed: boolean;
  times: {
    time: string;
    professionals: { id: string; name: string }[];
  }[];
}

export type PublicAvailability =
  | { enabled: false }
  | {
      enabled: true;
      services: { id: string; name: string; duration: number }[];
      serviceId: string | null;
      days: PublicAvailabilityDay[];
    };

const pad = (value: number) => String(value).padStart(2, '0');

/** `date` plus `offset` days, as 'YYYY-MM-DD' (pure calendar arithmetic). */
function addDays(date: string, offset: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + offset));
  return moved.toISOString().slice(0, 10);
}

/**
 * The general view behind `/disponibilidad`: for one service, the times of the
 * next days at which AT LEAST ONE professional is free. The hours themselves
 * come from `AvailabilityService`, the single source the booking modal and the
 * WhatsApp bot use too.
 */
@Injectable()
export class PublicAvailabilityService {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  /** @throws NotFoundException for a service that is not published. */
  async getPublicAvailability(
    serviceId: string | undefined,
    now: Date = new Date(),
  ): Promise<PublicAvailability> {
    const settings = await this.catalogService.getPublicAvailability();
    if (!settings.enabled) {
      return { enabled: false };
    }

    const { services: active } = await this.catalogService.getCatalog();
    const published = active
      .filter(
        (service) =>
          settings.serviceIds === null ||
          settings.serviceIds.includes(service.id),
      )
      .map(({ id, name, duration }) => ({ id, name, duration }));

    if (serviceId !== undefined && !published.some((s) => s.id === serviceId)) {
      throw new NotFoundException(`Service "${serviceId}" not found`);
    }
    const chosen = serviceId ?? published[0]?.id ?? null;
    if (chosen === null) {
      return { enabled: true, services: [], serviceId: null, days: [] };
    }

    // "Today" and the clock are the business's: the timezone-less fallback is the
    // UTC date and never hides an hour (a wrong zone would hide real turns).
    const zoned = getBusinessNow(process.env.BUSINESS_TIMEZONE, now);
    const today = zoned?.date ?? now.toISOString().slice(0, 10);
    const nowTime = zoned ? `${pad(zoned.hour)}:${pad(zoned.minute)}` : null;

    const dates = Array.from({ length: settings.days }, (_, offset) =>
      addDays(today, offset),
    );
    const availabilities = await Promise.all(
      dates.map((date) =>
        this.availabilityService.getAvailability(date, [chosen]),
      ),
    );

    return {
      enabled: true,
      services: published,
      serviceId: chosen,
      days: availabilities.map((availability) => {
        const byTime = new Map<string, { id: string; name: string }[]>();
        for (const professional of availability.professionals) {
          for (const time of professional.slots) {
            if (
              availability.date === today &&
              nowTime !== null &&
              time <= nowTime
            ) {
              continue;
            }
            const free = byTime.get(time) ?? [];
            free.push({ id: professional.id, name: professional.name });
            byTime.set(time, free);
          }
        }
        return {
          date: availability.date,
          closed: availability.closed,
          times: [...byTime.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([time, professionals]) => ({ time, professionals })),
        };
      }),
    };
  }
}
