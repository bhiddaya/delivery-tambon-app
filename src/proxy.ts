import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // ยังไม่ได้ตั้ง environment variables — ปล่อยผ่านไปเลย
  //
  // middleware รันก่อน "ทุก" request ถ้าที่นี่ throw ทั้งเว็บจะขึ้น
  // Internal Server Error ทุกหน้า แม้แต่หน้าที่ไม่ได้ใช้ฐานข้อมูล
  // ยอมให้หน้าเว็บแสดงผลได้ (แค่ไม่มี session) ดีกว่าเว็บล่มทั้งหมด
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // refreshes the auth session cookie if needed
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // ยกเว้น api/line ด้วย — LINE ยิง webhook เข้ามาโดยไม่มี cookie ของเรา
  // การไปรีเฟรช session ให้มันจึงเปล่าประโยชน์ และเพิ่มจุดที่พังได้
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|api/line).*)",
  ],
};
