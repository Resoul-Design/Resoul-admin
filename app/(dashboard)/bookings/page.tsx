import { BookingsPage } from "./_bookings-page";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; followup?: string; test?: string }> }) {
  const { q, followup, test } = await searchParams;
  return <BookingsPage mode="cremation" query={q || ""} onlyFollow={followup === "1"} showTests={test === "1"} />;
}
