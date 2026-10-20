import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getLineConfig, multicastMessage, type LineMessage } from "@/lib/line";
import {
  cleanSignup,
  sameSignature,
  signupGroup,
  signupSignature,
  vehicleTypeOf,
  VEHICLE_LABEL,
} from "@/lib/line-signup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// แอดมินส่วนกลางที่ได้แจ้งทุกใบสมัคร (เดิมฝังไว้ใน workflow n8n)
const CENTRAL_ADMIN_IDS = ["U2bb9719524e34535d1a2e1ee3422f74d"];

// รายชื่อตำบลที่รับสมัคร — หน้าสมัครใช้ดึงไปใส่ในช่องเลือกตำบล
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().rpc("line_signup_tambons");
    if (error) throw error;
    return NextResponse.json(data ?? { tambons: [] });
  } catch {
    return NextResponse.json({ error: "โหลดรายชื่อตำบลไม่ได้ กรุณาลองใหม่" }, { status: 503 });
  }
}

// หน้าสมัครบนเว็บเรียก API นี้ — ลายเซ็นในลิงก์ป้องกันไม่ให้ใครยิงใบสมัครปลอมแทนคนอื่น
export async function POST(request: NextRequest) {
  const secret = process.env.LINE_SIGNUP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ระบบสมัครยังไม่พร้อม กรุณาลองใหม่ภายหลัง" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "ข้อมูลใบสมัครไม่ครบ" }, { status: 400 });
  }
  const parsed = cleanSignup(body as Record<string, unknown>);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;

  if (!sameSignature(signupSignature(d.uid, d.type, secret), d.sig)) {
    return NextResponse.json(
      { error: "ลิงก์ใบสมัครไม่ถูกต้อง กรุณากดปุ่มสมัครจากเมนูใน LINE บวรไทยอีกครั้ง" },
      { status: 403 }
    );
  }

  const group = signupGroup(d.type);
  const v = d.values;
  try {
    const db = supabaseAdmin();
    const { data: tambon } = await db
      .from("tambons")
      .select("id,name")
      .eq("id", d.tambon_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!tambon) return NextResponse.json({ error: "ไม่พบตำบลที่เลือก" }, { status: 400 });

    if (group === "jobseeker") {
      const { error } = await db.from("job_seekers").insert({
        line_user_id: d.uid,
        full_name: v.full_name,
        occupation: v.occupation,
        skills_experience: v.skills ?? null,
        phone: v.phone,
        area: v.area ?? null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true, jobseeker: true });
    }

    const isMerchant = group === "merchant";
    const role = isMerchant ? "merchant" : "driver";
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .upsert(
        {
          line_user_id: d.uid,
          tambon_id: d.tambon_id,
          role,
          full_name: isMerchant ? v.shop_name : v.full_name,
          phone: v.phone,
          promptpay_id: v.promptpay ?? null,
          approved: false,
          referrer_first_name: d.referrer_first_name,
          referrer_last_name: d.referrer_last_name,
        },
        { onConflict: "line_user_id" }
      )
      .select("id")
      .single();
    if (profileError || !profile) throw profileError ?? new Error("profile upsert returned no row");

    let text: string;
    if (isMerchant) {
      const { error } = await db.from("merchants").insert({
        profile_id: profile.id,
        tambon_id: d.tambon_id,
        name: v.shop_name,
        category: v.shop_category,
        address: v.shop_address,
      });
      if (error) throw error;
      text =
        `มีร้านค้าสมัครใหม่ (ฟอร์ม) รอตรวจสอบ\nพื้นที่: ${tambon.name}\nชื่อร้าน: ${v.shop_name}` +
        `\nประเภท: ${v.shop_category}\nที่อยู่: ${v.shop_address}\nผู้ติดต่อ: ${v.contact_name} โทร ${v.phone}`;
    } else {
      const vehicle = vehicleTypeOf(d.type, v);
      const { error } = await db.from("drivers").insert({
        profile_id: profile.id,
        vehicle_type: vehicle,
        plate_number: v.plate ?? "-",
      });
      if (error) throw error;
      text =
        `มีผู้ขับสมัครใหม่ (ฟอร์ม) รอตรวจสอบ\nพื้นที่: ${tambon.name}\nชื่อ: ${v.full_name} โทร ${v.phone}` +
        `\nประเภทรถ: ${VEHICLE_LABEL[vehicle] ?? vehicle}\nทะเบียนรถ: ${v.plate ?? "-"}`;
    }

    // แจ้งเตือนแอดมินเป็นเรื่องรอง — ถ้าส่งไม่ได้ ใบสมัครก็ยังบันทึกแล้ว (เหมือน onError ใน n8n)
    try {
      await notifyAdmins(db, d.tambon_id, [
        { type: "text", text },
        {
          type: "template",
          altText: "มีคำขออนุมัติใหม่ - กดเพื่ออนุมัติ/ไม่อนุมัติ",
          template: {
            type: "buttons",
            text: "ต้องการอนุมัติผู้สมัครนี้หรือไม่?",
            actions: [
              {
                type: "postback",
                label: "อนุมัติ",
                displayText: "อนุมัติ",
                data: `raksAction=approve_profile&raksProfileId=${profile.id}&raksRole=${role}`,
              },
              {
                type: "postback",
                label: "ไม่อนุมัติ",
                displayText: "ไม่อนุมัติ",
                data: `raksAction=reject_profile&raksProfileId=${profile.id}&raksRole=${role}`,
              },
            ],
          },
        },
      ]);
    } catch {
      // ไม่ทำให้การสมัครล้ม
    }

    return NextResponse.json({ ok: true, jobseeker: false });
  } catch {
    return NextResponse.json({ error: "บันทึกใบสมัครไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}

async function notifyAdmins(db: SupabaseClient, tambonId: string, messages: LineMessage[]) {
  const token = getLineConfig()?.accessToken;
  if (!token) return;
  const { data } = await db.rpc("line_signup_tambon_admins", { p_tambon_id: tambonId });
  const extra = (data as { to?: unknown } | null)?.to;
  const to = [...new Set([...CENTRAL_ADMIN_IDS, ...(Array.isArray(extra) ? extra : [])])] as string[];
  await multicastMessage(to, messages, token);
}
