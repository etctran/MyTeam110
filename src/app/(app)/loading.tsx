/**
 * Applies to every route under (app)/ — Next wraps all of them in a
 * Suspense boundary with this as the fallback. Without this file,
 * clicking a nav tab shows nothing until the whole next page's data
 * fetch resolves, which reads as a frozen click; this at least gives
 * instant feedback that the navigation registered.
 */
export default function Loading() {
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
