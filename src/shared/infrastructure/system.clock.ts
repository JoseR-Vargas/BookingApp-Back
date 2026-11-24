import { Injectable } from '@nestjs/common';
import { Clock } from '../application/clock.port';

/** The real clock: the one place that reads the system time. */
@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
