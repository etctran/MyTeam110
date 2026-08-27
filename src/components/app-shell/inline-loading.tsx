/**
 * Shared Suspense fallback — a small pulsing dot + label. Used both as
 * `(app)/loading.tsx` (the outermost fallback, for the rare case nothing
 * more specific catches a suspension first) and as the fallback for the
 * per-page Suspense boundaries that wrap just the Prisma-dependent part
 * of each page, so the page shell (header, static copy, forms with no
 * query dependency) never has to wait on it.
 */
export function InlineLoading() {
  return (
    <div className="flex items-center gap-2.5 text-sm text-text-muted">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      Loading…
    </div>
  );
}
