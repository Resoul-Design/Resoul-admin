import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { moduleForPath } from "@/lib/modules";

// 每個請求刷新 session，並攔截未登入者到 /login。
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/api/shopify");

  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // 防護：若環境變數未設，唔好令 middleware 崩潰；非公開頁導去 /login。
  if (!SB_URL || !SB_KEY) {
    if (!isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return response;
  }

  const supabase = createServerClient(
    SB_URL,
    SB_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as never)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 功能權限攔截（模組頁）
  if (user && !isPublic && !path.startsWith("/api")) {
    const mod = moduleForPath(path);
    if (mod) {
      const { data: st } = await supabase
        .from("staff")
        .select("role, permissions, active")
        .eq("id", user.id)
        .maybeSingle();
      if (!st || !st.active) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
      }
      const allowed =
        st.role === "admin" || ((st.permissions as string[] | null) || []).includes(mod);
      if (!allowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
