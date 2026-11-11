// 骨灰龕成本：Memorial product pricing 的 URN* 代碼 → Cost（E 欄）。
// 牌價為 0（套餐已包括）仍可有成本。By Package／Upgrade 等狀態沒有唯一代碼，不可猜一個成本，也不可當 0。

export const URN_COSTS: Record<string, number> = {
  URN01S: 12,
  URN01L: 25,
  URN01SP: 12,
  URN01LP: 25,
  URN02S: 35,
  URN02L: 45,
  URN02SP: 35,
  URN02LP: 45,
  URN03: 20,
  URN03P: 20,
  URN03UP: 20,
  URN04S: 25,
  URN04L: 50,
  URN04SP: 25,
  URN04LP: 50,
  URN04SUP: 25,
  URN04LUP: 50,
  URN05S: 25,
  URN05L: 50,
  URN05SP: 25,
  URN05LP: 50,
  URN05SUP: 25,
  URN05LUP: 50,
  URN06: 25,
  URN06UP: 25,
  URN07: 55,
  URN07UP: 55,
  URN07P: 55,
  URN08: 200,
  URN08UP: 200,
  URN09: 80,
  URN09UP: 80,
  URNW: 0,
};

const CODES = Object.keys(URN_COSTS).sort((a, b) => b.length - a.length);

export type UrnCostLookup =
  | { state: "empty" }
  | { state: "amount"; sku: string; amount: number }
  | { state: "unresolved"; reason: string };

// 只接受完整代碼，或文字中以界線包住的代碼（例如「…(URN03UP)」）。較長代碼優先，避免 URN03 誤中 URN03UP。
export function lookupUrnCost(value: unknown): UrnCostLookup {
  const raw = String(value ?? "").trim();
  if (!raw) return { state: "empty" };
  const upper = raw.toUpperCase();
  const exact = CODES.find((code) => code === upper);
  if (exact) return { state: "amount", sku: exact, amount: URN_COSTS[exact] };
  const embedded = CODES.filter((code) => new RegExp(`(^|[^A-Z0-9])${code}([^A-Z0-9]|$)`, "i").test(raw));
  if (embedded.length === 1) return { state: "amount", sku: embedded[0], amount: URN_COSTS[embedded[0]] };
  if (embedded.length > 1) return { state: "unresolved", reason: "多於一個骨灰龕代碼" };
  return { state: "unresolved", reason: "沒有唯一骨灰龕代碼" };
}
