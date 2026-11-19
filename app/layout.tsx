import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
// The brand typeface, used only by the email-signature previews (lib/signature.ts) so they match the sent email.
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-sig" });

export const metadata: Metadata = {
  title: { default: "DealWorkx CRM", template: "%s · DealWorkx CRM" },
  description: "DealWorkx team CRM: leads, outreach steps, calls and follow-ups.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans antialiased", inter.variable, interTight.variable)}>
      {/* Browser extensions (e.g. Grammarly) inject attributes on <body> before hydration. */}
      <body suppressHydrationWarning>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
