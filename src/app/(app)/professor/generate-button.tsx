"use client";

import { useState, useTransition } from "react";
import { generateWeekSchedule } from "./actions";

export function GenerateButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justGenerated, setJustGenerated] = useState(false);

  function handleClick() {
    setError(null);
    setJustGenerated(false);
    startTransition(async () => {
      const result = await generateWeekSchedule();
      if (!result.ok) setError(result.error);
      else setJustGenerated(true);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={handleClick} disabled={isPending} className="pill-button">
        {isPending ? "Generating…" : "Generate schedule"}
      </button>
      {justGenerated && <span className="text-sm text-accent">Schedule generated</span>}
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
