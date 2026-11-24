import { Result, err, ok } from '../../../../shared/domain/result';
import { NoActiveLocationError } from '../../../domain/catalog.errors';
import { Professional } from '../../../domain/professional';
import { locationIdsOf } from '../../../domain/professional.rules';
import { LocationDirectory } from '../../ports/location-directory.port';

/** A professional with the ids of the locations it works at, the default one resolved. */
export interface ProfessionalView {
  professional: Professional;
  locationIds: string[];
}

/** Resolves the locations of a professional against the default location. */
export async function viewOf(
  professional: Professional,
  locations: LocationDirectory,
): Promise<Result<ProfessionalView>> {
  const defaultId = await locations.defaultId();
  if (defaultId === null) return err(new NoActiveLocationError());
  return ok({
    professional,
    locationIds: locationIdsOf(professional, defaultId),
  });
}
