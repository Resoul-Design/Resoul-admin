"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTestRecords, setTestFlag, type TestEntity } from "./_test-actions";
import { useCloseRowActions } from "./_row-actions";

// 「操作」視窗內：標記為測試／取消測試
export function TestFlagPanel({ entity, id, isTest }: { entity: TestEntity; id: string; isTest: boolean }) {
  const router = useRouter();
  const close = useCloseRowActions();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="space-y-3 text-sm">
      <p className="leading-6 text-[var(--soft)]">
        {isTest
          ? "此記錄已標記為測試：不會計入收入、報表及跟進，列表預設隱藏。取消後會回復為正式記錄。"
          : "標記為測試後，此記錄不會計入收入、報表及跟進，列表預設隱藏（可隨時取消）。Shopify 測試付款的訂單會自動標記。"}
      </p>
      {error && <p className="text-red-700" role="alert">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setTestFlag(entity, id, !isTest);
            if (res.error) setError(res.error);
            else {
              close();
              router.refresh();
            }
          })
        }
        className="rounded-lg bg-[var(--gold)] px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "更新中…" : isTest ? "取消測試標記" : "標記為測試"}
      </button>
    </div>
  );
}

// 列表上方：測試記錄數量、查看／返回，以及（管理員）刪除全部測試記錄
export function TestRecordsBar({
  entity,
  count,
  showing,
  basePath,
  canDelete,
}: {
  entity: TestEntity;
  count: number;
  showing: boolean;
  basePath: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  if (!count && !showing) return null;
  return (
    <div className={"mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-sm " + (showing ? "border-amber-200 bg-amber-50 text-amber-900" : "border-[var(--line)] bg-[var(--card)] text-[var(--soft)]")}>
      {showing ? (
        <>
          <span>正在查看 <b>{count}</b> 筆測試記錄（不計入收入、報表及跟進）。</span>
          <Link href={basePath} className="text-[var(--gold)] hover:underline">返回正式記錄</Link>
          {canDelete && entity !== "order" && count > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`確定永久刪除全部 ${count} 筆測試記錄？此操作不能還原。`)) return;
                start(async () => {
                  const res = await deleteTestRecords(entity);
                  if (res.error) setMessage(res.error);
                  else {
                    setMessage(`已刪除 ${res.count ?? 0} 筆。`);
                    router.refresh();
                  }
                });
              }}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {pending ? "刪除中…" : "刪除全部測試記錄"}
            </button>
          )}
          {message && <span role="status">{message}</span>}
        </>
      ) : (
        <>
          <span>另有 {count} 筆測試記錄已隱藏。</span>
          <Link href={`${basePath}?test=1`} className="text-[var(--gold)] hover:underline">查看測試記錄</Link>
        </>
      )}
    </div>
  );
}
