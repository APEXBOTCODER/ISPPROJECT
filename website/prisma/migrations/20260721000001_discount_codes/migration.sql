-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PER_RESERVATION',
    "amountCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "oncePerUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode"("code");

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "discountCode" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;
