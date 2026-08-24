import Link from "next/link";
import { LogoutButton } from "@/app/logout-button";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Not authorized</h1>
      <p className="text-sm text-text-muted">
        Your account doesn&apos;t have access to that page.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <Link href="/" className="link-accent text-sm">
          Go home
        </Link>
        <LogoutButton />
      </div>
    </main>
  );
}
