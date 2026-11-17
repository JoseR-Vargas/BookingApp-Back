import { BadRequestException } from '@nestjs/common';
import { MAX_IMAGE_BYTES, parseImageDataUrl } from './image-data-url';

const MESSAGE = 'Custom image message.';
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const WEBP = [
  ...Buffer.from('RIFF', 'ascii'),
  0,
  0,
  0,
  0,
  ...Buffer.from('WEBP', 'ascii'),
];

const image = (header: number[], size = 64): Buffer => {
  const bytes = Buffer.alloc(size);
  Buffer.from(header).copy(bytes);
  return bytes;
};

const dataUrl = (mime: string, bytes: Buffer) =>
  `data:${mime};base64,${bytes.toString('base64')}`;

const rejects = (value: unknown) => {
  try {
    parseImageDataUrl(value, MESSAGE);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(MESSAGE);
    return;
  }
  throw new Error('expected parseImageDataUrl to throw');
};

describe('parseImageDataUrl', () => {
  it('has a 200 KB limit', () => {
    expect(MAX_IMAGE_BYTES).toBe(200 * 1024);
  });

  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
    ['image/webp', WEBP],
  ])('accepts %s whose bytes match', (mime, header) => {
    const data = image(header);
    const parsed = parseImageDataUrl(dataUrl(mime, data), MESSAGE);
    expect(parsed.mimeType).toBe(mime);
    expect(parsed.data.equals(data)).toBe(true);
  });

  it('accepts exactly the size limit and rejects one byte more', () => {
    const ok = parseImageDataUrl(
      dataUrl('image/png', image(PNG, MAX_IMAGE_BYTES)),
      MESSAGE,
    );
    expect(ok.data.length).toBe(MAX_IMAGE_BYTES);
    rejects(dataUrl('image/png', image(PNG, MAX_IMAGE_BYTES + 1)));
  });

  it('rejects a declared type that does not match the bytes', () => {
    rejects(dataUrl('image/png', image(JPEG)));
    rejects(dataUrl('image/jpeg', image(WEBP)));
  });

  it('rejects a file that is not an image despite its declared type', () => {
    rejects(dataUrl('image/jpeg', Buffer.from('not an image at all')));
  });

  it('rejects SVG and other types', () => {
    rejects(dataUrl('image/svg+xml', Buffer.from('<svg></svg>')));
    rejects(dataUrl('image/gif', image([0x47, 0x49, 0x46])));
  });

  it('rejects malformed values with the given message', () => {
    rejects(undefined);
    rejects(42);
    rejects('');
    rejects('image/png;base64,AAAA');
    rejects('data:image/png;base64,');
    rejects('data:image/png;base64,@@@@');
  });
});
