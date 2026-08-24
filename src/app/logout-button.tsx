import { logout } from "@/app/login/actions";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="pill-button-outline">
        Sign out
      </button>
    </form>
  );
}
