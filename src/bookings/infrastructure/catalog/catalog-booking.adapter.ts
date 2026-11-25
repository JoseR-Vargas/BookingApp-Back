// ===== CATÁLOGO PARA RESERVAS =====
// The bookings module asks the catalog for the services, professionals, locations and hours of a
// booking. It does not know the catalog's storage: this adapter answers through the catalog's
// public facade (which is itself hexagonal), and it is replaced when the facade disappears.

import { Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/domain-error';
import { WeeklySchedule } from '../../../shared/domain/schedule/schedule';
import { CatalogService } from '../../../catalog/catalog.service';
import { LocationNotFoundError } from '../../../catalog/locations';
import { ServiceSelectionError } from '../../../catalog/service-selection';
import {
  BookingCatalog,
  CatalogProfessional,
} from '../../application/ports/booking-catalog.port';
import { BookingPlace } from '../../domain/booking';
import { SelectedServices } from '../../domain/booking.rules';

/** The message the API has always sent for a location that does not exist. */
const LOCATION_UNKNOWN = 'Error de validación: el local seleccionado no existe';

@Injectable()
export class CatalogBookingAdapter implements BookingCatalog {
  constructor(private readonly catalog: CatalogService) {}

  async getLocation(locationId?: string): Promise<Result<BookingPlace>> {
    try {
      const location = await this.catalog.getLocation(locationId);
      return ok({ id: location.id, name: location.name });
    } catch (error) {
      if (error instanceof LocationNotFoundError) {
        return err(new DomainError('validation', LOCATION_UNKNOWN));
      }
      throw error;
    }
  }

  async getActiveLocations(): Promise<BookingPlace[]> {
    const locations = await this.catalog.getActiveLocations();
    return locations.map((location) => ({
      id: location.id,
      name: location.name,
    }));
  }

  async getSchedule(locationId: string): Promise<Result<WeeklySchedule>> {
    try {
      return ok(await this.catalog.getSchedule(locationId));
    } catch (error) {
      if (error instanceof LocationNotFoundError) {
        return err(new DomainError('validation', LOCATION_UNKNOWN));
      }
      throw error;
    }
  }

  async resolveServices(
    serviceIds: string[],
  ): Promise<Result<SelectedServices & { professionals: string[] }>> {
    try {
      const selection = await this.catalog.resolveServices(serviceIds);
      return ok({
        services: selection.services.map((service) => ({
          id: service.id,
          name: service.name,
          price: service.price,
          duration: service.duration,
          professionals: service.professionals ?? [],
        })),
        totalPrice: selection.totalPrice,
        totalDuration: selection.totalDuration,
        professionals: selection.professionals.map(
          (professional) => professional.id,
        ),
      });
    } catch (error) {
      if (error instanceof ServiceSelectionError) {
        return err(
          new DomainError(
            'validation',
            `Error de validación: ${error.message}`,
          ),
        );
      }
      throw error;
    }
  }

  async findProfessional(id: string): Promise<CatalogProfessional | null> {
    const professional = await this.catalog.findProfessional(id);
    return professional
      ? { id: professional.id, name: professional.name }
      : null;
  }

  async worksAtLocation(
    professionalId: string,
    locationId: string,
  ): Promise<boolean> {
    return this.catalog.worksAtLocation(professionalId, locationId);
  }
}
