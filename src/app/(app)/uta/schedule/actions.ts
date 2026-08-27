"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getOrCreateUpcomingWeek } from "@/lib/weeks";
import { hasShiftStarted } from "@/lib/shift-time";
import { formatTime } from "@/lib/operating-hours";
import { notify } from "@/lib/notifications";
import { broadcast, notificationsChannel, SCHEDULE_CHANNEL } from "@/lib/realtime";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Manual shift creation/assignment — professor-only. TAs get write access
// to their own schedule via the swap flows below instead.

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
  await broadcast(SCHEDULE_CHANNEL);
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
  await broadcast(SCHEDULE_CHANNEL);
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
  await broadcast(SCHEDULE_CHANNEL);
  return { ok: true };
}

export async function removeAssignment(shiftId: string, userId: string): Promise<ActionResult> {
  await requireRole("PROFESSOR");
  await prisma.shiftAssignment.deleteMany({ where: { shiftId, userId } });
  revalidatePath("/uta/schedule");
  await broadcast(SCHEDULE_CHANNEL);
  return { ok: true };
}

/**
 * Only a returning TA can be a shift's lead, and a shift has at most one —
 * marking someone lead here unmarks anyone else on the same shift in the
 * same transaction, rather than relying on the UI to only ever toggle one
 * at a time.
 */
export async function toggleLead(shiftId: string, userId: string, isLead: boolean): Promise<ActionResult> {
  await requireRole("PROFESSOR");

  if (isLead) {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { isReturning: true } });
    if (!target?.isReturning) {
      return { ok: false, error: "Only a returning TA can be the shift lead." };
    }
  }

  await prisma.$transaction([
    ...(isLead
      ? [
          prisma.shiftAssignment.updateMany({
            where: { shiftId, isLead: true, userId: { not: userId } },
            data: { isLead: false },
          }),
        ]
      : []),
    prisma.shiftAssignment.update({
      where: { shiftId_userId: { shiftId, userId } },
      data: { isLead },
    }),
  ]);

  revalidatePath("/uta/schedule");
  await broadcast(SCHEDULE_CHANNEL);
  return { ok: true };
}

/**
 * Swap flows — two distinct mechanisms, matching the two "Claim"/"Request"
 * buttons in the cell detail panel:
 *
 *  - Self-move (moveToOpenShift): a TA can move themselves from a shift
 *    they're on with room to spare (headcount > minTas) directly into any
 *    other shift with room to add them (headcount < maxTas) they're
 *    available for — instant, no posting step, no approval. Headcount is
 *    the only gate; no one else needs to opt in first.
 *  - Direct request (requestSwap / respondToSwapRequest): always targets a
 *    specific teammate, goes through SwapRequest (PENDING -> ACCEPTED/
 *    DENIED) with a Notification, and only takes effect once they accept.
 */

export async function moveToOpenShift(fromShiftId: string, toShiftId: string): Promise<ActionResult> {
  const user = await requireUser();

  return prisma.$transaction(async (tx) => {
    // Lock both shift rows (consistent order so two concurrent moves never
    // deadlock on each other) before reading headcounts. Without this, two
    // TAs moving into the same shift's last open slot at nearly the same
    // instant could both pass the maxTas check under READ COMMITTED — the
    // second transaction's FOR UPDATE blocks until the first commits, so it
    // sees the real post-move count, not a stale one.
    const [firstId, secondId] = [fromShiftId, toShiftId].sort();
    await tx.$queryRaw`SELECT id FROM "Shift" WHERE id IN (${firstId}, ${secondId}) FOR UPDATE`;

    const [fromShift, toShift] = await Promise.all([
      tx.shift.findUniqueOrThrow({ where: { id: fromShiftId }, include: { assignments: true, week: true } }),
      tx.shift.findUniqueOrThrow({ where: { id: toShiftId }, include: { assignments: true, week: true } }),
    ]);

    if (hasShiftStarted(fromShift.week.weekStartDate, fromShift.dayOfWeek, fromShift.startTime)) {
      return { ok: false, error: "That shift has already happened." };
    }
    if (hasShiftStarted(toShift.week.weekStartDate, toShift.dayOfWeek, toShift.startTime)) {
      return { ok: false, error: "That shift has already happened." };
    }

    const mine = fromShift.assignments.find((a) => a.userId === user.id);
    if (!mine) return { ok: false, error: "You're not assigned to that shift." };

    if (fromShift.assignments.length <= fromShift.minTas) {
      return { ok: false, error: `Leaving would drop that shift below its minimum of ${fromShift.minTas}.` };
    }
    if (toShift.assignments.some((a) => a.userId === user.id)) {
      return { ok: false, error: "You're already assigned to that shift." };
    }
    if (toShift.assignments.length >= toShift.maxTas) {
      return { ok: false, error: `That shift is already at its max of ${toShift.maxTas}.` };
    }

    const available = await tx.availability.findFirst({
      where: {
        userId: user.id,
        dayOfWeek: toShift.dayOfWeek,
        startTime: { lte: toShift.startTime },
        endTime: { gte: toShift.endTime },
      },
    });
    if (!available) return { ok: false, error: "You're not available for that shift." };

    await tx.shiftAssignment.delete({ where: { shiftId_userId: { shiftId: fromShiftId, userId: user.id } } });
    await tx.shiftAssignment.create({ data: { shiftId: toShiftId, userId: user.id } });

    return { ok: true } as const;
  }).then(async (result) => {
    if (result.ok) {
      revalidatePath("/uta/schedule");
      await broadcast(SCHEDULE_CHANNEL);
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

  const fromShift = await prisma.shift.findUniqueOrThrow({ where: { id: fromShiftId }, include: { week: true } });
  if (hasShiftStarted(fromShift.week.weekStartDate, fromShift.dayOfWeek, fromShift.startTime)) {
    return { ok: false, error: "That shift has already happened." };
  }

  if (toShiftId) {
    const targetAssignment = await prisma.shiftAssignment.findUnique({
      where: { shiftId_userId: { shiftId: toShiftId, userId: targetUserId } },
    });
    if (!targetAssignment) return { ok: false, error: "That teammate isn't on the shift you picked." };

    const toShift = await prisma.shift.findUniqueOrThrow({ where: { id: toShiftId }, include: { week: true } });
    if (hasShiftStarted(toShift.week.weekStartDate, toShift.dayOfWeek, toShift.startTime)) {
      return { ok: false, error: "That shift has already happened." };
    }
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
  await broadcast(notificationsChannel(target.id));
  return { ok: true };
}

export async function respondToSwapRequest(swapRequestId: string, accept: boolean): Promise<ActionResult> {
  const user = await requireUser();
  let requesterId: string | null = null;

  return prisma.$transaction(async (tx) => {
    // Lock the request row before reading its status — otherwise two
    // concurrent responses (e.g. a double-click) could both observe
    // PENDING and both execute the transfer, moving the shift twice.
    await tx.$queryRaw`SELECT id FROM "SwapRequest" WHERE id = ${swapRequestId} FOR UPDATE`;

    const swapRequest = await tx.swapRequest.findUniqueOrThrow({ where: { id: swapRequestId } });
    requesterId = swapRequest.requesterId;

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

    const [fromAssignment, toAssignment, fromShift, toShift] = await Promise.all([
      tx.shiftAssignment.findUnique({
        where: { shiftId_userId: { shiftId: swapRequest.fromShiftId, userId: swapRequest.requesterId } },
      }),
      swapRequest.toShiftId
        ? tx.shiftAssignment.findUnique({
            where: { shiftId_userId: { shiftId: swapRequest.toShiftId, userId: user.id } },
          })
        : Promise.resolve(null),
      tx.shift.findUniqueOrThrow({ where: { id: swapRequest.fromShiftId }, include: { week: true } }),
      swapRequest.toShiftId
        ? tx.shift.findUniqueOrThrow({ where: { id: swapRequest.toShiftId }, include: { week: true } })
        : Promise.resolve(null),
    ]);

    // Re-checked here, not just at request time — time may have passed
    // between the request and this response.
    if (hasShiftStarted(fromShift.week.weekStartDate, fromShift.dayOfWeek, fromShift.startTime)) {
      return { ok: false, error: "That shift has already happened." };
    }
    if (toShift && hasShiftStarted(toShift.week.weekStartDate, toShift.dayOfWeek, toShift.startTime)) {
      return { ok: false, error: "That shift has already happened." };
    }

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
  }).then(async (result) => {
    if (result.ok) {
      revalidatePath("/uta/schedule");
      revalidatePath("/notifications");
      await broadcast(SCHEDULE_CHANNEL);
      if (requesterId) await broadcast(notificationsChannel(requesterId));
    }
    return result;
  });
}
