import { createBrowserClient } from "@supabase/ssr";

// 瀏覽器端 Supabase client（登入頁使用）。
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
