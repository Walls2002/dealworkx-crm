import { CircleAlert, CircleCheck } from "lucide-react";
import { AUTH } from "./auth-styles";

/** An error or success note on the sign-in screens, announced to screen readers. */
export function AuthMessage({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <p role="alert" className={AUTH.error}><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p>;
  if (ok) return <p role="status" className={AUTH.ok}><CircleCheck className="mt-0.5 size-4 shrink-0" />{ok}</p>;
  return null;
}
