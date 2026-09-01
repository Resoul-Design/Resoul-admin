"use client";

export function PrintButton() {
  return (
    <div className="no-print fixed top-4 right-4 flex gap-2 z-10">
      <button
        onClick={() => window.print()}
        className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90 shadow"
      >
        列印 / 儲存 PDF
      </button>
      <button
        onClick={() => window.close()}
        className="px-4 py-2 rounded-lg text-sm border border-[var(--line)] bg-white hover:bg-[var(--cream)]"
      >
        關閉
      </button>
    </div>
  );
}
