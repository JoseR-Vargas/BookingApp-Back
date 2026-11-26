// ===== PUERTO: CACHÉ DE LAS MÉTRICAS =====
// The metrics of the installation are cached in the memory of the process for
// a minute: the free tier of Atlas allows 100 operations per second and the
// owner of the system visits the panel often (spec 25, spec 22).

import { PlatformMetrics } from '../../domain/platform-metrics';

/** What the cache keeps: the metrics and when they stop being fresh. */
export interface CachedMetrics {
  metrics: PlatformMetrics;
  expiresAt: Date;
}

export interface PlatformMetricsCache {
  /** The metrics kept in memory, or null when there is none (or it expired). */
  get(): CachedMetrics | null;
  /** Keeps the metrics for the live time of the cache and answers the entry. */
  set(metrics: PlatformMetrics): CachedMetrics;
}

export const PLATFORM_METRICS_CACHE = Symbol('PLATFORM_METRICS_CACHE');
