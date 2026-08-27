import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex items-baseline">
        <span className="text-2xl font-extrabold tracking-tight">MyTeam</span>
        <span className="text-2xl font-extrabold tracking-tight text-accent">110</span>
      </div>
      <div className="panel-card w-full max-w-sm p-6">
        <h1 className="mb-5 text-lg font-semibold">Sign in</h1>
        <LoginForm />
      </div>
    </main>
  );
}
