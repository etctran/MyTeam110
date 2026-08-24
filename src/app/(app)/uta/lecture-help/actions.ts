"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getOrCreateUpcomingWeek } from "@/lib/weeks";
import { slotDurationHours } from "@/lib/scheduling/quota";

export type SignupResult = { ok: true } | { ok: false; error: string };

export async function signUpForLectureHelp(slotId: string): Promise<SignupResult> {
  const user = await requireUser();

  try {
    await prisma.$transaction(async (tx) => {
      const slot = await tx.lectureHelpSlot.findUniqueOrThrow({ where: { id: slotId } });
      const signupCount = await tx.lectureHelpSignup.count({ where: { slotId } });

      if (signupCount >= slot.capacity) {
        throw new Error("This slot is already full.");
      }

      await tx.lectureHelpSignup.upsert({
        where: { slotId_userId: { slotId, userId: user.id } },
        update: {},
        create: {
          slotId,
          userId: user.id,
          hours: slotDurationHours(slot.startTime, slot.endTime),
        },
      });
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't sign up." };
  }

  revalidatePath("/uta/lecture-help");
  return { ok: true };
}

export async function withdrawFromLectureHelp(slotId: string): Promise<SignupResult> {
  const user = await requireUser();
  await prisma.lectureHelpSignup.deleteMany({ where: { slotId, userId: user.id } });
  revalidatePath("/uta/lecture-help");
  return { ok: true };
}

export type PostSlotState = { error: string } | undefined;

export async function postLectureHelpSlot(
  _prevState: PostSlotState,
  formData: FormData,
): Promise<PostSlotState> {
  await requireRole("PROFESSOR");

  const courseInfo = formData.get("courseInfo");
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const startTime = formData.get("startTime");
  const endTime = formData.get("endTime");
  const capacity = Number(formData.get("capacity"));

  if (
    typeof courseInfo !== "string" ||
    !courseInfo.trim() ||
    typeof startTime !== "string" ||
    typeof endTime !== "string" ||
    !startTime ||
    !endTime ||
    Number.isNaN(dayOfWeek) ||
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    !Number.isFinite(capacity) ||
    capacity < 1
  ) {
    return { error: "Fill in course info, day, start/end time, and a capacity of at least 1." };
  }

  if (endTime <= startTime) {
    return { error: "End time must be after start time." };
  }

  const week = await getOrCreateUpcomingWeek();

  await prisma.lectureHelpSlot.create({
    data: {
      weekId: week.id,
      courseInfo: courseInfo.trim(),
      dayOfWeek,
      startTime,
      endTime,
      capacity,
    },
  });

  revalidatePath("/professor");
  revalidatePath("/uta/lecture-help");
}
