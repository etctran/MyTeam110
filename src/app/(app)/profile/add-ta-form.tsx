"use client";

import { useActionState, useRef } from "react";
import { addTa } from "./actions";

export function AddTaForm() {
  const [state, formAction, pending] = useActionState(addTa, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="panel-card mb-6 p-4">
      <p className="mb-3 text-sm font-medium">Add a TA</p>
      <form
        ref={formRef}
        action={(formData) => {
          formAction(formData);
          formRef.current?.reset();
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <input name="name" placeholder="Full name" required className="field-input" />
        <input name="email" type="email" placeholder="Email" required className="field-input" />
        <select name="taType" defaultValue="FIVE_HOUR" className="field-input">
          <option value="FIVE_HOUR">5-hour</option>
          <option value="TEN_HOUR">10-hour</option>
          <option value="">No type</option>
        </select>
        <input
          name="weeklyQuota"
          type="number"
          min={0}
          placeholder="Quota override (optional)"
          className="field-input"
        />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm text-text-muted">
            <input type="checkbox" name="isSenior" /> Senior
          </label>
          <button type="submit" disabled={pending} className="pill-button">
            {pending ? "Adding…" : "Add TA"}
          </button>
        </div>
      </form>

      {state && !state.ok && <p className="mt-3 text-sm text-danger">{state.error}</p>}
      {state && state.ok && (
        <p className="mt-3 text-sm text-accent">
          Account created. Temporary password:{" "}
          <span className="font-mono font-semibold text-text">{state.tempPassword}</span> — share this
          with them out of band; there&apos;s no self-service password change yet, so this is the only
          copy shown.
        </p>
      )}
    </div>
  );
}
