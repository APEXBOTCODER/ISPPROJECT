-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_code_key" ON "Reservation"("code");
