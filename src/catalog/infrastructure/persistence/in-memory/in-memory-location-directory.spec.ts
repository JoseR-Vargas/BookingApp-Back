import { describeLocationDirectoryContract } from '../../../application/ports/location-directory.contract';
import { InMemoryLocationDirectory } from './in-memory-location-directory';

describeLocationDirectoryContract('in-memory', () => {
  const directory = new InMemoryLocationDirectory();
  return Promise.resolve({
    directory,
    seed: (location) => {
      directory.seed(location);
      return Promise.resolve();
    },
  });
});
