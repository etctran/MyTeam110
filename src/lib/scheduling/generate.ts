/**
 * Auto-scheduling algorithm — §6, contiguous-block greedy (MVP).
 *
 * A pure, DB-free function per the Build Order (§9 Phase 6: "implement...
 * as a standalone function, unit-test it... before wiring to UI"). It
 * operates entirely on plain data in and plain data out; persisting the
 * result as Week/Shift/ShiftAssignment rows is a later wiring step.
 *
 * Key rule (verbatim from §6): a TA's assigned hours on a given day must
 * always be one unbroken block — never scattered hours with a gap. Every
 * mutation below is written to preserve that invariant, including one
 * refinement beyond the pseudocode: if a User has two separate
 * Availability windows on the same day, Pass 1 only ever assigns the
 * first one it reaches for that user. Assigning both would necessarily
 * leave a gap between them, which the key rule forbids outright.
 */
import { OPERATING_DAYS, OPERATING_HOURS } from "@/lib/operating-hours";
import { computeEffectiveQuota } from "@/lib/scheduling/quota";

export type AvailabilityWindow = {
  userId: string;
  dayOfWeek: number;
  startHour: number; // inclusive
  endHour: number; // exclusive
};

export type SchedulingUser = {
  id: string;
  weeklyQuota: number;
  lectureHelpHours: number;
  isSenior: boolean;
};

export type GeneratedShift = {
  dayOfWeek: number;
  hour: number;
  assignedUserIds: string[];
  leadUserId: string | null;
  needsAttention: boolean;
};

export type GenerateScheduleOptions = {
  operatingDays?: readonly number[];
  operatingHours?: Record<number, { start: number; end: number }>;
  minTas?: number;
  maxTas?: number;
};

type Block = { start: number; end: number };

export function generateSchedule(
  users: SchedulingUser[],
  availability: AvailabilityWindow[],
  options: GenerateScheduleOptions = {},
): GeneratedShift[] {
  const operatingDays = options.operatingDays ?? OPERATING_DAYS;
  const operatingHours: Record<number, { start: number; end: number }> =
    options.operatingHours ?? OPERATING_HOURS;
  const minTas = options.minTas ?? 3;
  const maxTas = options.maxTas ?? 6;

  const remainingQuota = new Map<string, number>();
  const isSenior = new Map<string, boolean>();
  for (const user of users) {
    remainingQuota.set(user.id, computeEffectiveQuota(user.weeklyQuota, user.lectureHelpHours));
    isSenior.set(user.id, user.isSenior);
  }

  const availabilityByDay = new Map<number, AvailabilityWindow[]>();
  for (const window of availability) {
    const list = availabilityByDay.get(window.dayOfWeek) ?? [];
    list.push(window);
    availabilityByDay.set(window.dayOfWeek, list);
  }

  const dayBlocks = new Map<number, Map<string, Block>>(); // day -> userId -> block
  const dayHourAssignments = new Map<number, Map<number, Set<string>>>(); // day -> hour -> userIds

  function hoursOf(day: number) {
    return operatingHours[day] ?? { start: 0, end: 0 };
  }

  function ensureDay(day: number) {
    if (!dayBlocks.has(day)) dayBlocks.set(day, new Map());
    if (!dayHourAssignments.has(day)) {
      const hourMap = new Map<number, Set<string>>();
      const { start, end } = hoursOf(day);
      for (let h = start; h < end; h++) hourMap.set(h, new Set());
      dayHourAssignments.set(day, hourMap);
    }
  }

  function countAt(day: number, hour: number) {
    return dayHourAssignments.get(day)?.get(hour)?.size ?? 0;
  }

  for (const day of operatingDays) {
    ensureDay(day);
    const blocks = dayBlocks.get(day)!;
    const windows = availabilityByDay.get(day) ?? [];

    // ---- Pass 1: assign contiguous sessions ----
    const sortedWindows = [...windows].sort((a, b) => {
      const qDiff = (remainingQuota.get(b.userId) ?? 0) - (remainingQuota.get(a.userId) ?? 0);
      if (qDiff !== 0) return qDiff; // remainingQuota DESC
      return a.endHour - a.startHour - (b.endHour - b.startHour); // window length ASC
    });

    for (const window of sortedWindows) {
      const quota = remainingQuota.get(window.userId) ?? 0;
      if (quota <= 0) continue;
      if (blocks.has(window.userId)) continue; // already has a block today — see key-rule note above

      const sessionLength = Math.min(window.endHour - window.startHour, quota);
      const end = window.startHour + sessionLength;

      blocks.set(window.userId, { start: window.startHour, end });
      for (let h = window.startHour; h < end; h++) {
        dayHourAssignments.get(day)!.get(h)!.add(window.userId);
      }
      remainingQuota.set(window.userId, quota - sessionLength);
    }

    // ---- Pass 2: hourly headcount pass ----
    const { start: dayStart, end: dayEnd } = hoursOf(day);
    for (let hour = dayStart; hour < dayEnd; hour++) {
      let count = countAt(day, hour);

      if (count < minTas) {
        const candidates = users
          .filter((u) => {
            if ((remainingQuota.get(u.id) ?? 0) <= 0) return false;
            const covered = windows.some(
              (w) => w.userId === u.id && w.startHour <= hour && hour < w.endHour,
            );
            if (!covered) return false;
            const block = blocks.get(u.id);
            if (!block) return true; // fresh single-hour block
            return block.end === hour || block.start === hour + 1; // extend an edge only, never a gap
          })
          .sort((a, b) => (remainingQuota.get(b.id) ?? 0) - (remainingQuota.get(a.id) ?? 0));

        for (const candidate of candidates) {
          if (count >= minTas) break;

          const block = blocks.get(candidate.id);
          if (!block) blocks.set(candidate.id, { start: hour, end: hour + 1 });
          else if (block.end === hour) block.end = hour + 1;
          else if (block.start === hour + 1) block.start = hour;

          dayHourAssignments.get(day)!.get(hour)!.add(candidate.id);
          remainingQuota.set(candidate.id, (remainingQuota.get(candidate.id) ?? 0) - 1);
          count += 1;
        }
      }

      if (count > maxTas) {
        const trimCandidates = [...dayHourAssignments.get(day)!.get(hour)!]
          .map((id) => ({ id, block: blocks.get(id)! }))
          .filter(({ block }) => block.start === hour || block.end - 1 === hour) // edge hour only
          .sort((a, b) => (remainingQuota.get(a.id) ?? 0) - (remainingQuota.get(b.id) ?? 0)); // most slack (least remaining need) first

        let idx = 0;
        while (count > maxTas && idx < trimCandidates.length) {
          const { id, block } = trimCandidates[idx];
          idx += 1;

          dayHourAssignments.get(day)!.get(hour)!.delete(id);
          remainingQuota.set(id, (remainingQuota.get(id) ?? 0) + 1);
          count -= 1;

          if (block.start === hour) block.start += 1;
          else if (block.end - 1 === hour) block.end -= 1;
          if (block.start >= block.end) blocks.delete(id);
        }
      }
    }
  }

  // ---- Pass 3: leads (round-robin among assigned seniors) + needs-attention ----
  const seniorRotation = users
    .filter((u) => u.isSenior)
    .map((u) => u.id)
    .sort();
  let rotationIndex = 0;

  const results: GeneratedShift[] = [];
  for (const day of operatingDays) {
    const { start, end } = hoursOf(day);
    for (let hour = start; hour < end; hour++) {
      const assignedUserIds = [...(dayHourAssignments.get(day)?.get(hour) ?? [])].sort();
      const assignedSeniors = assignedUserIds.filter((id) => isSenior.get(id));

      let leadUserId: string | null = null;
      for (let i = 0; i < seniorRotation.length && assignedSeniors.length > 0; i++) {
        const candidateIndex = (rotationIndex + i) % seniorRotation.length;
        const candidateId = seniorRotation[candidateIndex];
        if (assignedSeniors.includes(candidateId)) {
          leadUserId = candidateId;
          rotationIndex = (candidateIndex + 1) % seniorRotation.length;
          break;
        }
      }

      results.push({
        dayOfWeek: day,
        hour,
        assignedUserIds,
        leadUserId,
        needsAttention: assignedUserIds.length < minTas,
      });
    }
  }

  return results;
}
