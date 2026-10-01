"use client";

// 刪除前確認（刪除後不能復原；只想暫時不用可取消勾選「在回覆助手顯示」）
export function ConfirmDelete() {
  return (
    <button
      className="text-xs text-red-600 hover:underline"
      onClick={(e) => {
        if (!window.confirm("確定刪除此回覆？刪除後不能復原。如只想暫時不用，可取消勾選「在回覆助手顯示」。")) e.preventDefault();
      }}
    >
      刪除
    </button>
  );
}
