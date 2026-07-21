import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";

/**
 * Booking/refund rules. Defaults come from config.ts; an admin can override any
 * of them at /admin/settings (stored as SiteSetting rows keyed "policy.<name>").
 */
export type BookingPolicy = {
  advanceBookingDays: number;
  holdMinutes: number;
  maxHoursPerSegment: number;
  maxSegmentsPerReservation: number;
  fullRefundHours: number;
  halfRefundHours: number;
  unpaidExpiryHours: number;
};

export const POLICY_DEFAULTS: BookingPolicy = {
  advanceBookingDays: config.advanceBookingDays,
  holdMinutes: config.holdMinutes,
  maxHoursPerSegment: config.maxHoursPerSegment,
  maxSegmentsPerReservation: config.maxSegmentsPerReservation,
  fullRefundHours: config.cancellationPolicy.fullRefundHours,
  halfRefundHours: config.cancellationPolicy.halfRefundHours,
  unpaidExpiryHours: 2,
};

export const POLICY_FIELDS: {
  key: keyof BookingPolicy;
  label: string;
  help: string;
  min: number;
  max: number;
}[] = [
  { key: "advanceBookingDays", label: "Advance booking window (days)", help: "How many days ahead customers may book.", min: 1, max: 365 },
  { key: "holdMinutes", label: "Unpaid hold (minutes)", help: "How long an unpaid hold keeps its slots before auto-releasing.", min: 1, max: 120 },
  { key: "maxHoursPerSegment", label: "Max hours per day-segment", help: "Longest single-day contiguous block a customer can book.", min: 1, max: 24 },
  { key: "maxSegmentsPerReservation", label: "Max days per reservation", help: "How many day-segments one reservation can contain.", min: 1, max: 90 },
  { key: "fullRefundHours", label: "Full-refund window (hours)", help: "Cancel this many hours ahead for a 100% refund.", min: 1, max: 336 },
  { key: "halfRefundHours", label: "Half-refund window (hours)", help: "Cancel this many hours ahead for a 50% refund.", min: 1, max: 336 },
  { key: "unpaidExpiryHours", label: "Unpaid reservation auto-expire (hours)", help: "Release an unpaid (Zelle-pending) reservation's slots if payment isn't confirmed within this many hours.", min: 1, max: 720 },
];

/** Effective policy = code defaults with any admin overrides layered on. */
export async function getBookingPolicy(): Promise<BookingPolicy> {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { startsWith: "policy." } },
  });
  const policy: BookingPolicy = { ...POLICY_DEFAULTS };
  for (const row of rows) {
    const name = row.key.slice("policy.".length) as keyof BookingPolicy;
    if (name in policy) {
      const n = parseInt(row.value, 10);
      if (!Number.isNaN(n)) policy[name] = n;
    }
  }
  return policy;
}

/** Cancellation-policy refund percentage given the effective thresholds. */
export function refundPercentForPolicy(
  hoursAhead: number,
  policy: Pick<BookingPolicy, "fullRefundHours" | "halfRefundHours">
): number {
  if (hoursAhead >= policy.fullRefundHours) return 100;
  if (hoursAhead >= policy.halfRefundHours) return 50;
  return 0;
}
