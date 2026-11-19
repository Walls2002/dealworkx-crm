import { AuthShell } from "@/components/auth-shell";
import { ForgotForm } from "./form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your work email and we'll send you a link to choose a new one.">
      <ForgotForm />
    </AuthShell>
  );
}
