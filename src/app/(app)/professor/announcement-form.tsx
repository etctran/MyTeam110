"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendAnnouncement } from "./actions";

export function AnnouncementForm() {
  const [state, formAction, pending] = useActionState(sendAnnouncement, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "ok" in state) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="panel-card flex flex-col gap-3 p-4">
      <label htmlFor="message" className="text-sm font-medium text-text-muted">
        Message to every TA
      </label>
      <textarea
        id="message"
        name="message"
        required
        rows={3}
        placeholder="e.g. Office hours are cancelled this Friday for the holiday."
        className="field-input resize-none"
      />

      {state && "error" in state && <p className="text-sm text-danger">{state.error}</p>}
      {state && "ok" in state && <p className="text-sm text-accent">Sent to every TA.</p>}

      <button type="submit" disabled={pending} className="pill-button self-start">
        {pending ? "Sending…" : "Send announcement"}
      </button>
    </form>
  );
}
