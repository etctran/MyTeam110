"use client";

import { useState, useTransition } from "react";
import {
  assignTaToLectureHelp,
  deleteLectureHelpSlot,
  removeTaFromLectureHelp,
  signUpForLectureHelp,
  withdrawFromLectureHelp,
} from "./actions";
import { DAY_LABELS, formatTimeOfDay, type DayOfWeek } from "@/lib/operating-hours";
import type { LectureHelpSection } from "@/lib/lecture-help";

export function LectureHelpTable({
  sections,
  currentUserId,
  isProfessor,
  allTas,
}: {
  sections: LectureHelpSection[];
  currentUserId: string;
  isProfessor: boolean;
  allTas: { id: string; name: string }[];
}) {
  const dayColumns = [
    ...new Set(sections.flatMap((s) => s.days.map((d) => d.dayOfWeek))),
  ].sort((a, b) => a - b);

  if (sections.length === 0) {
    return <p className="text-sm text-text-muted">No lecture-help sections set up yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
            <th className="w-56 px-3 py-2">Section</th>
            {dayColumns.map((day) => (
              <th key={day} className="min-w-40 px-3 py-2">
                {DAY_LABELS[day as DayOfWeek]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <tr key={section.key} className="border-b border-border align-top last:border-0">
              <td className="px-3 py-3">
                <p className="font-semibold">{section.courseInfo}</p>
                <p className="text-text-muted">{section.instructors}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {formatTimeOfDay(section.startTime)}–{formatTimeOfDay(section.endTime)}
                </p>
                <p className="text-xs text-text-muted">{section.location}</p>
              </td>
              {dayColumns.map((day) => {
                const slot = section.days.find((d) => d.dayOfWeek === day);
                return (
                  <td key={day} className="px-3 py-3">
                    {slot ? (
                      <DayCell
                        slot={slot}
                        currentUserId={currentUserId}
                        isProfessor={isProfessor}
                        allTas={allTas}
                      />
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayCell({
  slot,
  currentUserId,
  isProfessor,
  allTas,
}: {
  slot: LectureHelpSection["days"][number];
  currentUserId: string;
  isProfessor: boolean;
  allTas: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState("");

  const isMine = slot.signups.some((s) => s.user.id === currentUserId);
  const isFull = slot.signups.length >= slot.capacity;
  const unassigned = allTas.filter((ta) => !slot.signups.some((s) => s.user.id === ta.id));

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {slot.signups.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-2">
          <span>{s.user.name}</span>
          {(isProfessor || s.user.id === currentUserId) && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(() =>
                  s.user.id === currentUserId
                    ? withdrawFromLectureHelp(slot.id)
                    : removeTaFromLectureHelp(slot.id, s.user.id),
                )
              }
              className="text-xs text-danger underline"
              aria-label={`Remove ${s.user.name}`}
            >
              ×
            </button>
          )}
        </div>
      ))}

      {!isMine && !isProfessor && (
        <button
          type="button"
          disabled={isPending || isFull}
          onClick={() => run(() => signUpForLectureHelp(slot.id))}
          className="self-start text-xs text-accent underline disabled:text-text-muted disabled:no-underline"
        >
          {isFull ? "Full" : "+ Join"}
        </button>
      )}

      {isProfessor && !isFull && (
        <div className="flex items-center gap-1">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="field-input flex-1 py-1 text-xs"
          >
            <option value="">Add TA…</option>
            {unassigned.map((ta) => (
              <option key={ta.id} value={ta.id}>
                {ta.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isPending || !picked}
            onClick={() => {
              const userId = picked;
              setPicked("");
              run(() => assignTaToLectureHelp(slot.id, userId));
            }}
            className="text-xs text-accent underline"
          >
            Add
          </button>
        </div>
      )}

      {isProfessor && slot.signups.length === 0 && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => deleteLectureHelpSlot(slot.id))}
          className="self-start text-xs text-text-muted underline"
        >
          Delete day
        </button>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
