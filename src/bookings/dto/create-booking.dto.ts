export class CreateBookingDto {
  client: {
    name: string;
    id?: string;
    /** Optional: WhatsApp bookings only provide a phone number. */
    email?: string;
    phone: string;
  };

  /**
   * Services performed back-to-back by the professional. Only `id` is
   * trusted; name, price and duration are taken from the catalog when the
   * booking is validated.
   */
  services: { id: string }[];

  professional: {
    id: string;
    name: string;
  };

  date: string;
  time: string;
  notes?: string;
  status?: string;
}

export type UpdateBookingDto = Partial<CreateBookingDto>;
