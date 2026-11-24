import { BadRequestException } from '@nestjs/common';
import { DomainError } from '../../../shared/domain/domain-error';
import {
  parseCreateProfessionalInput,
  parseProfessionalPhotoInput,
  parseUpdateProfessionalInput,
} from './professional.input';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16, 7),
]);
const dataUrl = (mime: string, bytes: Buffer) =>
  `data:${mime};base64,${bytes.toString('base64')}`;
const PHOTO_ERROR = 'La foto debe ser PNG, JPG o WebP de hasta 200 KB.';

const messageOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError || error instanceof BadRequestException) {
      return error.message;
    }
    throw error;
  }
  throw new Error('did not throw');
};

describe('professional input', () => {
  it('parses the fields, defaulting the optional ones, and no photo', () => {
    expect(parseCreateProfessionalInput({ name: ' Ana ', id: 'x' })).toEqual({
      input: { name: 'Ana', specialty: '', experience: '', active: true },
      photo: null,
    });
  });

  it('decodes the optional photoDataUrl; null and absent mean no photo', () => {
    const { photo } = parseCreateProfessionalInput({
      name: 'Ana',
      photoDataUrl: dataUrl('image/png', PNG),
    });
    expect(photo?.mimeType).toBe('image/png');
    expect(Buffer.compare(photo!.data, PNG)).toBe(0);
    expect(
      parseCreateProfessionalInput({ name: 'Ana', photoDataUrl: null }).photo,
    ).toBeNull();
  });

  it('rejects an invalid photoDataUrl with the photo message', () => {
    expect(
      messageOf(() =>
        parseCreateProfessionalInput({ name: 'Ana', photoDataUrl: 'nope' }),
      ),
    ).toBe(PHOTO_ERROR);
  });

  it('reports a broken field before a broken photo', () => {
    expect(
      messageOf(() =>
        parseCreateProfessionalInput({ name: '', photoDataUrl: 'nope' }),
      ),
    ).toBe('name must be between 1 and 80 characters');
  });

  it('parses an update to the editable fields only', () => {
    expect(
      parseUpdateProfessionalInput({ active: false, rating: 1, photo: 'x' }),
    ).toEqual({ active: false });
    expect(messageOf(() => parseUpdateProfessionalInput({}))).toBe(
      'body must include at least one editable field (name, specialty, experience, active)',
    );
  });

  it('parses the body of the photo upload', () => {
    const photo = parseProfessionalPhotoInput({
      dataUrl: dataUrl('image/png', PNG),
    });
    expect(photo.mimeType).toBe('image/png');
    for (const body of [{}, null, { dataUrl: 5 }, { dataUrl: 'nope' }]) {
      expect(messageOf(() => parseProfessionalPhotoInput(body))).toBe(
        PHOTO_ERROR,
      );
    }
    expect(
      messageOf(() =>
        parseProfessionalPhotoInput({
          dataUrl: dataUrl('image/png', Buffer.alloc(40)),
        }),
      ),
    ).toBe(PHOTO_ERROR);
  });
});
