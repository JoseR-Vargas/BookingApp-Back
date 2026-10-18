import { Test, TestingModule } from '@nestjs/testing';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

describe('CatalogController', () => {
  let controller: CatalogController;
  const catalog = { professionals: [], services: [], schedule: {} };
  const catalogService = { getCatalog: jest.fn().mockReturnValue(catalog) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{ provide: CatalogService, useValue: catalogService }],
    }).compile();

    controller = module.get<CatalogController>(CatalogController);
  });

  it('returns the catalog from the service', () => {
    expect(controller.getCatalog()).toBe(catalog);
    expect(catalogService.getCatalog).toHaveBeenCalled();
  });
});
