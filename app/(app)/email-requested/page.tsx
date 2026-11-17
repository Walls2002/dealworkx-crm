import { FollowupPage } from "@/components/followup-page";

export const metadata = { title: "Email requested" };

export default function EmailRequestedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FollowupPage kind="email-requested" searchParams={searchParams} />;
}
