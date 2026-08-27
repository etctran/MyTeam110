"use client";

import { useMemo, useState, useTransition } from "react";
import {
  assignTaToShift,
  createShift,
  deleteShift,
  moveToOpenShift,
  removeAssignment,
  requestSwap,
  toggleLead,
} from "./actions";
import {
  DAY_LABELS,
  GRID_END_HOUR,
  GRID_START_HOUR,
  OPERATING_DAYS,
  formatHour,
  formatTime,
  isOperatingHour,
  type DayOfWeek,
} from "@/lib/operating-hours";
import { hasShiftStarted } from "@/lib/shift-time";

export type ShiftData = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  minTas: number;
  maxTas: number;
  assignments: { id: string; isLead: boolean; user: { id: string; name: string; isReturning: boolean } }[];
};

export type TaOption = { id: string; name: string };
export type AvailabilityWindowData = { dayOfWeek: number; startHour: number; endHour: number };

function keyOf(day: number, hour: number) {
  return `${day}:${hour}`;
}

function firstName(fullName: string) {
  return fullName.split(" ")[0];
}

export function ScheduleGrid({
  shifts,
  allTas,
  currentUserId,
  isProfessor,
  myAvailability,
  weekStartDate,
}: {
  shifts: ShiftData[];
  allTas: TaOption[];
  currentUserId: string;
  isProfessor: boolean;
  myAvailability: AvailabilityWindowData[];
  weekStartDate: Date;
}) {
  function hasPassed(day: number, hour: number) {
    return hasShiftStarted(weekStartDate, day, formatTime(hour));
  }

  const shiftsByKey = useMemo(() => {
    const map = new Map<string, ShiftData>();
    for (const shift of shifts) {
      const [hour] = shift.startTime.split(":").map(Number);
      map.set(keyOf(shift.dayOfWeek, hour), shift);
    }
    return map;
  }, [shifts]);

  function amAvailable(day: number, hour: number) {
    return myAvailability.some((w) => w.dayOfWeek === day && w.startHour <= hour && hour < w.endHour);
  }

  const [selected, setSelected] = useState<{ day: number; hour: number } | null>(null);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h++) arr.push(h);
    return arr;
  }, []);

  const selectedShift = selected ? shiftsByKey.get(keyOf(selected.day, selected.hour)) : undefined;

  return (
    <div>
      <div
        className="inline-grid select-none gap-px rounded-lg border border-border bg-border"
        style={{ gridTemplateColumns: `4rem repeat(${OPERATING_DAYS.length}, 8.5rem)` }}
      >
        <div className="bg-bg" />
        {OPERATING_DAYS.map((day) => (
          <div key={day} className="bg-bg px-2 py-2 text-center text-xs font-semibold text-text-muted">
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
              const shift = shiftsByKey.get(keyOf(day, hour));
              const mine = shift?.assignments.find((a) => a.user.id === currentUserId);
              const isSelected = selected?.day === day && selected.hour === hour;

              // Headcount alone decides eligibility, no "posted" step —
              // matches moveToOpenShift's actual gate. Once a shift has
              // started, none of this applies any more either.
              const passed = hasPassed(day, hour);
              const openToJoin =
                inBounds &&
                !!shift &&
                !mine &&
                !passed &&
                shift.assignments.length < shift.maxTas &&
                amAvailable(day, hour);
              const eligibleToMove =
                inBounds && !!shift && !!mine && !passed && shift.assignments.length > shift.minTas;

              return (
                <button
                  key={keyOf(day, hour)}
                  type="button"
                  disabled={!inBounds}
                  onClick={() => inBounds && setSelected({ day, hour })}
                  aria-pressed={isSelected}
                  aria-label={`${DAY_LABELS[day as DayOfWeek]} ${formatHour(hour)}`}
                  className={
                    "relative flex min-h-12 w-full flex-col items-start gap-0.5 px-2 py-1.5 text-[11px] leading-tight transition-colors " +
                    (!inBounds
                      ? "cursor-not-allowed bg-bg-input/40"
                      : isSelected
                        ? "bg-bg-pill-active"
                        : openToJoin
                          ? "bg-accent/10 hover:bg-accent/20"
                          : shift
                            ? "bg-bg-input hover:bg-bg-pill-hover"
                            : "bg-bg hover:bg-bg-pill-hover") +
                    (mine ? " ring-2 ring-inset ring-accent" : "")
                  }
                >
                  {(openToJoin || eligibleToMove) && (
                    <span
                      className={
                        "absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full " +
                        (openToJoin ? "bg-accent" : "bg-text-muted")
                      }
                    />
                  )}
                  {shift ? (
                    <>
                      <span className="flex w-full items-center gap-1.5 pr-2 font-medium text-text">
                        {shift.assignments.length}/{shift.maxTas}
                        {shift.assignments.length < shift.minTas && (
                          <span className="font-normal text-danger">low</span>
                        )}
                      </span>
                      {shift.assignments.map((a) => (
                        <span
                          key={a.id}
                          className={
                            "w-full truncate text-left " +
                            (a.isLead
                              ? "font-semibold text-accent"
                              : a.user.id === currentUserId
                                ? "text-text"
                                : "text-text-muted")
                          }
                        >
                          {firstName(a.user.name)}
                          {a.isLead && " ★"}
                        </span>
                      ))}
                    </>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Your own shifts are outlined. An accent dot means you could move into that shift; a muted dot
        on your own shift means you have room to move out of it. Click any cell for the roster
        {isProfessor ? " and to create or assign shifts" : ""}.
      </p>

      <div className="mt-6">
        {selected ? (
          <CellDetail
            day={selected.day}
            hour={selected.hour}
            shift={selectedShift}
            allTas={allTas}
            isProfessor={isProfessor}
            currentUserId={currentUserId}
            shifts={shifts}
            myAvailability={myAvailability}
            weekStartDate={weekStartDate}
          />
        ) : (
          <p className="text-sm text-text-muted">Click a cell to see who&apos;s scheduled.</p>
        )}
      </div>
    </div>
  );
}

function CellDetail({
  day,
  hour,
  shift,
  allTas,
  isProfessor,
  currentUserId,
  shifts,
  myAvailability,
  weekStartDate,
}: {
  day: number;
  hour: number;
  shift: ShiftData | undefined;
  allTas: TaOption[];
  isProfessor: boolean;
  currentUserId: string;
  shifts: ShiftData[];
  myAvailability: AvailabilityWindowData[];
  weekStartDate: Date;
}) {
  const shiftHasPassed = !!shift && hasShiftStarted(weekStartDate, day, shift.startTime);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [minTas, setMinTas] = useState(3);
  const [maxTas, setMaxTas] = useState(6);
  const [pickedTa, setPickedTa] = useState("");
  const [pickedTeammate, setPickedTeammate] = useState("");
  const [pickedTheirShift, setPickedTheirShift] = useState("");
  const [pickedMoveShift, setPickedMoveShift] = useState("");

  const label = `${DAY_LABELS[day as DayOfWeek]} ${formatHour(hour)}–${formatHour(hour + 1)}`;
  const unassigned = allTas.filter((ta) => !shift?.assignments.some((a) => a.user.id === ta.id));
  const mine = shift?.assignments.find((a) => a.user.id === currentUserId);

  function isAvailableForShift(s: ShiftData) {
    const [h] = s.startTime.split(":").map(Number);
    return myAvailability.some((w) => w.dayOfWeek === s.dayOfWeek && w.startHour <= h && h < w.endHour);
  }

  // Shifts I'm on with room to leave (headcount > min) — used when I'm
  // viewing someone else's open shift and want to move here from one of these.
  const myEligibleSourceShifts = shifts.filter(
    (s) => s.assignments.some((a) => a.user.id === currentUserId) && s.assignments.length > s.minTas,
  );
  // Other shifts with room for me (headcount < max), available, not already mine —
  // used when I'm viewing my own shift and want to move out to one of these.
  const eligibleTargetShifts = shift
    ? shifts.filter(
        (s) =>
          s.id !== shift.id &&
          s.assignments.length < s.maxTas &&
          !s.assignments.some((a) => a.user.id === currentUserId) &&
          isAvailableForShift(s),
      )
    : [];

  const teammateOptions = allTas.filter(
    (ta) => ta.id !== currentUserId && !shift?.assignments.some((a) => a.user.id === ta.id),
  );
  const teammateShifts = shifts.filter(
    (s) => s.id !== shift?.id && s.assignments.some((a) => a.user.id === pickedTeammate),
  );

  function shiftLabel(s: ShiftData) {
    const [h] = s.startTime.split(":").map(Number);
    return `${DAY_LABELS[s.dayOfWeek as DayOfWeek]} ${formatHour(h)}–${formatHour(h + 1)}`;
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="panel-card max-w-md p-4">
      <p className="mb-3 font-medium">{label}</p>

      {!shift ? (
        isProfessor ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-muted">No shift here yet.</p>
            <div className="flex items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                Min TAs
                <input
                  type="number"
                  min={1}
                  value={minTas}
                  onChange={(e) => setMinTas(Number(e.target.value))}
                  className="field-input w-20"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                Max TAs
                <input
                  type="number"
                  min={1}
                  value={maxTas}
                  onChange={(e) => setMaxTas(Number(e.target.value))}
                  className="field-input w-20"
                />
              </label>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => createShift(day, hour, minTas, maxTas))}
                className="pill-button"
              >
                Create shift
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No office hours scheduled here yet.</p>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">
            {shift.assignments.length}/{shift.maxTas} TAs (min {shift.minTas})
          </p>

          {shift.assignments.length === 0 ? (
            <p className="text-sm text-text-muted">Nobody assigned yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {shift.assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {a.user.name}
                    {a.isLead && (
                      <span className="ml-2 rounded-full bg-bg-pill-active px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        Lead
                      </span>
                    )}
                  </span>
                  {isProfessor && (
                    <span className="flex gap-2">
                      {(a.isLead || a.user.isReturning) && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => run(() => toggleLead(shift.id, a.user.id, !a.isLead))}
                          className="text-xs text-text-muted underline hover:text-text"
                        >
                          {a.isLead ? "Unmark lead" : "Make lead"}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => removeAssignment(shift.id, a.user.id))}
                        className="text-xs text-danger underline"
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isProfessor && (
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <select
                aria-label="Assign a TA"
                value={pickedTa}
                onChange={(e) => setPickedTa(e.target.value)}
                className="field-input flex-1"
              >
                <option value="">Assign a TA…</option>
                {unassigned.map((ta) => (
                  <option key={ta.id} value={ta.id}>
                    {ta.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isPending || !pickedTa}
                onClick={() => {
                  const userId = pickedTa;
                  setPickedTa("");
                  run(() => assignTaToShift(shift.id, userId));
                }}
                className="pill-button"
              >
                Assign
              </button>
            </div>
          )}

          {isProfessor && shift.assignments.length === 0 && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => deleteShift(shift.id))}
              className="self-start text-xs text-danger underline"
            >
              Delete this shift
            </button>
          )}

          {/* --- Swap flows --- */}
          {shiftHasPassed ? (
            <p className="border-t border-border pt-3 text-xs text-text-muted">
              This shift has already happened — it can no longer be changed.
            </p>
          ) : mine ? (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Move to another shift</p>
                {shift.assignments.length <= shift.minTas ? (
                  <p className="text-xs text-text-muted">
                    You&apos;re one of only {shift.minTas} here — moving would drop below the minimum.
                  </p>
                ) : eligibleTargetShifts.length === 0 ? (
                  <p className="text-xs text-text-muted">
                    No other shift you&apos;re available for currently has room.
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Move to shift"
                      value={pickedMoveShift}
                      onChange={(e) => setPickedMoveShift(e.target.value)}
                      className="field-input flex-1"
                    >
                      <option value="">Pick a shift…</option>
                      {eligibleTargetShifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {shiftLabel(s)} ({s.assignments.length}/{s.maxTas})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={isPending || !pickedMoveShift}
                      onClick={() => {
                        const target = pickedMoveShift;
                        setPickedMoveShift("");
                        run(() => moveToOpenShift(shift.id, target));
                      }}
                      className="pill-button"
                    >
                      Move
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Request a swap with a teammate</p>
                <select
                  aria-label="Pick a teammate"
                  value={pickedTeammate}
                  onChange={(e) => {
                    setPickedTeammate(e.target.value);
                    setPickedTheirShift("");
                  }}
                  className="field-input"
                >
                  <option value="">Pick a teammate…</option>
                  {teammateOptions.map((ta) => (
                    <option key={ta.id} value={ta.id}>
                      {ta.name}
                    </option>
                  ))}
                </select>
                {pickedTeammate && (
                  <select
                    aria-label="Take their shift in exchange"
                    value={pickedTheirShift}
                    onChange={(e) => setPickedTheirShift(e.target.value)}
                    className="field-input"
                  >
                    <option value="">(Optional) take one of their shifts in exchange…</option>
                    {teammateShifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {shiftLabel(s)}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  disabled={isPending || !pickedTeammate}
                  onClick={() => {
                    const teammate = pickedTeammate;
                    const theirShift = pickedTheirShift || null;
                    setPickedTeammate("");
                    setPickedTheirShift("");
                    run(() => requestSwap(shift.id, teammate, theirShift));
                  }}
                  className="pill-button self-start"
                >
                  Send request
                </button>
              </div>
            </div>
          ) : (
            shift.assignments.length < shift.maxTas && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="text-sm font-medium">Move here from one of your shifts</p>
                {!isAvailableForShift(shift) ? (
                  <p className="text-xs text-text-muted">You&apos;re not marked available for this hour.</p>
                ) : myEligibleSourceShifts.length === 0 ? (
                  <p className="text-xs text-text-muted">
                    None of your current shifts have room to spare (headcount above their minimum).
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Move here from"
                      value={pickedMoveShift}
                      onChange={(e) => setPickedMoveShift(e.target.value)}
                      className="field-input flex-1"
                    >
                      <option value="">Pick one of your shifts…</option>
                      {myEligibleSourceShifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {shiftLabel(s)} ({s.assignments.length}/{s.maxTas})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={isPending || !pickedMoveShift}
                      onClick={() => {
                        const source = pickedMoveShift;
                        setPickedMoveShift("");
                        run(() => moveToOpenShift(source, shift.id));
                      }}
                      className="pill-button"
                    >
                      Move
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
