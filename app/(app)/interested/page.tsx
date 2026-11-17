import { FollowupPage } from "@/components/followup-page";

export const metadata = { title: "Interested" };

export default function InterestedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FollowupPage kind="interested" searchParams={searchParams} />;
}
