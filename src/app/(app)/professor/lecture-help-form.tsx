"use client";

import { useActionState } from "react";
import { createLectureHelpSection } from "@/app/(app)/uta/lecture-help/actions";
import { DAY_LABELS } from "@/lib/operating-hours";

const DAY_OPTIONS = Object.entries(DAY_LABELS).concat([["6", "Sat"]]);

export function LectureHelpForm() {
  const [state, formAction, pending] = useActionState(createLectureHelpSection, undefined);

  return (
    <form action={formAction} className="panel-card flex flex-col gap-3 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="courseInfo" className="text-sm font-medium text-text-muted">
            Section name
          </label>
          <input id="courseInfo" name="courseInfo" placeholder="Section 001" required className="field-input" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="instructors" className="text-sm font-medium text-text-muted">
            Instructors
          </label>
          <input
            id="instructors"
            name="instructors"
            placeholder="Hinks & Jordan"
            required
            className="field-input"
          />
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="location" className="text-sm font-medium text-text-muted">
            Location
          </label>
          <input
            id="location"
            name="location"
            placeholder="Hanes Art, room 121"
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

        <div className="flex flex-col gap-1">
          <label htmlFor="capacity" className="text-sm font-medium text-text-muted">
            Capacity (per day)
          </label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            defaultValue={6}
            required
            className="field-input"
          />
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium text-text-muted">Meets on</span>
          <div className="flex flex-wrap gap-3">
            {DAY_OPTIONS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="days" value={value} defaultChecked={value === "1"} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <button type="submit" disabled={pending} className="pill-button self-start">
        {pending ? "Creating…" : "Create section"}
      </button>
    </form>
  );
}
