"use client";

import { useState, useTransition } from "react";
import { respondToSwapRequest } from "./actions";
import { DAY_LABELS, formatHour, type DayOfWeek } from "@/lib/operating-hours";

export type PendingSwapRequest = {
  id: string;
  requesterName: string;
  fromShift: { dayOfWeek: number; startTime: string };
  toShift: { dayOfWeek: number; startTime: string } | null;
};

function shiftLabel(s: { dayOfWeek: number; startTime: string }) {
  const [h] = s.startTime.split(":").map(Number);
  return `${DAY_LABELS[s.dayOfWeek as DayOfWeek]} ${formatHour(h)}–${formatHour(h + 1)}`;
}

export function SwapRequestsPanel({ requests }: { requests: PendingSwapRequest[] }) {
  if (requests.length === 0) return null;

  return (
    <div className="mb-8 flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
        Pending swap requests
      </h2>
      {requests.map((req) => (
        <SwapRequestRow key={req.id} request={req} />
      ))}
    </div>
  );
}

function SwapRequestRow({ request }: { request: PendingSwapRequest }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function respond(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await respondToSwapRequest(request.id, accept);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="panel-card flex items-center justify-between gap-4 p-4">
      <p className="text-sm">
        <span className="font-medium">{request.requesterName}</span> wants to give you their{" "}
        {shiftLabel(request.fromShift)} shift
        {request.toShift && (
          <>
            {" "}
            in exchange for your {shiftLabel(request.toShift)} shift
          </>
        )}
        .
        {error && <span className="ml-2 text-danger">{error}</span>}
      </p>
      <span className="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => respond(true)}
          className="pill-button"
        >
          Accept
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => respond(false)}
          className="pill-button-outline"
        >
          Deny
        </button>
      </span>
    </div>
  );
}
