/*
  Warnings:

  - You are about to drop the column `weekId` on the `LectureHelpSlot` table. All the data in the column will be lost.
  - Added the required column `instructors` to the `LectureHelpSlot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `location` to the `LectureHelpSlot` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "LectureHelpSlot" DROP CONSTRAINT "LectureHelpSlot_weekId_fkey";

-- AlterTable
ALTER TABLE "LectureHelpSlot" DROP COLUMN "weekId",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "instructors" TEXT NOT NULL,
ADD COLUMN     "location" TEXT NOT NULL,
ALTER COLUMN "capacity" SET DEFAULT 6;
