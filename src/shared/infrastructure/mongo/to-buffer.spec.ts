import { mongo } from 'mongoose';
import { toBuffer } from './to-buffer';

describe('toBuffer', () => {
  it('reads Buffers, Uint8Arrays and BSON Binary values', () => {
    const bytes = Buffer.from([1, 2, 3, 4]);
    expect(Buffer.compare(toBuffer(bytes), bytes)).toBe(0);
    expect(Buffer.compare(toBuffer(new Uint8Array(bytes)), bytes)).toBe(0);
    const binary = new mongo.Binary(bytes);
    expect(Buffer.compare(toBuffer(binary), bytes)).toBe(0);
  });

  it('rejects anything else', () => {
    expect(() => toBuffer(null)).toThrow(TypeError);
    expect(() => toBuffer('text')).toThrow('Unsupported logo data');
  });
});
