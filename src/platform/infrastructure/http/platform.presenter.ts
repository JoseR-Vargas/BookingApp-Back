// The JSON of the owner panel (spec 25). The presenter is the only place that
// turns the domain of the panel into the shape the API answers.

import {
  PlatformBusiness,
  PlatformBusinessDetail,
} from '../../domain/platform-business';
import { PlatformMetrics } from '../../domain/platform-metrics';

/** A business of the installation, as the API answers it. */
export interface PlatformBusinessJson {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'suspended';
  plan: { id: string; name: string } | null;
  subscriptionStatus: string | null;
  trial: { endsAt: string; daysLeft: number } | null;
  bookingsThisMonth: number;
  storage: { usedBytes: number; quotaBytes: number | null };
  lastUseAt: string | null;
}

/** The metrics of the installation, as the API answers them. */
export interface PlatformMetricsJson {
  businesses: {
    total: number;
    active: number;
    inTrial: number;
    suspended: number;
  };
  bookings: { today: number; thisMonth: number };
  estimatedRevenueByPlan: { planId: string; subscriptions: number }[];
  generatedAt: string;
  expiresAt: string;
}

/** The business of the panel, in JSON. */
export function toBusinessJson(
  business: PlatformBusiness,
): PlatformBusinessJson {
  return {
    id: business.id,
    slug: business.slug,
    name: business.name,
    status: business.status,
    plan: business.plan ? { ...business.plan } : null,
    subscriptionStatus: business.subscriptionStatus,
    trial: business.trial
      ? {
          endsAt: business.trial.endsAt.toISOString(),
          daysLeft: business.trial.daysLeft,
        }
      : null,
    bookingsThisMonth: business.bookingsThisMonth,
    storage: { ...business.storage },
    lastUseAt: business.lastUseAt ? business.lastUseAt.toISOString() : null,
  };
}

/** The detail of a business, in JSON. */
export function toDetailJson(detail: PlatformBusinessDetail): {
  business: PlatformBusinessJson;
  breakdown: {
    professionals: { id: string; bookings: number }[];
    services: { id: string; bookings: number }[];
    locations: { id: string; bookings: number }[];
    catalog: { professionals: number; services: number; locations: number };
  };
} {
  return {
    business: toBusinessJson(detail.business),
    breakdown: {
      professionals: detail.breakdown.professionals.map((entry) => ({
        ...entry,
      })),
      services: detail.breakdown.services.map((entry) => ({ ...entry })),
      locations: detail.breakdown.locations.map((entry) => ({ ...entry })),
      catalog: { ...detail.breakdown.catalog },
    },
  };
}

/** The metrics of the installation, in JSON. */
export function toMetricsJson(
  metrics: PlatformMetrics,
  expiresAt: Date,
): PlatformMetricsJson {
  return {
    businesses: { ...metrics.businesses },
    bookings: { ...metrics.bookings },
    estimatedRevenueByPlan: metrics.estimatedRevenueByPlan.map((entry) => ({
      ...entry,
    })),
    generatedAt: metrics.generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
