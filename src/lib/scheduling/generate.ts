/**
 * Auto-scheduling algorithm — contiguous-block greedy.
 *
 * A pure, DB-free function: it operates entirely on plain data in and
 * plain data out. `run-generation.ts` handles pulling real data in and
 * persisting the result as Week/Shift/ShiftAssignment rows.
 *
 * Key rule: a TA's assigned hours on a given day must always be one
 * unbroken block — never scattered hours with a gap. Every mutation
 * below is written to preserve that invariant, including one
 * refinement: if a User has two separate Availability windows on the
 * same day, Pass 1 only ever assigns the first one it reaches for that
 * user. Assigning both would necessarily leave a gap between them,
 * which the key rule forbids outright.
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
  isReturning: boolean;
};

export type GeneratedShift = {
  dayOfWeek: number;
  hour: number;
  assignedUserIds: string[];
  leadUserId: string | null;
  needsAttention: boolean;
  needsLead: boolean;
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
  const isReturning = new Map<string, boolean>();
  for (const user of users) {
    remainingQuota.set(user.id, computeEffectiveQuota(user.weeklyQuota, user.lectureHelpHours));
    isReturning.set(user.id, user.isReturning);
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

  /** Shared by Pass 2's fill-to-minimum and Pass 2b's ensure-a-lead step:
   * who's actually eligible to be added at this hour without breaking a
   * block (available, has quota left, and — if they already have a block
   * today — only extends one of its edges, never opens a gap). */
  function eligibleAt(day: number, hour: number, windows: AvailabilityWindow[], onlyReturning: boolean) {
    const blocks = dayBlocks.get(day)!;
    return users.filter((u) => {
      if (onlyReturning && !isReturning.get(u.id)) return false;
      if ((remainingQuota.get(u.id) ?? 0) <= 0) return false;
      const covered = windows.some((w) => w.userId === u.id && w.startHour <= hour && hour < w.endHour);
      if (!covered) return false;
      const block = blocks.get(u.id);
      if (!block) return true; // fresh single-hour block
      return block.end === hour || block.start === hour + 1; // extend an edge only, never a gap
    });
  }

  function addAssignment(day: number, hour: number, userId: string) {
    const blocks = dayBlocks.get(day)!;
    const block = blocks.get(userId);
    if (!block) blocks.set(userId, { start: hour, end: hour + 1 });
    else if (block.end === hour) block.end = hour + 1;
    else if (block.start === hour + 1) block.start = hour;

    dayHourAssignments.get(day)!.get(hour)!.add(userId);
    remainingQuota.set(userId, (remainingQuota.get(userId) ?? 0) - 1);
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

    const { start: dayStart, end: dayEnd } = hoursOf(day);

    // ---- Pass 2: hourly headcount pass ----
    for (let hour = dayStart; hour < dayEnd; hour++) {
      let count = countAt(day, hour);

      if (count < minTas) {
        const candidates = eligibleAt(day, hour, windows, false).sort(
          (a, b) => (remainingQuota.get(b.id) ?? 0) - (remainingQuota.get(a.id) ?? 0),
        );

        for (const candidate of candidates) {
          if (count >= minTas) break;
          addAssignment(day, hour, candidate.id);
          count += 1;
        }
      }

      // ---- Pass 2b: ensure a returning TA (lead candidate) is on every
      // shift, if any is actually available for it — added on top of the
      // minimum fill above, using spare room under maxTas. Can't invent
      // one out of thin air: if nobody returning has availability this
      // hour, the shift is simply flagged needsLead later instead. ----
      const hasReturning = [...dayHourAssignments.get(day)!.get(hour)!].some((id) => isReturning.get(id));
      if (!hasReturning && count < maxTas) {
        const [candidate] = eligibleAt(day, hour, windows, true).sort(
          (a, b) => (remainingQuota.get(b.id) ?? 0) - (remainingQuota.get(a.id) ?? 0),
        );
        if (candidate) {
          addAssignment(day, hour, candidate.id);
          count += 1;
        }
      }

      if (count > maxTas) {
        const trimCandidates = [...dayHourAssignments.get(day)!.get(hour)!]
          .map((id) => ({ id, block: blocks.get(id)! }))
          .filter(({ block }) => block.start === hour || block.end - 1 === hour) // edge hour only
          .sort((a, b) => (remainingQuota.get(a.id) ?? 0) - (remainingQuota.get(b.id) ?? 0)); // most slack (least remaining need) first

        function trimOne(id: string, block: Block) {
          dayHourAssignments.get(day)!.get(hour)!.delete(id);
          remainingQuota.set(id, (remainingQuota.get(id) ?? 0) + 1);
          count -= 1;
          if (block.start === hour) block.start += 1;
          else if (block.end - 1 === hour) block.end -= 1;
          if (block.start >= block.end) blocks.delete(id);
        }

        let returningCountAtHour = [...dayHourAssignments.get(day)!.get(hour)!].filter((id) =>
          isReturning.get(id),
        ).length;

        // First pass: trim everyone except the shift's last returning TA —
        // removing them would silently undo Pass 2b's whole point.
        for (const { id, block } of trimCandidates) {
          if (count <= maxTas) break;
          if (isReturning.get(id) && returningCountAtHour <= 1) continue;
          trimOne(id, block);
          if (isReturning.get(id)) returningCountAtHour -= 1;
        }

        // Fallback: if protecting that last returning TA left us still over
        // maxTas (only possible if every remaining edge-hour person *is*
        // that one TA, i.e. nobody else was left to trim), the headcount
        // cap wins — trim them too rather than silently exceed maxTas.
        if (count > maxTas) {
          for (const { id, block } of trimCandidates) {
            if (count <= maxTas) break;
            if (!dayHourAssignments.get(day)!.get(hour)!.has(id)) continue; // already trimmed above
            trimOne(id, block);
          }
        }
      }
    }
  }

  // ---- Pass 3: leads (round-robin among assigned returning TAs) + flags ----
  const returningRotation = users
    .filter((u) => u.isReturning)
    .map((u) => u.id)
    .sort();
  let rotationIndex = 0;

  const results: GeneratedShift[] = [];
  for (const day of operatingDays) {
    const { start, end } = hoursOf(day);
    for (let hour = start; hour < end; hour++) {
      const assignedUserIds = [...(dayHourAssignments.get(day)?.get(hour) ?? [])].sort();
      const assignedReturning = assignedUserIds.filter((id) => isReturning.get(id));

      let leadUserId: string | null = null;
      for (let i = 0; i < returningRotation.length && assignedReturning.length > 0; i++) {
        const candidateIndex = (rotationIndex + i) % returningRotation.length;
        const candidateId = returningRotation[candidateIndex];
        if (assignedReturning.includes(candidateId)) {
          leadUserId = candidateId;
          rotationIndex = (candidateIndex + 1) % returningRotation.length;
          break;
        }
      }

      results.push({
        dayOfWeek: day,
        hour,
        assignedUserIds,
        leadUserId,
        needsAttention: assignedUserIds.length < minTas,
        needsLead: leadUserId === null,
      });
    }
  }

  return results;
}
