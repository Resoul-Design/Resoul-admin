// 骨灰龕成本（來源：Drive「Resoul Memorial Product Pricing for Admin（2026-11-10）」numeric_cost，按產品代碼）
export const URN_COSTS: Record<string, number> = {
  URN01S: 12, URN01L: 25, URN01SP: 12, URN01LP: 25,
  URN02S: 35, URN02L: 45, URN02SP: 35, URN02LP: 45,
  URN03: 20, URN03P: 20, URN03UP: 20,
  URN04S: 25, URN04L: 50, URN04SP: 25, URN04LP: 50, URN04SUP: 25, URN04LUP: 50,
  URN05S: 25, URN05L: 50, URN05SP: 25, URN05LP: 50, URN05SUP: 25, URN05LUP: 50,
  URN06: 25, URN06UP: 25,
  URN07: 55, URN07UP: 55, URN07P: 55,
  URN08: 200, URN08UP: 200,
  URN09: 80, URN09UP: 80,
  URNW: 0,
};
// 骨灰龕成本；By Package、No Urn、Pending 等不是產品代碼時為 null
export function urnCost(code: string | null | undefined, table: Record<string, number> = URN_COSTS): number | null {
  const c = String(code || "").trim().toUpperCase();
  return c in table ? table[c] : null;
}
