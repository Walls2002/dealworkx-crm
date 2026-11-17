import { CallsPage } from "@/components/calls-page";

export const metadata = { title: "Call Pipeline" };

export default function CallPipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <CallsPage mode="pipeline" searchParams={searchParams} />;
}
