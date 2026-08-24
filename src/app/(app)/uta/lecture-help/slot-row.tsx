"use client";

import { useState, useTransition } from "react";
import { signUpForLectureHelp, withdrawFromLectureHelp } from "./actions";
import { DAY_LABELS, formatTimeOfDay } from "@/lib/operating-hours";

export type SlotRowData = {
  id: string;
  courseInfo: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  signups: { id: string; user: { id: string; name: string } }[];
};

export function SlotRow({ slot, currentUserId }: { slot: SlotRowData; currentUserId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isSignedUp = slot.signups.some((s) => s.user.id === currentUserId);
  const isFull = slot.signups.length >= slot.capacity;
  const dayLabel = DAY_LABELS[slot.dayOfWeek as keyof typeof DAY_LABELS] ?? `Day ${slot.dayOfWeek}`;

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = isSignedUp
        ? await withdrawFromLectureHelp(slot.id)
        : await signUpForLectureHelp(slot.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="panel-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{slot.courseInfo}</p>
        <p className="text-sm text-text-muted">
          {dayLabel} · {formatTimeOfDay(slot.startTime)}–{formatTimeOfDay(slot.endTime)} ·{" "}
          {slot.signups.length}/{slot.capacity} signed up
        </p>
        {slot.signups.length > 0 && (
          <p className="mt-1 text-xs text-text-muted">
            {slot.signups.map((s) => s.user.name).join(", ")}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || (!isSignedUp && isFull)}
        className={isSignedUp ? "pill-button-outline" : "pill-button"}
      >
        {isPending ? "…" : isSignedUp ? "Withdraw" : isFull ? "Full" : "Sign up"}
      </button>
    </div>
  );
}
