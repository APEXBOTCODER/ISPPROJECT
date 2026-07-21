// Seed data: resources, pricing, waiver v1, demo admin + customer accounts.
// Run with: npm run db:seed
import "dotenv/config";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { DEFAULT_WAIVER_TITLE, DEFAULT_WAIVER_BODY } from "../src/lib/waiverContent";

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

const tournaments = [
  {
    name: "Grand Opening Cup — T10 Cricket",
    timing: "Summer 2026 · opening weekend",
    description:
      "16-team tape-ball tournament to christen the grounds. Trophies, food trucks, family zone.",
    sortOrder: 1,
  },
  {
    name: "Infinity Soccer League — Season 1",
    timing: "Fall 2026",
    description: "7v7 league across two divisions. 8 match guarantee plus playoffs.",
    sortOrder: 2,
  },
  {
    name: "Corporate Sports Day",
    timing: "Dates on request",
    description:
      "Private park hire for company events — cricket, soccer, and field games with catering options.",
    sortOrder: 3,
  },
];

async function main() {
  for (const resource of resources) {
    await prisma.resource.upsert({
      where: { slug: resource.slug },
      update: resource,
      create: resource,
    });
  }

  // Tournaments have no natural unique key — seed once when the table is empty.
  if ((await prisma.tournament.count()) === 0) {
    await prisma.tournament.createMany({ data: tournaments });
  }

  await prisma.waiverDocument.upsert({
    where: { version: 1 },
    update: {},
    create: {
      version: 1,
      title: DEFAULT_WAIVER_TITLE,
      body: DEFAULT_WAIVER_BODY,
    },
  });

  // Admin credentials are NEVER hard-coded. Supply SEED_ADMIN_PASSWORD to set a
  // known one; otherwise a strong random password is generated and printed once.
  // In production, refuse to invent one silently — require it to be provided.
  const isProd = process.env.NODE_ENV === "production";
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@infinitysportspark.com";
  const providedAdminPw = process.env.SEED_ADMIN_PASSWORD;
  const adminPassword =
    providedAdminPw ?? (isProd ? null : randomBytes(12).toString("base64url"));

  if (adminPassword) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "ADMIN" },
      create: {
        email: adminEmail,
        name: "Park Admin",
        role: "ADMIN",
        passwordHash: await bcrypt.hash(adminPassword, 12),
        emailVerified: new Date(),
      },
    });
  } else {
    console.warn(
      "[seed] SEED_ADMIN_PASSWORD not set and NODE_ENV=production — skipped admin creation.\n" +
        "       Create the admin explicitly or re-run with SEED_ADMIN_PASSWORD set."
    );
  }

  // Demo customer only outside production (never ship a known login to prod).
  const demoPassword = isProd ? null : randomBytes(12).toString("base64url");
  if (demoPassword) {
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
  }

  console.log("Seed complete.");
  if (adminPassword && !providedAdminPw) {
    console.log(`  Admin:    ${adminEmail} / ${adminPassword}`);
    console.log("  ^ Randomly generated — store it now; it is not shown again.");
  } else if (adminPassword) {
    console.log(`  Admin:    ${adminEmail} / (using SEED_ADMIN_PASSWORD)`);
  }
  if (demoPassword) {
    console.log(`  Customer: demo@example.com / ${demoPassword}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
