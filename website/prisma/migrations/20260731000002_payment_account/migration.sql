-- Make Payment.reservationId nullable (account-level ADVANCE payments) via the
-- standard SQLite table rebuild, preserving existing rows.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reservationId" TEXT,
    "userId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'ZELLE',
    "kind" TEXT NOT NULL DEFAULT 'INSTALLMENT',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("id", "reservationId", "userId", "staffId", "amountCents", "method", "kind", "note", "createdAt")
SELECT "id", "reservationId", "userId", "staffId", "amountCents", "method", "kind", "note", "createdAt" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE INDEX "Payment_reservationId_idx" ON "Payment"("reservationId");
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

PRAGMA foreign_keys=ON;

-- One-time reconciliation: existing confirmed non-plan reservations were only
-- confirmed AFTER full (Zelle) payment, so mark them paid in full.
UPDATE "Reservation" SET "paidCents" = "totalCents"
  WHERE "status" = 'CONFIRMED' AND "paymentPlan" = false AND "paidCents" = 0;

-- Backfill a human reservation code for any booking reservation missing one, so
-- every booking can display its code.
UPDATE "Reservation" SET "code" = 'ISP-' || upper(substr(hex(randomblob(4)), 1, 6))
  WHERE "code" IS NULL AND "kind" = 'BOOKING';
