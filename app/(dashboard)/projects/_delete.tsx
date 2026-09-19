"use client";

import { deleteProject } from "./actions";

export function DeleteProject({ id, label }: { id: string; label: string }) {
  return (
    <form
      action={deleteProject}
      onSubmit={(e) => {
        if (!confirm(`確定刪除專案「${label}」？\n此動作會一併刪除其收支明細，且不可還原。`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="text-xs text-red-600 hover:underline">刪除</button>
    </form>
  );
}
