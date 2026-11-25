import { describeBusinessSettingsContract } from '../../../application/ports/business-settings.contract';
import { InMemoryBusinessSettings } from './in-memory-business-settings';

describeBusinessSettingsContract('in-memory', () => {
  const settings = new InMemoryBusinessSettings();
  return Promise.resolve({
    publicReader: settings,
    publicWriter: settings,
    legacy: settings,
    seed: (doc) => {
      settings.seed(doc);
      return Promise.resolve();
    },
    stored: () => Promise.resolve(settings.stored()),
  });
});
