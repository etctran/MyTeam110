import { InlineLoading } from "@/components/app-shell/inline-loading";

/**
 * Applies to every route under (app)/ — Next wraps all of them in a
 * Suspense boundary with this as the fallback. Without this file,
 * clicking a nav tab shows nothing until the whole next page's data
 * fetch resolves, which reads as a frozen click; this at least gives
 * instant feedback that the navigation registered.
 *
 * With per-page Suspense boundaries around just their data-dependent
 * content (see each page.tsx), this outer fallback mostly only fires
 * for the layout's own `requireUser()` auth check — the one thing that
 * genuinely has to block before anything renders.
 */
export default function Loading() {
  return <InlineLoading />;
}
