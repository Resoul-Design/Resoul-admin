import { createClient } from "@supabase/supabase-js";

// 服務端特權 client（service_role），繞過 RLS。
// 只可在伺服器端（Server Actions / Route Handlers）使用，切勿引入到瀏覽器程式碼。
// 目前 MVP 的審核以「登入員工 + RLS」進行，此 client 保留給日後需要跨 RLS 的批次/系統操作。
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY（請於 .env.local 設定）");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
