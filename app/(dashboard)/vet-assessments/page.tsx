import { BookingsPage } from "../bookings/_bookings-page";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; followup?: string }> }) {
  const { q, followup } = await searchParams;
  return <BookingsPage mode="vet" query={q || ""} onlyFollow={followup === "1"} />;
}
