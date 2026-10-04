import { BookingsPage } from "./_bookings-page";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; followup?: string }> }) {
  const { q, followup } = await searchParams;
  return <BookingsPage mode="cremation" query={q || ""} onlyFollow={followup === "1"} />;
}
