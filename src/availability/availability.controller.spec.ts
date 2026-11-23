import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LocationNotFoundError } from '../catalog/locations';
import { ServiceSelectionError } from '../catalog/service-selection';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

describe('AvailabilityController', () => {
  let controller: AvailabilityController;
  const availabilityService = { getAvailability: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvailabilityController],
      providers: [
        { provide: AvailabilityService, useValue: availabilityService },
      ],
    }).compile();

    controller = module.get<AvailabilityController>(AvailabilityController);
  });

  it.each([undefined, '', 'abc', '2026-13-40', '2026-02-30'])(
    'responds 400 for date %p',
    async (date) => {
      await expect(
        controller.getAvailability(date as string, 'servicio-basico'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(availabilityService.getAvailability).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', '   ', 'a,,b', 'a, ', ['a', 'b']])(
    'responds 400 for serviceIds %p',
    async (serviceIds) => {
      await expect(
        controller.getAvailability('2026-10-19', serviceIds as string),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(availabilityService.getAvailability).not.toHaveBeenCalled();
    },
  );

  it('responds 404 for an unknown service', async () => {
    availabilityService.getAvailability.mockRejectedValue(
      new ServiceSelectionError('unknown', 'nope'),
    );

    await expect(
      controller.getAvailability('2026-10-19', 'servicio-basico,nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('responds 400 for a duplicated service', async () => {
    availabilityService.getAvailability.mockRejectedValue(
      new ServiceSelectionError('duplicate', 'servicio-basico'),
    );

    await expect(
      controller.getAvailability(
        '2026-10-19',
        'servicio-basico,servicio-basico',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets unexpected errors through', async () => {
    const boom = new Error('db down');
    availabilityService.getAvailability.mockRejectedValue(boom);

    await expect(
      controller.getAvailability('2026-10-19', 'servicio-basico'),
    ).rejects.toBe(boom);
  });

  it('parses the comma separated ids and delegates to the service', async () => {
    const availability = { date: '2026-10-19', closed: false };
    availabilityService.getAvailability.mockResolvedValue(availability);

    await expect(
      controller.getAvailability(
        '2026-10-19',
        'servicio-basico, consulta-inicial',
      ),
    ).resolves.toBe(availability);
    expect(availabilityService.getAvailability).toHaveBeenCalledWith(
      '2026-10-19',
      ['servicio-basico', 'consulta-inicial'],
      undefined,
    );
  });

  it('forwards a trimmed locationId and ignores a blank one', async () => {
    availabilityService.getAvailability.mockResolvedValue({});

    await controller.getAvailability(
      '2026-10-19',
      'servicio-basico',
      ' centro ',
    );
    await controller.getAvailability('2026-10-19', 'servicio-basico', '  ');

    expect(availabilityService.getAvailability).toHaveBeenNthCalledWith(
      1,
      '2026-10-19',
      ['servicio-basico'],
      'centro',
    );
    expect(availabilityService.getAvailability).toHaveBeenNthCalledWith(
      2,
      '2026-10-19',
      ['servicio-basico'],
      undefined,
    );
  });

  it('maps an unknown or inactive location to 404 with the exact message', async () => {
    availabilityService.getAvailability.mockRejectedValue(
      new LocationNotFoundError('nope'),
    );

    const error = await controller
      .getAvailability('2026-10-19', 'servicio-basico', 'nope')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe(
      'Location "nope" not found',
    );
  });
});
