import { CallsPage } from "@/components/calls-page";

export const metadata = { title: "Recorded Call History" };

export default function RecordedCallsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <CallsPage mode="history" searchParams={searchParams} />;
}
