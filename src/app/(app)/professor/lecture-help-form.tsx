"use client";

import { useActionState } from "react";
import { postLectureHelpSlot } from "@/app/(app)/uta/lecture-help/actions";
import { DAY_LABELS } from "@/lib/operating-hours";

const DAY_OPTIONS = Object.entries(DAY_LABELS).concat([["6", "Sat"]]);

export function LectureHelpForm() {
  const [state, formAction, pending] = useActionState(postLectureHelpSlot, undefined);

  return (
    <form action={formAction} className="panel-card flex flex-col gap-3 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="courseInfo" className="text-sm font-medium text-text-muted">
            Course / lecture
          </label>
          <input
            id="courseInfo"
            name="courseInfo"
            placeholder="CS 201 — Mon 10:00 lecture"
            required
            className="field-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="dayOfWeek" className="text-sm font-medium text-text-muted">
            Day
          </label>
          <select id="dayOfWeek" name="dayOfWeek" required className="field-input" defaultValue="1">
            {DAY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="capacity" className="text-sm font-medium text-text-muted">
            Capacity
          </label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            defaultValue={1}
            required
            className="field-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="startTime" className="text-sm font-medium text-text-muted">
            Start time
          </label>
          <input id="startTime" name="startTime" type="time" required className="field-input" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="endTime" className="text-sm font-medium text-text-muted">
            End time
          </label>
          <input id="endTime" name="endTime" type="time" required className="field-input" />
        </div>
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <button type="submit" disabled={pending} className="pill-button self-start">
        {pending ? "Posting…" : "Post slot"}
      </button>
    </form>
  );
}
