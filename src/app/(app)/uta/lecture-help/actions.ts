"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

export type SignupResult = { ok: true } | { ok: false; error: string };

/**
 * Lecture help is a fixed, standing roster (not tied to a Week) — see
 * prisma/schema.prisma. TAs can join/leave any section-day themselves
 * (self-service, no approval); professors can also add/remove anyone and
 * manage the section list itself. Every assignment always costs exactly
 * 1 office-hour slot (LectureHelpSignup.hours is always 1) regardless of
 * how long the section's period actually runs.
 */

export async function signUpForLectureHelp(slotId: string): Promise<SignupResult> {
  const user = await requireUser();

  try {
    await prisma.$transaction(async (tx) => {
      const slot = await tx.lectureHelpSlot.findUniqueOrThrow({ where: { id: slotId } });
      const signupCount = await tx.lectureHelpSignup.count({ where: { slotId } });

      if (signupCount >= slot.capacity) {
        throw new Error("This section is already full for that day.");
      }

      await tx.lectureHelpSignup.upsert({
        where: { slotId_userId: { slotId, userId: user.id } },
        update: {},
        create: { slotId, userId: user.id, hours: 1 },
      });
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't sign up." };
  }

  revalidatePath("/uta/lecture-help");
  revalidatePath("/professor");
  return { ok: true };
}

export async function withdrawFromLectureHelp(slotId: string): Promise<SignupResult> {
  const user = await requireUser();
  await prisma.lectureHelpSignup.deleteMany({ where: { slotId, userId: user.id } });
  revalidatePath("/uta/lecture-help");
  revalidatePath("/professor");
  return { ok: true };
}

export async function assignTaToLectureHelp(slotId: string, userId: string): Promise<SignupResult> {
  await requireRole("PROFESSOR");

  const slot = await prisma.lectureHelpSlot.findUniqueOrThrow({
    where: { id: slotId },
    include: { _count: { select: { signups: true } } },
  });
  if (slot._count.signups >= slot.capacity) {
    return { ok: false, error: `This section is already at its cap of ${slot.capacity}.` };
  }

  await prisma.lectureHelpSignup.upsert({
    where: { slotId_userId: { slotId, userId } },
    update: {},
    create: { slotId, userId, hours: 1 },
  });

  revalidatePath("/uta/lecture-help");
  revalidatePath("/professor");
  return { ok: true };
}

export async function removeTaFromLectureHelp(slotId: string, userId: string): Promise<SignupResult> {
  await requireRole("PROFESSOR");
  await prisma.lectureHelpSignup.deleteMany({ where: { slotId, userId } });
  revalidatePath("/uta/lecture-help");
  revalidatePath("/professor");
  return { ok: true };
}

export type CreateSectionState = { error: string } | undefined;

export async function createLectureHelpSection(
  _prevState: CreateSectionState,
  formData: FormData,
): Promise<CreateSectionState> {
  await requireRole("PROFESSOR");

  const courseInfo = formData.get("courseInfo");
  const instructors = formData.get("instructors");
  const location = formData.get("location");
  const startTime = formData.get("startTime");
  const endTime = formData.get("endTime");
  const capacity = Number(formData.get("capacity"));
  const days = formData.getAll("days").map(Number);

  if (
    typeof courseInfo !== "string" ||
    !courseInfo.trim() ||
    typeof instructors !== "string" ||
    !instructors.trim() ||
    typeof location !== "string" ||
    !location.trim() ||
    typeof startTime !== "string" ||
    typeof endTime !== "string" ||
    !startTime ||
    !endTime ||
    !Number.isFinite(capacity) ||
    capacity < 1 ||
    days.length === 0 ||
    days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  ) {
    return { error: "Fill in a section name, instructors, location, at least one day, and times." };
  }

  if (endTime <= startTime) {
    return { error: "End time must be after start time." };
  }

  await prisma.lectureHelpSlot.createMany({
    data: days.map((dayOfWeek) => ({
      courseInfo: courseInfo.trim(),
      instructors: instructors.trim(),
      location: location.trim(),
      dayOfWeek,
      startTime,
      endTime,
      capacity,
    })),
  });

  revalidatePath("/professor");
  revalidatePath("/uta/lecture-help");
}

export async function deleteLectureHelpSlot(slotId: string): Promise<SignupResult> {
  await requireRole("PROFESSOR");

  const signupCount = await prisma.lectureHelpSignup.count({ where: { slotId } });
  if (signupCount > 0) {
    return { ok: false, error: "Remove everyone from this day before deleting it." };
  }

  await prisma.lectureHelpSlot.delete({ where: { id: slotId } });
  revalidatePath("/professor");
  revalidatePath("/uta/lecture-help");
  return { ok: true };
}
