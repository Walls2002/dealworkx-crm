/**
 * The sign-in screens' look (the "professional" theme): Poppins, primary yellow #FECE14 on black, ink #111827 text.
 * Yellow is a fill only (black text on it, 13:1); focus rings are black, since yellow on white is too faint to see.
 */
export const AUTH = {
  label: "text-sm font-medium text-[#111827]",
  input:
    "h-11 rounded-lg border-[#d1d5db] bg-white px-3.5 text-[15px] text-[#111827] shadow-none placeholder:text-[#6b7280] " +
    "focus-visible:border-[#111827] focus-visible:ring-[3px] focus-visible:ring-[#111827]/15 aria-invalid:border-[#DC2626]",
  button:
    "h-11 w-full rounded-lg bg-[#FECE14] text-[15px] font-semibold text-black shadow-[0_1px_2px_rgba(17,24,39,0.12)] " +
    "hover:bg-[#F2C200] active:translate-y-px active:bg-[#E6B800] focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 " +
    "disabled:bg-[#FECE14]/60 disabled:text-black/60",
  link: "font-medium text-[#111827] underline decoration-[#FECE14] decoration-2 underline-offset-4 hover:decoration-[#111827] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
  error: "flex items-start gap-2 rounded-lg border border-[#DC2626]/25 bg-[#FEF2F2] px-3 py-2.5 text-sm text-[#991B1B]",
  ok: "flex items-start gap-2 rounded-lg border border-[#16A34A]/25 bg-[#F0FDF4] px-3 py-2.5 text-sm text-[#166534]",
  toggle: "text-[#4b5563] hover:text-[#111827] focus-visible:ring-black/40",
} as const;
