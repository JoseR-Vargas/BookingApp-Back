import { ConversationStateService } from './conversation-state.service';

describe('ConversationStateService', () => {
  const exec = jest.fn();
  const model = {
    findOne: jest.fn(() => ({ lean: () => ({ exec }) })),
    findOneAndUpdate: jest.fn(() => ({ exec })),
    deleteOne: jest.fn(() => ({ exec })),
  };
  const service = new ConversationStateService(model as never);

  beforeEach(() => {
    jest.clearAllMocks();
    exec.mockReset();
  });

  it('returns null when the phone has no conversation', async () => {
    exec.mockResolvedValue(null);

    await expect(service.get('549')).resolves.toBeNull();
    expect(model.findOne).toHaveBeenCalledWith({ phone: '549' });
  });

  it('returns the stored step and data', async () => {
    exec.mockResolvedValue({
      phone: '549',
      step: 'choose_day',
      data: { serviceId: 'corte' },
    });

    await expect(service.get('549')).resolves.toEqual({
      step: 'choose_day',
      data: { serviceId: 'corte' },
    });
  });

  it('defaults missing data to an empty object', async () => {
    exec.mockResolvedValue({ phone: '549', step: 'start' });

    await expect(service.get('549')).resolves.toEqual({
      step: 'start',
      data: {},
    });
  });

  it('upserts the state and refreshes updatedAt (TTL)', async () => {
    exec.mockResolvedValue({});
    const before = Date.now();

    await service.save('549', 'choose_time', { day: '2026-10-20' });

    const [filter, update, options] = (
      model.findOneAndUpdate.mock.calls as unknown as [
        unknown,
        { $set: { step: string; data: unknown; updatedAt: Date } },
        unknown,
      ][]
    )[0];
    expect(filter).toEqual({ phone: '549' });
    expect(update.$set.step).toBe('choose_time');
    expect(update.$set.data).toEqual({ day: '2026-10-20' });
    expect(update.$set.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(options).toMatchObject({ upsert: true });
  });

  it('clears the conversation', async () => {
    exec.mockResolvedValue({});

    await service.clear('549');

    expect(model.deleteOne).toHaveBeenCalledWith({ phone: '549' });
  });
});
