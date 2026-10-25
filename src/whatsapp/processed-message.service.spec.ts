import { ProcessedMessageService } from './processed-message.service';

describe('ProcessedMessageService', () => {
  const model = { create: jest.fn() };
  const service = new ProcessedMessageService(model as never);

  beforeEach(() => jest.resetAllMocks());

  it('claims a message the first time it is seen', async () => {
    model.create.mockResolvedValue({});

    await expect(service.claim('wamid.1')).resolves.toBe(true);
    expect(model.create).toHaveBeenCalledWith({ messageId: 'wamid.1' });
  });

  it('returns false on a duplicate-key error (Meta retry)', async () => {
    model.create.mockRejectedValue({ code: 11000 });

    await expect(service.claim('wamid.1')).resolves.toBe(false);
  });

  it('rethrows any other persistence error', async () => {
    const failure = new Error('connection lost');
    model.create.mockRejectedValue(failure);

    await expect(service.claim('wamid.1')).rejects.toBe(failure);
  });
});
