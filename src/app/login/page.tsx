import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold tracking-tight">TA</span>
        <span className="font-accent text-2xl italic text-text-muted">Scheduler</span>
      </div>
      <div className="panel-card w-full max-w-sm p-6">
        <h1 className="mb-5 text-lg font-semibold">Sign in</h1>
        <LoginForm />
      </div>
    </main>
  );
}
