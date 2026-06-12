// Seed data: resources, pricing, waiver v1, demo admin + customer accounts.
// Run with: npm run db:seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  }),
});

const resources = [
  {
    slug: "cricket-ground-1",
    name: "Cricket Ground 1 (Main)",
    sport: "CRICKET",
    description:
      "Full-size cricket ground with professionally maintained turf pitch, sight screens, and boundary ropes. Suited for T20, T10, and tape-ball formats.",
    openHour: 7,
    closeHour: 22,
    baseRate: 6000,
    peakRate: 9000,
    sortOrder: 1,
  },
  {
    slug: "cricket-ground-2",
    name: "Cricket Ground 2",
    sport: "CRICKET",
    description:
      "Second full-size ground with artificial turf pitch — consistent bounce in all weather. Ideal for league matches and team practice.",
    openHour: 7,
    closeHour: 22,
    baseRate: 5000,
    peakRate: 7500,
    sortOrder: 2,
  },
  {
    slug: "soccer-field-1",
    name: "Soccer Field 1 (11v11)",
    sport: "SOCCER",
    description:
      "Regulation 11v11 soccer field with premium Bermuda grass, full-size goals, and line markings refreshed weekly.",
    openHour: 7,
    closeHour: 22,
    baseRate: 7000,
    peakRate: 10500,
    sortOrder: 3,
  },
  {
    slug: "soccer-field-2",
    name: "Soccer Field 2 (7v7)",
    sport: "SOCCER",
    description:
      "7v7 small-sided field — perfect for youth leagues, pickup games, and high-intensity training sessions.",
    openHour: 7,
    closeHour: 22,
    baseRate: 4500,
    peakRate: 7000,
    sortOrder: 4,
  },
  {
    slug: "practice-net-1",
    name: "Practice Net Lane 1",
    sport: "NETS",
    description:
      "Enclosed cricket practice net with artificial turf wicket. Bowling machine add-on available at the front desk.",
    openHour: 7,
    closeHour: 22,
    baseRate: 2500,
    peakRate: 3500,
    sortOrder: 5,
  },
  {
    slug: "practice-net-2",
    name: "Practice Net Lane 2",
    sport: "NETS",
    description:
      "Enclosed cricket practice net with artificial turf wicket — book back-to-back lanes for team sessions.",
    openHour: 7,
    closeHour: 22,
    baseRate: 2500,
    peakRate: 3500,
    sortOrder: 6,
  },
  {
    slug: "training-facility",
    name: "Training Facility",
    sport: "TRAINING",
    description:
      "Indoor training space for fitness, agility, and skills work. Turf flooring, speed ladders, and video-analysis setup.",
    openHour: 6,
    closeHour: 22,
    baseRate: 4000,
    peakRate: 5500,
    sortOrder: 7,
  },
];

const waiverBody = `RELEASE AND WAIVER OF LIABILITY — INFINITY SPORTS PARK

[DRAFT — PLACEHOLDER TEXT. This document has NOT been reviewed by an attorney
and must be replaced with attorney-approved wording for Texas law before launch.]

In consideration of being permitted to enter and use the facilities of Infinity
Sports Park ("the Park"), I acknowledge and agree:

1. ASSUMPTION OF RISK. Participation in cricket, soccer, training, and other
   athletic activities involves inherent risks including serious bodily injury.
   I knowingly and voluntarily assume all such risks.

2. RELEASE. I release and hold harmless Infinity Sports Park, its owners,
   staff, and affiliates (including Argyle Cricket Club) from all claims
   arising from my use of the facilities, to the maximum extent permitted by
   Texas law.

3. MEDICAL. I am physically fit to participate and authorize emergency medical
   treatment if needed.

4. RULES. I agree to follow all posted facility rules and staff instructions.

5. MINORS. If signing for a minor, I represent that I am the parent or legal
   guardian and accept these terms on the minor's behalf.

This waiver remains in effect until superseded by a newer version, which I will
be asked to sign before my next booking.`;

async function main() {
  for (const resource of resources) {
    await prisma.resource.upsert({
      where: { slug: resource.slug },
      update: resource,
      create: resource,
    });
  }

  await prisma.waiverDocument.upsert({
    where: { version: 1 },
    update: {},
    create: {
      version: 1,
      title: "Liability Waiver & Release (v1 — DRAFT)",
      body: waiverBody,
    },
  });

  const adminPassword = "REDACTED";
  await prisma.user.upsert({
    where: { email: "admin@infinitysportspark.com" },
    update: { role: "ADMIN" },
    create: {
      email: "admin@infinitysportspark.com",
      name: "Park Admin",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(adminPassword, 12),
      emailVerified: new Date(),
    },
  });

  const demoPassword = "REDACTED";
  await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      email: "demo@example.com",
      name: "Demo Customer",
      role: "CUSTOMER",
      passwordHash: await bcrypt.hash(demoPassword, 12),
      emailVerified: new Date(),
    },
  });

  console.log("Seed complete.");
  console.log("  Admin:    admin@infinitysportspark.com / " + adminPassword);
  console.log("  Customer: demo@example.com / " + demoPassword);
  console.log("  (Change both passwords before any shared/staging deployment.)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
