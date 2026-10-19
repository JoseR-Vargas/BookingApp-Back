import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

  it('responds 400 when serviceId is missing', async () => {
    await expect(
      controller.getAvailability('2026-10-19', undefined as unknown as string),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('responds 404 for an unknown service', async () => {
    availabilityService.getAvailability.mockResolvedValue(null);

    await expect(
      controller.getAvailability('2026-10-19', 'nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delegates to the service on the happy path', async () => {
    const availability = { date: '2026-10-19', closed: false };
    availabilityService.getAvailability.mockResolvedValue(availability);

    await expect(
      controller.getAvailability('2026-10-19', 'servicio-basico'),
    ).resolves.toBe(availability);
    expect(availabilityService.getAvailability).toHaveBeenCalledWith(
      '2026-10-19',
      'servicio-basico',
    );
  });
});
