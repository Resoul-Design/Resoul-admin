import { BookingsPage } from "../bookings/_bookings-page";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <BookingsPage mode="vet" query={q || ""} />;
}
