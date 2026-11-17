import { Mail, Phone } from "lucide-react";
import type { SVGProps } from "react";

/** LinkedIn mark drawn in lucide's stroke grammar (lucide ships no brand icons). */
export function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10.5V16" />
      <path d="M8 7.6v.01" />
      <path d="M12 16v-5.5" />
      <path d="M12 13a2.5 2.5 0 0 1 5 0v3" />
    </svg>
  );
}

export function ChannelIcon({ channel, ...props }: { channel: string | null } & SVGProps<SVGSVGElement>) {
  if (channel === "LinkedIn") return <LinkedInIcon {...props} />;
  if (channel === "Phone") return <Phone aria-hidden {...(props as object)} />;
  return <Mail aria-hidden {...(props as object)} />;
}
