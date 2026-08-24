"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getOrCreateUpcomingWeek } from "@/lib/weeks";
import { formatTime } from "@/lib/operating-hours";
import { notify } from "@/lib/notifications";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Manual shift creation/assignment for Phase 5 — no auto-generation yet.
 * Every action here is professor-only per the Build Order's Phase 5 scope;
 * TAs get write access to their own schedule via the swap flows (Phase 8).
 */

export async function createShift(day: number, hour: number, minTas: number, maxTas: number): Promise<ActionResult> {
  await requireRole("PROFESSOR");

  if (minTas < 1 || maxTas < minTas) {
    return { ok: false, error: "Max must be at least min, and min must be at least 1." };
  }

  const week = await getOrCreateUpcomingWeek();
  const startTime = formatTime(hour);
  const endTime = formatTime(hour + 1);

  const existing = await prisma.shift.findFirst({
    where: { weekId: week.id, dayOfWeek: day, startTime },
  });
  if (existing) return { ok: true }; // already created by a concurrent click — no-op

  await prisma.shift.create({
    data: { weekId: week.id, dayOfWeek: day, startTime, endTime, minTas, maxTas },
  });

  revalidatePath("/uta/schedule");
  return { ok: true };
}

export async function deleteShift(shiftId: string): Promise<ActionResult> {
  await requireRole("PROFESSOR");

  const assignmentCount = await prisma.shiftAssignment.count({ where: { shiftId } });
  if (assignmentCount > 0) {
    return { ok: false, error: "Remove everyone from this shift before deleting it." };
  }

  await prisma.shift.delete({ where: { id: shiftId } });
  revalidatePath("/uta/schedule");
  return { ok: true };
}

export async function assignTaToShift(shiftId: string, userId: string): Promise<ActionResult> {
  await requireRole("PROFESSOR");

  const shift = await prisma.shift.findUniqueOrThrow({
    where: { id: shiftId },
    include: { _count: { select: { assignments: true } } },
  });

  if (shift._count.assignments >= shift.maxTas) {
    return { ok: false, error: `This shift is already at its max of ${shift.maxTas} TAs.` };
  }

  await prisma.shiftAssignment.upsert({
    where: { shiftId_userId: { shiftId, userId } },
    update: {},
    create: { shiftId, userId },
  });

  revalidatePath("/uta/schedule");
  return { ok: true };
}

export async function removeAssignment(shiftId: string, userId: string): Promise<ActionResult> {
  await requireRole("PROFESSOR");
  await prisma.shiftAssignment.deleteMany({ where: { shiftId, userId } });
  revalidatePath("/uta/schedule");
  return { ok: true };
}

export async function toggleLead(shiftId: string, userId: string, isLead: boolean): Promise<ActionResult> {
  await requireRole("PROFESSOR");
  await prisma.shiftAssignment.update({
    where: { shiftId_userId: { shiftId, userId } },
    data: { isLead },
  });
  revalidatePath("/uta/schedule");
  return { ok: true };
}

/**
 * Swap flows — §7. Two distinct mechanisms, matching the two "Claim"/
 * "Request" buttons described in §5's cell panel:
 *
 *  - Open pool (postToOpenSwapPool / cancelOpenSwapPost / claimOpenSwapShift):
 *    flips ShiftAssignment.openForSwap and, on claim, transfers the seat
 *    instantly — "no approval needed since it's already been opened up."
 *    No SwapRequest/Notification involved.
 *  - Direct request (requestSwap / respondToSwapRequest): always targets a
 *    specific teammate, goes through SwapRequest (PENDING -> ACCEPTED/
 *    DENIED) with a Notification, and only takes effect once they accept.
 */

export async function postToOpenSwapPool(shiftId: string): Promise<ActionResult> {
  const user = await requireUser();

  const shift = await prisma.shift.findUniqueOrThrow({
    where: { id: shiftId },
    include: { assignments: true },
  });
  const mine = shift.assignments.find((a) => a.userId === user.id);
  if (!mine) return { ok: false, error: "You're not assigned to this shift." };

  if (shift.assignments.length <= shift.minTas) {
    return { ok: false, error: `Removing you would drop this shift below its minimum of ${shift.minTas}.` };
  }

  await prisma.shiftAssignment.update({
    where: { shiftId_userId: { shiftId, userId: user.id } },
    data: { openForSwap: true },
  });

  revalidatePath("/uta/schedule");
  return { ok: true };
}

export async function cancelOpenSwapPost(shiftId: string): Promise<ActionResult> {
  const user = await requireUser();
  await prisma.shiftAssignment.updateMany({
    where: { shiftId, userId: user.id },
    data: { openForSwap: false },
  });
  revalidatePath("/uta/schedule");
  return { ok: true };
}

export async function claimOpenSwapShift(shiftId: string): Promise<ActionResult> {
  const user = await requireUser();

  return prisma.$transaction(async (tx) => {
    const shift = await tx.shift.findUniqueOrThrow({
      where: { id: shiftId },
      include: { assignments: true },
    });

    const posted = shift.assignments.find((a) => a.openForSwap);
    if (!posted) return { ok: false, error: "This shift isn't open for claiming anymore." };
    if (posted.userId === user.id) return { ok: false, error: "You can't claim your own post." };
    if (shift.assignments.some((a) => a.userId === user.id)) {
      return { ok: false, error: "You're already assigned to this shift." };
    }

    const available = await tx.availability.findFirst({
      where: {
        userId: user.id,
        dayOfWeek: shift.dayOfWeek,
        startTime: { lte: shift.startTime },
        endTime: { gte: shift.endTime },
      },
    });
    if (!available) return { ok: false, error: "You're not available for this hour." };

    await tx.shiftAssignment.delete({ where: { shiftId_userId: { shiftId, userId: posted.userId } } });
    await tx.shiftAssignment.create({ data: { shiftId, userId: user.id } });

    return { ok: true } as const;
  }).then((result) => {
    if (result.ok) {
      revalidatePath("/uta/schedule");
    }
    return result;
  });
}

export async function requestSwap(
  fromShiftId: string,
  targetUserId: string,
  toShiftId: string | null,
): Promise<ActionResult> {
  const user = await requireUser();

  if (targetUserId === user.id) return { ok: false, error: "Pick a teammate, not yourself." };

  const fromAssignment = await prisma.shiftAssignment.findUnique({
    where: { shiftId_userId: { shiftId: fromShiftId, userId: user.id } },
  });
  if (!fromAssignment) return { ok: false, error: "That's not your shift." };

  if (toShiftId) {
    const targetAssignment = await prisma.shiftAssignment.findUnique({
      where: { shiftId_userId: { shiftId: toShiftId, userId: targetUserId } },
    });
    if (!targetAssignment) return { ok: false, error: "That teammate isn't on the shift you picked." };
  }

  const [requester, target] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    prisma.user.findUniqueOrThrow({ where: { id: targetUserId } }),
  ]);

  const swapRequest = await prisma.swapRequest.create({
    data: { requesterId: requester.id, targetId: target.id, fromShiftId, toShiftId },
  });

  await notify(prisma, {
    userId: target.id,
    type: "SWAP_REQUEST",
    message: toShiftId
      ? `${requester.name} wants to swap shifts with you.`
      : `${requester.name} wants you to take over one of their shifts.`,
    relatedSwapId: swapRequest.id,
  });

  revalidatePath("/uta/schedule");
  return { ok: true };
}

export async function respondToSwapRequest(swapRequestId: string, accept: boolean): Promise<ActionResult> {
  const user = await requireUser();

  return prisma.$transaction(async (tx) => {
    const swapRequest = await tx.swapRequest.findUniqueOrThrow({ where: { id: swapRequestId } });

    if (swapRequest.targetId !== user.id) {
      return { ok: false, error: "This request isn't addressed to you." };
    }
    if (swapRequest.status !== "PENDING") {
      return { ok: false, error: "This request has already been resolved." };
    }

    // Responding here (rather than via the /notifications page) still counts
    // as having seen it — clear the bell for this specific request.
    await tx.notification.updateMany({
      where: { userId: user.id, relatedSwapId: swapRequest.id, read: false },
      data: { read: true },
    });

    if (!accept) {
      await tx.swapRequest.update({
        where: { id: swapRequestId },
        data: { status: "DENIED", resolvedAt: new Date() },
      });
      await notify(tx, {
        userId: swapRequest.requesterId,
        type: "SWAP_DENIED",
        message: "Your swap request was denied.",
        relatedSwapId: swapRequest.id,
      });
      return { ok: true } as const;
    }

    const [fromAssignment, toAssignment] = await Promise.all([
      tx.shiftAssignment.findUnique({
        where: { shiftId_userId: { shiftId: swapRequest.fromShiftId, userId: swapRequest.requesterId } },
      }),
      swapRequest.toShiftId
        ? tx.shiftAssignment.findUnique({
            where: { shiftId_userId: { shiftId: swapRequest.toShiftId, userId: user.id } },
          })
        : Promise.resolve(null),
    ]);

    if (!fromAssignment) {
      return { ok: false, error: "The requester is no longer on that shift." };
    }
    if (swapRequest.toShiftId && !toAssignment) {
      return { ok: false, error: "You're no longer on the shift you were offering." };
    }

    const alreadyOnFromShift = await tx.shiftAssignment.findUnique({
      where: { shiftId_userId: { shiftId: swapRequest.fromShiftId, userId: user.id } },
    });
    if (alreadyOnFromShift) return { ok: false, error: "You're already assigned to that shift." };

    if (swapRequest.toShiftId) {
      const alreadyOnToShift = await tx.shiftAssignment.findUnique({
        where: { shiftId_userId: { shiftId: swapRequest.toShiftId, userId: swapRequest.requesterId } },
      });
      if (alreadyOnToShift) {
        return { ok: false, error: "The requester is already assigned to that shift." };
      }
    }

    // Transfer fromShift: requester out, target (me) in.
    await tx.shiftAssignment.delete({
      where: { shiftId_userId: { shiftId: swapRequest.fromShiftId, userId: swapRequest.requesterId } },
    });
    await tx.shiftAssignment.create({
      data: { shiftId: swapRequest.fromShiftId, userId: user.id },
    });

    // If it's a two-way trade, transfer toShift: target (me) out, requester in.
    if (swapRequest.toShiftId) {
      await tx.shiftAssignment.delete({
        where: { shiftId_userId: { shiftId: swapRequest.toShiftId, userId: user.id } },
      });
      await tx.shiftAssignment.create({
        data: { shiftId: swapRequest.toShiftId, userId: swapRequest.requesterId },
      });
    }

    await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: { status: "ACCEPTED", resolvedAt: new Date() },
    });
    await notify(tx, {
      userId: swapRequest.requesterId,
      type: "SWAP_ACCEPTED",
      message: "Your swap request was accepted.",
      relatedSwapId: swapRequest.id,
    });

    return { ok: true } as const;
  }).then((result) => {
    if (result.ok) {
      revalidatePath("/uta/schedule");
      revalidatePath("/notifications");
    }
    return result;
  });
}
