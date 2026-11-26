// ===== CACHÉ DE LAS MÉTRICAS =====
// The metrics of the installation are kept in the memory of the process for
// a minute (spec 25): the free tier of Atlas allows 100 operations per
// second and the owner visits the panel often. With several instances each
// one has its own cache, so a change shows up after at most one live time.

import { Clock } from '../../../shared/application/clock.port';
import {
  CachedMetrics,
  PlatformMetricsCache,
} from '../../application/ports/platform-metrics-cache.port';
import { PlatformMetrics } from '../../domain/platform-metrics';

/** The default live time of the metrics: 60 seconds. */
export const DEFAULT_PLATFORM_METRICS_CACHE_TTL_SECONDS = 60;

/** What the cache keeps: the metrics and the moment they expire. */
interface Entry {
  metrics: PlatformMetrics;
  expiresAt: number;
}

export class InMemoryPlatformMetricsCache implements PlatformMetricsCache {
  private entry: Entry | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly ttlMs: number,
  ) {}

  get(): CachedMetrics | null {
    if (!this.entry) return null;
    if (this.entry.expiresAt <= this.clock.now().getTime()) {
      this.entry = null;
      return null;
    }
    return {
      metrics: this.entry.metrics,
      expiresAt: new Date(this.entry.expiresAt),
    };
  }

  set(metrics: PlatformMetrics): CachedMetrics {
    const expiresAt = this.clock.now().getTime() + this.ttlMs;
    this.entry = { metrics, expiresAt };
    return { metrics, expiresAt: new Date(expiresAt) };
  }
}
