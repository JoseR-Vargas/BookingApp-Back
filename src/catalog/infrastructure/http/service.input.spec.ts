import { BadRequestException } from '@nestjs/common';
import { DomainError } from '../../../shared/domain/domain-error';
import {
  parseCreateServiceInput,
  parseUpdateServiceInput,
} from './service.input';

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

describe('service input', () => {
  const body = {
    name: 'Corte',
    price: 100,
    duration: 30,
    professionals: ['alex-garcia'],
  };

  it('parses a create body, defaulting description and active', () => {
    expect(parseCreateServiceInput({ ...body, icon: 'x' })).toEqual({
      ...body,
      description: '',
      active: true,
    });
  });

  it.each([
    [{ ...body, price: -1 }, 'price must be an integer >= 0'],
    [{ ...body, duration: 4 }, 'duration must be an integer between 5 and 480'],
    [
      { ...body, professionals: [] },
      'professionals must be a non-empty array of professional ids',
    ],
  ])('rejects %j', (invalid, message) => {
    expect(messageOf(() => parseCreateServiceInput(invalid))).toBe(message);
  });

  it('parses an update to the editable fields only', () => {
    expect(parseUpdateServiceInput({ price: 90, icon: 'x' })).toEqual({
      price: 90,
    });
  });
});
