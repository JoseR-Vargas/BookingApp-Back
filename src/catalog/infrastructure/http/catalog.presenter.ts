import type { Professional as PublicProfessional } from '../../catalog.config';
import type { Service as PublicService } from '../../catalog.config';
import { Professional } from '../../domain/professional';
import { Service } from '../../domain/service';
import { ProfessionalView } from '../../application/use-cases/professionals/professional-view';

/** Admin view of a professional: the stored fields, `active` included. */
export interface AdminProfessional {
  id: string;
  name: string;
  specialty: string;
  experience: string;
  rating: number;
  avatar: string;
  active: boolean;
  photoUrl: string | null;
  /** Stored location ids (inactive ones included); absent = the default. */
  locations: string[];
}

/** Admin view of a service: the public fields plus `active`. */
export type AdminService = PublicService & { active: boolean };

const photoUrlOf = (professional: Professional): string | null =>
  professional.photo
    ? `/api/catalog/professionals/${professional.id}/photo?v=${professional.photo.updatedAt.getTime()}`
    : null;

export const toAdminProfessional = ({
  professional,
  locationIds,
}: ProfessionalView): AdminProfessional => ({
  id: professional.id,
  name: professional.name,
  specialty: professional.specialty,
  experience: professional.experience,
  rating: professional.rating,
  avatar: professional.avatar,
  active: professional.active,
  photoUrl: photoUrlOf(professional),
  locations: locationIds,
});

export const toPublicProfessional = (
  professional: Professional,
): PublicProfessional => ({
  id: professional.id,
  name: professional.name,
  specialty: professional.specialty,
  experience: professional.experience,
  rating: professional.rating,
  avatar: professional.avatar,
  available: true,
  photoUrl: photoUrlOf(professional),
});

export const toPublicService = (service: Service): PublicService => ({
  id: service.id,
  name: service.name,
  description: service.description,
  price: service.price,
  duration: service.duration,
  professionals: [...service.professionals],
  icon: service.icon,
});

export const toAdminService = (service: Service): AdminService => ({
  ...toPublicService(service),
  active: service.active,
});
