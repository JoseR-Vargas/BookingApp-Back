import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AvailabilityService } from '../../availability/availability.service';
import { BookingsService } from '../../bookings/bookings.service';
import { CatalogService } from '../../catalog/catalog.service';
import { ConversationStateService } from '../conversation-state.service';
import { WhatsappMessageHandler } from '../whatsapp-message.handler';
import { WhatsappClient } from '../whatsapp.client';
import { InboundMessage, ListRow } from '../whatsapp.types';
import {
  BusinessNow,
  dropPastTimes,
  getBusinessNow,
  nextDates,
} from './business-time';
import {
  BookingSummary,
  MESSAGES,
  bookingConfirmed,
  confirmPrompt,
  formatDay,
  formatServiceDescription,
} from './bot.messages';

type Step =
  | 'choose_service'
  | 'choose_day'
  | 'choose_time'
  | 'choose_professional'
  | 'confirm';

/** Choices accumulated along the flow; each step needs the ones before it. */
interface BotData {
  serviceId?: string;
  date?: string;
  time?: string;
  professionalId?: string;
}

interface Context {
  phone: string;
  now: BusinessNow;
}

interface FreeProfessional {
  id: string;
  name: string;
  slots: string[];
}

const DAYS_AHEAD = 7;
const MAX_LIST_ROWS = 10;
const MAX_BUTTONS = 3;
const DEFAULT_CLIENT_NAME = 'Cliente WhatsApp';
const CONFLICT_ERROR = 'Ya existe una reserva';

/** Data keys each step cannot work without. */
const REQUIRED_DATA: Record<Step, (keyof BotData)[]> = {
  choose_service: [],
  choose_day: ['serviceId'],
  choose_time: ['serviceId', 'date'],
  choose_professional: ['serviceId', 'date', 'time'],
  confirm: ['serviceId', 'date', 'time', 'professionalId'],
};

const GREETING =
  /^(hola|ola|buen[oa]s?|menu|inicio|empezar|reservar|start|hi|hello)(\s|$)/;
const TIME_VALUE = /^([01]\d|2[0-3]):[0-5]\d$/;

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¡!¿?.,]/g, '')
    .trim();

/** Splits a reply id such as `time:10:00` into its kind and value. */
function parseReplyId(id = ''): { kind: string; value: string } {
  const separator = id.indexOf(':');
  return separator < 0
    ? { kind: '', value: '' }
    : { kind: id.slice(0, separator), value: id.slice(separator + 1) };
}

const withPrefix = (prefix: string | undefined, body: string): string =>
  prefix ? `${prefix}\n\n${body}` : body;

const isStep = (value: string): value is Step =>
  Object.keys(REQUIRED_DATA).includes(value);

/**
 * WhatsApp booking conversation: service -> day -> time -> professional ->
 * confirm. The step and the choices so far live in ConversationStateService;
 * every reply is validated against the current step, and anything unexpected
 * just re-sends that step's prompt.
 */
@Injectable()
export class BotHandler extends WhatsappMessageHandler {
  private readonly logger = new Logger(BotHandler.name);

  constructor(
    private readonly client: WhatsappClient,
    private readonly states: ConversationStateService,
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    private readonly bookings: BookingsService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async handle(message: InboundMessage): Promise<void> {
    const phone = message.from;
    const now = getBusinessNow(this.config.get<string>('BUSINESS_TIMEZONE'));
    if (!now) {
      // Without a valid business timezone "today" and past hours are unknown.
      this.logger.error(
        'BUSINESS_TIMEZONE is unset or not a valid IANA timezone; the bot cannot book',
      );
      await this.client.sendText(phone, MESSAGES.unavailable);
      return;
    }
    if (message.type === 'unsupported') {
      await this.client.sendText(phone, MESSAGES.unsupported);
      return;
    }

    const ctx: Context = { phone, now };
    const stored = await this.states.get(phone);
    const step = stored && isStep(stored.step) ? stored.step : null;
    const data = (stored?.data ?? {}) as BotData;
    const resumable =
      step !== null && REQUIRED_DATA[step].every((key) => data[key]);

    if (message.type === 'text') {
      const text = normalize(message.text ?? '');
      if (text === 'cancelar') {
        return this.cancel(ctx);
      }
      if (!resumable || GREETING.test(text)) {
        return this.promptService(ctx);
      }
      return this.prompt(ctx, step, data);
    }

    if (!resumable) {
      return this.promptService(ctx);
    }
    return this.onReply(
      ctx,
      step,
      data,
      parseReplyId(message.replyId),
      message,
    );
  }

  private async onReply(
    ctx: Context,
    step: Step,
    data: BotData,
    reply: { kind: string; value: string },
    message: InboundMessage,
  ): Promise<void> {
    const { kind, value } = reply;
    switch (step) {
      case 'choose_service':
        if (kind === 'svc' && this.catalog.findService(value)) {
          return this.promptDay(ctx, { serviceId: value });
        }
        break;
      case 'choose_day':
        if (
          kind === 'day' &&
          nextDates(ctx.now.date, DAYS_AHEAD).includes(value)
        ) {
          return this.promptTime(ctx, {
            serviceId: data.serviceId,
            date: value,
          });
        }
        break;
      case 'choose_time':
        if (kind === 'time' && TIME_VALUE.test(value)) {
          return this.promptProfessional(ctx, { ...data, time: value });
        }
        break;
      case 'choose_professional':
        if (kind === 'pro' && this.catalog.findProfessional(value)) {
          return this.promptConfirm(ctx, { ...data, professionalId: value });
        }
        break;
      case 'confirm':
        if (kind === 'confirm' && value === 'yes') {
          return this.book(ctx, data, message);
        }
        if (kind === 'confirm' && value === 'no') {
          return this.cancel(ctx);
        }
        break;
    }
    // Stale or malformed reply: do not touch the state, repeat the question.
    return this.prompt(ctx, step, data);
  }

  /** Re-sends the question of an existing step. */
  private prompt(ctx: Context, step: Step, data: BotData): Promise<void> {
    switch (step) {
      case 'choose_service':
        return this.promptService(ctx);
      case 'choose_day':
        return this.promptDay(ctx, data);
      case 'choose_time':
        return this.promptTime(ctx, data);
      case 'choose_professional':
        return this.promptProfessional(ctx, data);
      case 'confirm':
        return this.promptConfirm(ctx, data);
    }
  }

  private async promptService(ctx: Context, prefix?: string): Promise<void> {
    const rows: ListRow[] = this.catalog
      .getCatalog()
      .services.slice(0, MAX_LIST_ROWS)
      .map((service) => ({
        id: `svc:${service.id}`,
        title: service.name,
        description: formatServiceDescription(service.price, service.duration),
      }));
    await this.states.save(ctx.phone, 'choose_service', {});
    await this.client.sendInteractiveList(
      ctx.phone,
      withPrefix(prefix, MESSAGES.servicePrompt),
      MESSAGES.serviceButton,
      rows,
    );
  }

  private async promptDay(
    ctx: Context,
    data: BotData,
    prefix?: string,
  ): Promise<void> {
    const dates = nextDates(ctx.now.date, DAYS_AHEAD);
    const perDay = await Promise.all(
      dates.map((date) => this.freeProfessionals(ctx, data.serviceId!, date)),
    );
    const days = dates.filter((_, index) =>
      perDay[index].some((professional) => professional.slots.length > 0),
    );
    if (days.length === 0) {
      return this.promptService(ctx, MESSAGES.noDays);
    }
    await this.states.save(ctx.phone, 'choose_day', {
      serviceId: data.serviceId,
    });
    await this.client.sendInteractiveList(
      ctx.phone,
      withPrefix(prefix, MESSAGES.dayPrompt),
      MESSAGES.dayButton,
      days.slice(0, MAX_LIST_ROWS).map((date) => ({
        id: `day:${date}`,
        title: formatDay(date),
      })),
    );
  }

  /**
   * Time list for a day. If the day has no free slot left, falls back to the
   * day list. Also used to come back after a conflict or a taken slot.
   */
  private async promptTime(
    ctx: Context,
    data: BotData,
    prefix?: string,
  ): Promise<void> {
    const professionals = await this.freeProfessionals(
      ctx,
      data.serviceId!,
      data.date!,
    );
    const times = [...new Set(professionals.flatMap((p) => p.slots))]
      .sort()
      .slice(0, MAX_LIST_ROWS);
    if (times.length === 0) {
      return this.promptDay(
        ctx,
        { serviceId: data.serviceId },
        MESSAGES.noDaySlots,
      );
    }
    await this.states.save(ctx.phone, 'choose_time', {
      serviceId: data.serviceId,
      date: data.date,
    });
    await this.client.sendInteractiveList(
      ctx.phone,
      withPrefix(prefix, MESSAGES.timePrompt),
      MESSAGES.timeButton,
      times.map((time) => ({ id: `time:${time}`, title: time })),
    );
  }

  private async promptProfessional(ctx: Context, data: BotData): Promise<void> {
    const free = (
      await this.freeProfessionals(ctx, data.serviceId!, data.date!)
    ).filter((professional) => professional.slots.includes(data.time!));
    if (free.length === 0) {
      return this.promptTime(
        ctx,
        { serviceId: data.serviceId, date: data.date },
        MESSAGES.slotTaken,
      );
    }
    await this.states.save(ctx.phone, 'choose_professional', {
      serviceId: data.serviceId,
      date: data.date,
      time: data.time,
    });
    if (free.length <= MAX_BUTTONS) {
      await this.client.sendInteractiveButtons(
        ctx.phone,
        MESSAGES.professionalPrompt,
        free.map((p) => ({ id: `pro:${p.id}`, title: p.name })),
      );
      return;
    }
    await this.client.sendInteractiveList(
      ctx.phone,
      MESSAGES.professionalPrompt,
      MESSAGES.professionalButton,
      free
        .slice(0, MAX_LIST_ROWS)
        .map((p) => ({ id: `pro:${p.id}`, title: p.name })),
    );
  }

  private async promptConfirm(ctx: Context, data: BotData): Promise<void> {
    const free = await this.freeProfessionals(ctx, data.serviceId!, data.date!);
    const isFree = free.some(
      (professional) =>
        professional.id === data.professionalId &&
        professional.slots.includes(data.time!),
    );
    if (!isFree) {
      return this.promptTime(
        ctx,
        { serviceId: data.serviceId, date: data.date },
        MESSAGES.slotTaken,
      );
    }
    await this.states.save(ctx.phone, 'confirm', { ...data });
    await this.client.sendInteractiveButtons(
      ctx.phone,
      confirmPrompt(this.summary(data)),
      [
        { id: 'confirm:yes', title: MESSAGES.confirmButtons.yes },
        { id: 'confirm:no', title: MESSAGES.confirmButtons.no },
      ],
    );
  }

  private async book(
    ctx: Context,
    data: BotData,
    message: InboundMessage,
  ): Promise<void> {
    const service = this.catalog.findService(data.serviceId!)!;
    const professional = this.catalog.findProfessional(data.professionalId!)!;
    try {
      await this.bookings.create({
        client: {
          name: message.profileName?.trim() || DEFAULT_CLIENT_NAME,
          phone: ctx.phone,
        },
        service: {
          id: service.id,
          name: service.name,
          price: service.price,
          duration: service.duration,
        },
        professional: { id: professional.id, name: professional.name },
        date: data.date!,
        time: data.time!,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes(CONFLICT_ERROR)) {
        return this.promptTime(
          ctx,
          { serviceId: data.serviceId, date: data.date },
          MESSAGES.conflict,
        );
      }
      this.logger.error(`Booking from WhatsApp failed: ${reason}`);
      await this.client.sendText(ctx.phone, MESSAGES.failure);
      return;
    }
    // Clear first: if the confirmation text fails to send, the booking exists
    // and the user must not be able to confirm it a second time.
    await this.states.clear(ctx.phone);
    await this.client.sendText(ctx.phone, bookingConfirmed(this.summary(data)));
  }

  private async cancel(ctx: Context): Promise<void> {
    await this.states.clear(ctx.phone);
    await this.client.sendText(ctx.phone, MESSAGES.goodbye);
  }

  private summary(data: BotData): BookingSummary {
    const service = this.catalog.findService(data.serviceId!)!;
    const professional = this.catalog.findProfessional(data.professionalId!);
    return {
      service: service.name,
      date: data.date!,
      time: data.time!,
      professional: professional?.name ?? '',
      price: service.price,
    };
  }

  /** Free start times per professional with already-started hours removed. */
  private async freeProfessionals(
    ctx: Context,
    serviceId: string,
    date: string,
  ): Promise<FreeProfessional[]> {
    const availability = await this.availability.getAvailability(
      date,
      serviceId,
    );
    return (availability?.professionals ?? []).map((professional) => ({
      ...professional,
      slots: dropPastTimes(date, professional.slots, ctx.now),
    }));
  }
}
