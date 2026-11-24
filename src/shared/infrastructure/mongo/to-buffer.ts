/**
 * Normalises stored binary data (logo, professional photo): lean Mongo reads
 * return a BSON `Binary` for a Buffer saved in a Mixed field, test doubles
 * may return a Uint8Array.
 */
export function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  const binary = value as { buffer?: unknown; position?: unknown } | null;
  if (binary && binary.buffer instanceof Uint8Array) {
    const length =
      typeof binary.position === 'number'
        ? binary.position
        : binary.buffer.byteLength;
    return Buffer.from(binary.buffer.buffer, binary.buffer.byteOffset, length);
  }
  throw new TypeError('Unsupported logo data');
}
