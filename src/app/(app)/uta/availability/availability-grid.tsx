"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveAvailability, type AvailabilityCell } from "./actions";
import {
  DAY_LABELS,
  GRID_END_HOUR,
  GRID_START_HOUR,
  OPERATING_DAYS,
  formatHour,
  isOperatingHour,
  type DayOfWeek,
} from "@/lib/operating-hours";

function keyOf(day: number, hour: number) {
  return `${day}:${hour}`;
}

export function AvailabilityGrid({ initialCells }: { initialCells: AvailabilityCell[] }) {
  const initialSet = useMemo(
    () => new Set(initialCells.map((c) => keyOf(c.day, c.hour))),
    [initialCells],
  );
  const [selected, setSelected] = useState<Set<string>>(initialSet);
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  // Drag-to-paint: mousedown decides select-vs-deselect from the first
  // cell, mouseenter while dragging paints every cell it crosses the same
  // way. A plain click is just a drag of length one.
  const draggingRef = useRef(false);
  const paintValueRef = useRef(true);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h++) arr.push(h);
    return arr;
  }, []);

  const dirty = useMemo(() => {
    if (selected.size !== initialSet.size) return true;
    for (const key of selected) if (!initialSet.has(key)) return true;
    return false;
  }, [selected, initialSet]);

  function setCell(day: number, hour: number, value: boolean) {
    setSelected((prev) => {
      const key = keyOf(day, hour);
      if (prev.has(key) === value) return prev;
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function handlePointerDown(day: number, hour: number) {
    const nextValue = !selected.has(keyOf(day, hour));
    draggingRef.current = true;
    paintValueRef.current = nextValue;
    setJustSaved(false);
    setCell(day, hour, nextValue);
  }

  function handlePointerEnter(day: number, hour: number) {
    if (!draggingRef.current) return;
    setCell(day, hour, paintValueRef.current);
  }

  useEffect(() => {
    function onUp() {
      draggingRef.current = false;
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  function handleSave() {
    const cells: AvailabilityCell[] = [...selected].map((key) => {
      const [day, hour] = key.split(":").map(Number);
      return { day, hour };
    });
    startTransition(async () => {
      await saveAvailability(cells);
      setJustSaved(true);
    });
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !dirty}
          className="pill-button"
        >
          {isPending ? "Saving…" : "Save availability"}
        </button>
        {dirty ? (
          <span className="text-sm text-text-muted">Unsaved changes</span>
        ) : justSaved ? (
          <span className="text-sm text-accent">Saved</span>
        ) : null}
      </div>

      <div
        className="inline-grid select-none gap-px rounded-lg border border-border bg-border"
        style={{ gridTemplateColumns: `4rem repeat(${OPERATING_DAYS.length}, 5.5rem)` }}
      >
        <div className="bg-bg" />
        {OPERATING_DAYS.map((day) => (
          <div
            key={day}
            className="bg-bg px-2 py-2 text-center text-xs font-semibold text-text-muted"
          >
            {DAY_LABELS[day as DayOfWeek]}
          </div>
        ))}

        {hours.map((hour) => (
          <div key={hour} className="contents">
            <div className="flex items-center justify-end bg-bg px-2 py-1.5 text-xs text-text-muted">
              {formatHour(hour)}
            </div>
            {OPERATING_DAYS.map((day) => {
              const inBounds = isOperatingHour(day as DayOfWeek, hour);
              const key = keyOf(day, hour);
              const isSelected = selected.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!inBounds}
                  onMouseDown={() => inBounds && handlePointerDown(day, hour)}
                  onMouseEnter={() => inBounds && handlePointerEnter(day, hour)}
                  aria-pressed={isSelected}
                  aria-label={`${DAY_LABELS[day as DayOfWeek]} ${formatHour(hour)}`}
                  className={
                    "h-8 w-full transition-colors " +
                    (!inBounds
                      ? "cursor-not-allowed bg-bg-input/40"
                      : isSelected
                        ? "bg-accent hover:bg-accent-strong"
                        : "bg-bg-input hover:bg-bg-pill-hover")
                  }
                />
              );
            })}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Click or drag across hours to mark yourself available. Dimmed cells are outside operating hours.
      </p>
    </div>
  );
}
