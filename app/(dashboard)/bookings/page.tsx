import { BookingsPage } from "./_bookings-page";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <BookingsPage mode="cremation" query={q || ""} />;
}
