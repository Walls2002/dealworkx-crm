import { Poppins } from "next/font/google";
import { CalendarCheck2, ListChecks, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-auth", display: "swap" });

const POINTS = [
  { icon: ListChecks, text: "Today's queue, sorted by what's due first" },
  { icon: CalendarCheck2, text: "Every sequence step with its message ready to send" },
  { icon: PhoneCall, text: "Calls logged in seconds, callbacks never missed" },
];

/** The DX mark plus wordmark, light (on the black panel) or dark (on white). */
function Lockup({ tone }: { tone: "light" | "dark" }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", tone === "light" && "[&_.fill-foreground]:fill-white")}>
      <LogoMark className="h-8 w-[41px]" />
      <span className={cn("text-[19px] font-semibold tracking-[-0.02em]", tone === "light" ? "text-white" : "text-[#111827]")}>
        DealWorkx <span className={tone === "light" ? "font-normal text-white/60" : "font-normal text-[#6b7280]"}>CRM</span>
      </span>
    </span>
  );
}

/**
 * The sign-in screens (login, forgot password, set password): a black brand panel on the left, the form on white.
 * On phones the panel gives way to the form, with the logo on top.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        poppins.variable,
        "grid min-h-svh bg-white font-[family-name:var(--font-auth)] text-[#111827] caret-[#111827] selection:bg-[#FECE14] selection:text-black lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]",
      )}
    >
      <aside className="relative hidden overflow-hidden bg-black text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        {/* The X blade, drawn large and faint: the brand's one diagonal. */}
        <svg aria-hidden viewBox="0 0 92 72" className="pointer-events-none absolute -right-24 -bottom-28 w-[620px] opacity-[0.07]">
          <path d="M47 40L61 37.5L87 68H70Z" fill="#FECE14" />
          <path d="M86 4.5L61 37.5L47 40Z" fill="#FECE14" />
        </svg>
        <Lockup tone="light" />
        <div className="relative max-w-[30rem]">
          <h2 className="text-[44px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance xl:text-[52px]">
            Work the list.
            <br />
            <span className="text-[#FECE14]">Book the meeting.</span>
          </h2>
          <p className="mt-5 max-w-[26rem] text-[17px] leading-relaxed text-white/75">
            The DealWorkx team&rsquo;s queue, outreach steps and call log, in one place.
          </p>
          <ul className="mt-10 grid gap-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3.5 text-[15px] text-white/85">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.08] ring-1 ring-white/10" aria-hidden>
                  <Icon className="size-[18px] text-[#FECE14]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">© {new Date().getFullYear()} DealWorkx · Internal tool for the DealWorkx team</p>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10 lg:px-12">
        <div className="lg:hidden"><Lockup tone="dark" /></div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
            {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-[#4b5563]">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
