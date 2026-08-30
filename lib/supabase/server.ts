import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 以登入員工身分建立的 Supabase client（受 RLS 約束）。
// 用於 Server Components 與 Server Actions。
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as never)
            );
          } catch {
            // 在 Server Component 內呼叫 set 會拋錯；session 更新由 middleware 處理，可忽略。
          }
        },
      },
    }
  );
}
