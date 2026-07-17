import { prisma } from "@/lib/prisma";

/**
 * Editable site copy / toggles. These defaults render when no SiteSetting row
 * overrides them, so the site works before an admin touches anything. Admins
 * edit the values at /admin/content.
 */
export const SETTING_DEFAULTS = {
  "contact.email": "hello@infinitysportspark.com",
  "contact.phone": "940-233-8993",
  "contact.address": "Denton County, Texas",
  "soccer.comingSoon": "true",
  "soccer.bannerText":
    "Soccer is coming soon — fields are being finished ahead of our Summer 2026 launch.",
  "soccer.leaseText":
    "Are you a club looking for a long-term lease? Let's talk about dedicated season access at Infinity.",
  "soccer.leaseEmail": "hello@infinitysportspark.com",
  "membership.tiersText":
    "Membership tiers — coming soon. Member discounts, hour packages (buy 10, save 15%), and team season passes launch with the park in Summer 2026. Founding-member pricing is announced first to the mailing list.",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

/** Human-friendly metadata for the admin editor. */
export const SETTING_FIELDS: {
  key: SettingKey;
  label: string;
  help: string;
  type: "text" | "textarea" | "boolean" | "email" | "tel";
}[] = [
  {
    key: "contact.email",
    label: "Contact: email address",
    help: "Public contact email shown on the Contact page and in the footer.",
    type: "email",
  },
  {
    key: "contact.phone",
    label: "Contact: phone number",
    help: "Public phone number shown on the Contact page and in the footer.",
    type: "tel",
  },
  {
    key: "contact.address",
    label: "Contact: address",
    help: "Public address / location shown on the Contact page and in the footer.",
    type: "textarea",
  },
  {
    key: "soccer.comingSoon",
    label: "Soccer: show “coming soon” banner",
    help: "When on, the Soccer page shows the coming-soon banner and the lease enquiry CTA.",
    type: "boolean",
  },
  {
    key: "soccer.bannerText",
    label: "Soccer: banner text",
    help: "Shown in the coming-soon banner at the top of the Soccer page.",
    type: "textarea",
  },
  {
    key: "soccer.leaseText",
    label: "Soccer: long-term lease pitch",
    help: "Shown in the bottom call-to-action inviting clubs to enquire.",
    type: "textarea",
  },
  {
    key: "soccer.leaseEmail",
    label: "Soccer: lease enquiry email",
    help: "The mailto address behind the “Enquire about a lease” button.",
    type: "email",
  },
  {
    key: "membership.tiersText",
    label: "Pricing: membership tiers copy",
    help: "The “Member tiers” paragraph on the Pricing page.",
    type: "textarea",
  },
];

export type Settings = Record<SettingKey, string>;

/** All settings, with DB rows layered over the code defaults. */
export async function getSettings(): Promise<Settings> {
  const rows = await prisma.siteSetting.findMany();
  const map: Settings = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (row.key in map) map[row.key as SettingKey] = row.value;
  }
  return map;
}

export function isEnabled(value: string | undefined): boolean {
  return value === "true";
}
