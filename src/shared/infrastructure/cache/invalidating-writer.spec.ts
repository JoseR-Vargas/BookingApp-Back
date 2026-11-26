import { invalidatingWriter } from './invalidating-writer';

describe('invalidatingWriter', () => {
  const build = () => {
    const calls: string[] = [];
    const writer = {
      save: (value: string) => {
        calls.push(`save:${value}`);
        return Promise.resolve(value.toUpperCase());
      },
      fail: () => Promise.reject(new Error('db down')),
      read: () => Promise.resolve('read'),
    };
    const invalidator = {
      invalidateBusiness: () => calls.push('invalidate'),
    };
    return {
      calls,
      wrapped: invalidatingWriter(writer, invalidator, ['save', 'fail']),
    };
  };

  it('forwards the call and its result, then invalidates', async () => {
    const { calls, wrapped } = build();
    await expect(wrapped.save('a')).resolves.toBe('A');
    expect(calls).toEqual(['save:a', 'invalidate']);
  });

  it('invalidates even when the write fails, and rethrows', async () => {
    const { calls, wrapped } = build();
    await expect(wrapped.fail()).rejects.toThrow('db down');
    expect(calls).toEqual(['invalidate']);
  });

  it('leaves the methods that are not listed alone', async () => {
    const { calls, wrapped } = build();
    await expect(wrapped.read()).resolves.toBe('read');
    expect(calls).toEqual([]);
  });

  it('is the writer itself when there is no invalidator', () => {
    const writer = { save: () => Promise.resolve(1) };
    expect(invalidatingWriter(writer, undefined, ['save'])).toBe(writer);
  });
});
