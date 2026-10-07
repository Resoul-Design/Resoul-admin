import { BookingsPage } from "../bookings/_bookings-page";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; followup?: string; test?: string }> }) {
  const { q, followup, test } = await searchParams;
  return <BookingsPage mode="vet" query={q || ""} onlyFollow={followup === "1"} showTests={test === "1"} />;
}
