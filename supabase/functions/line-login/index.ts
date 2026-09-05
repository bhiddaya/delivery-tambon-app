/**
 * line-login — แลก "LINE ID token" เป็น "session ของ Supabase"
 *
 * ทำไมต้องมีตัวนี้: Supabase ไม่มี LINE เป็น provider ในตัว เราจึงต้อง
 * ยืนยัน ID token ที่ LIFF ให้มาด้วยตัวเอง แล้วออก session ให้เอง
 *
 * ลำดับการทำงาน
 *   1. รับ { id_token } จากหน้าเว็บที่เปิดใน LIFF
 *   2. ส่งไปให้ LINE ตรวจที่ /oauth2/v2.1/verify พร้อม client_id ของเรา
 *      — วิธีนี้ LINE ตรวจลายเซ็น, วันหมดอายุ และ aud ให้ครบในคำขอเดียว
 *        เราจึงไม่ต้องดึง JWKS มา verify เองให้เสี่ยงพลาด
 *   3. หาบัญชีเดิมด้วย public.auth_user_id_for_line() ถ้าไม่มีก็สร้างใหม่
 *   4. คืน token_hash ของ magic link ให้เบราว์เซอร์เอาไป verifyOtp() ต่อ
 *      — ไม่มีการส่งอีเมลจริง generateLink แค่ "สร้าง" ไม่ได้ "ส่ง"
 *
 * ตั้งใจไม่ตรวจ JWT ของ Supabase (verify_jwt = false) เพราะตอนเรียกฟังก์ชันนี้
 * ผู้ใช้ยังไม่มี session — นั่นคือสิ่งที่กำลังจะขอ การยืนยันตัวตนของ endpoint นี้
 * คือ "ID token ต้องผ่านการตรวจของ LINE" ซึ่งปลอมไม่ได้
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

// Login channel "บวรไทย" — ไม่ใช่ความลับ (ฝังอยู่ในหน้าเว็บอยู่แล้ว)
// แต่เปิดให้ override ด้วย env เผื่อวันหน้าย้าย channel
const DEFAULT_LOGIN_CHANNEL_ID = "2011443365";

const ALIAS_DOMAIN = "line.invalid";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * หา secret key ที่ใช้เรียก Admin API ได้
 *
 * โปรเจกต์นี้ "ปิด legacy JWT keys" ไปแล้ว ตัวแปร SUPABASE_SERVICE_ROLE_KEY
 * ที่ Supabase ใส่ให้อัตโนมัติจึงอาจเป็น key ที่ตายแล้ว — ต้องลอง key แบบใหม่
 * (sb_secret_…) ก่อนเสมอ และเก็บไว้ว่าใช้ตัวไหน เพื่อบอกได้ตอน debug
 */
function resolveSecretKey(): { key: string | null; source: string } {
  const candidates: [string, string | undefined][] = [
    ["SUPABASE_SECRET_KEY", Deno.env.get("SUPABASE_SECRET_KEY")],
    ["SB_SECRET_KEY", Deno.env.get("SB_SECRET_KEY")],
    ["SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")],
  ];
  for (const [name, value] of candidates) {
    if (value) return { key: value, source: name };
  }
  return { key: null, source: "none" };
}

type LineVerifyPayload = {
  iss?: string;
  sub?: string;
  aud?: string;
  exp?: number;
  name?: string;
  picture?: string;
  error?: string;
  error_description?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const channelId = Deno.env.get("LINE_LOGIN_CHANNEL_ID") ?? DEFAULT_LOGIN_CHANNEL_ID;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const { key: secretKey, source: keySource } = resolveSecretKey();

  // GET = health check — บอกว่าตั้งค่าครบไหม โดยไม่เปิดเผยค่า key
  //
  // ?probe=1 จะยิง Admin API จริงหนึ่งครั้งเพื่อพิสูจน์ว่า key ที่หยิบมาใช้ได้จริง
  // จำเป็นเพราะโปรเจกต์นี้ปิด legacy JWT key ไปแล้ว ค่า SUPABASE_SERVICE_ROLE_KEY
  // ที่ Supabase ใส่ให้อัตโนมัติจึงอาจ "มีค่า" แต่ "ใช้ไม่ได้" — configured: true
  // เพียงอย่างเดียวจึงเชื่อไม่ได้ ต้องลองยิงดู
  if (req.method === "GET") {
    const url = new URL(req.url);
    const base = {
      ok: true,
      function: "line-login",
      channel_id: channelId,
      key_source: keySource,
      configured: Boolean(supabaseUrl && secretKey),
    };

    if (url.searchParams.get("probe") !== "1") return json(base);

    if (!supabaseUrl || !secretKey) {
      return json({ ...base, probe: "skipped", reason: "ยังไม่มี secret key" });
    }

    const probeClient = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // ค้นด้วยค่าที่ไม่มีทางมีจริง — ถ้า key ใช้ได้จะได้ null กลับมาโดยไม่ error
    // และไม่มีข้อมูลของใครหลุดออกไปแม้แต่แถวเดียว
    const { error: probeErr } = await probeClient.rpc("auth_user_id_for_line", {
      p_line_user_id: "__probe__",
      p_alias_email: "__probe__@line.invalid",
    });

    return json({
      ...base,
      probe: probeErr ? "failed" : "ok",
      probe_detail: probeErr?.message ?? null,
    });
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!supabaseUrl || !secretKey) {
    return json(
      { error: "not_configured", hint: "ยังไม่ได้ตั้ง secret key ของ Supabase ให้ Edge Function" },
      500,
    );
  }

  let idToken = "";
  let mode: "login" | "link" = "login";
  try {
    const body = await req.json();
    idToken = typeof body?.id_token === "string" ? body.id_token : "";
    if (body?.mode === "link") mode = "link";
  } catch {
    return json({ error: "bad_request", hint: "body ต้องเป็น JSON" }, 400);
  }
  if (!idToken) return json({ error: "missing_id_token" }, 400);

  // --- 1. ให้ LINE เป็นคนตรวจ token ---------------------------------------
  let payload: LineVerifyPayload;
  try {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });
    payload = await res.json();
    if (!res.ok) {
      return json(
        { error: "line_verify_failed", detail: payload?.error_description ?? payload?.error },
        401,
      );
    }
  } catch (err) {
    return json({ error: "line_unreachable", detail: String(err) }, 502);
  }

  // เช็คซ้ำเอง ถึง LINE จะเช็คให้แล้ว — ป้องกันกรณี LINE เปลี่ยนพฤติกรรมเงียบ ๆ
  if (payload.iss !== "https://access.line.me") {
    return json({ error: "bad_issuer" }, 401);
  }
  if (payload.aud !== channelId) {
    return json({ error: "bad_audience" }, 401);
  }
  const lineUserId = payload.sub;
  if (!lineUserId) return json({ error: "no_subject" }, 401);

  // --- 2. หา/สร้างบัญชี ----------------------------------------------------
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // โหมด "ผูกบัญชี" — ผู้ใช้ล็อกอินด้วยเบอร์/อีเมลอยู่แล้ว แล้วมาผูก LINE เพิ่ม
  // ต่างจากโหมดล็อกอินตรงที่ไม่สร้างบัญชีใหม่และไม่ออก session ใหม่
  // แค่เขียน line_user_id ลงโปรไฟล์เดิม เพื่อให้ส่งแจ้งเตือนเข้า LINE ได้
  // และครั้งต่อไปกดปุ่ม LINE จะเข้าบัญชีเดิมนี้
  if (mode === "link") {
    // ต้องพิสูจน์ว่าคนเรียกคือเจ้าของ session จริง ไม่ใช่ใครก็ได้ที่ส่ง id มา
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "missing_session", hint: "ต้องล็อกอินก่อนจึงจะผูกบัญชีได้" }, 401);

    const { data: caller, error: callerErr } = await admin.auth.getUser(jwt);
    if (callerErr || !caller?.user) {
      return json({ error: "invalid_session", hint: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, 401);
    }
    const callerId = caller.user.id;

    // บัญชี LINE หนึ่งอันผูกได้กับผู้ใช้คนเดียว — กันคนสวมรอยบัญชีคนอื่น
    const { data: taken } = await admin
      .from("profiles")
      .select("id")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    if (taken && taken.id !== callerId) {
      return json(
        { error: "line_already_linked", hint: "บัญชี LINE นี้ถูกผูกกับผู้ใช้อื่นอยู่แล้ว" },
        409,
      );
    }

    const { error: updErr } = await admin
      .from("profiles")
      .update({ line_user_id: lineUserId })
      .eq("id", callerId);
    if (updErr) return json({ error: "link_failed", detail: updErr.message }, 500);

    await admin.auth.admin.updateUserById(callerId, {
      user_metadata: {
        provider: "line",
        line_user_id: lineUserId,
        line_display_name: payload.name ?? null,
        line_picture: payload.picture ?? null,
      },
    });

    return json({
      ok: true,
      linked: true,
      display_name: payload.name ?? null,
      picture_url: payload.picture ?? null,
    });
  }

  const aliasEmail = `${lineUserId}@${ALIAS_DOMAIN}`;
  const lineMeta = {
    provider: "line",
    line_user_id: lineUserId,
    line_display_name: payload.name ?? null,
    line_picture: payload.picture ?? null,
  };

  const { data: foundId, error: lookupErr } = await admin.rpc("auth_user_id_for_line", {
    p_line_user_id: lineUserId,
    p_alias_email: aliasEmail,
  });
  if (lookupErr) return json({ error: "lookup_failed", detail: lookupErr.message }, 500);

  let userId: string | null = (foundId as string | null) ?? null;
  let isNew = false;

  if (userId) {
    // อัปเดตชื่อ/รูปให้ตรงกับ LINE ปัจจุบัน — ไม่ critical ถ้าพลาดก็ปล่อยผ่าน
    await admin.auth.admin.updateUserById(userId, { user_metadata: lineMeta });
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: aliasEmail,
      email_confirm: true, // อีเมลแฝงส่งจริงไม่ได้ ต้อง confirm ให้เองตั้งแต่แรก
      user_metadata: lineMeta,
    });
    if (createErr || !created?.user) {
      return json({ error: "create_user_failed", detail: createErr?.message }, 500);
    }
    userId = created.user.id;
    isNew = true;
  }

  // --- 3. ออก session ------------------------------------------------------
  // generateLink สร้างลิงก์อย่างเดียว ไม่ส่งอีเมล เราเอาแค่ token_hash
  // ให้เบราว์เซอร์ไป verifyOtp() แลกเป็น session จริง
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: aliasEmail,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    return json({ error: "generate_link_failed", detail: linkErr?.message }, 500);
  }

  // ผู้ใช้มีโปรไฟล์แล้วหรือยัง — หน้าเว็บจะได้รู้ว่าควรพาไป /onboarding ไหม
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, line_user_id")
    .eq("id", userId)
    .maybeSingle();

  // ผูก line_user_id ให้โปรไฟล์เดิมที่ยังไม่มี (เช่นคนที่สมัครด้วยเบอร์มาก่อน)
  if (profile && !profile.line_user_id) {
    await admin.from("profiles").update({ line_user_id: lineUserId }).eq("id", userId);
  }

  return json({
    ok: true,
    token_hash: link.properties.hashed_token,
    email: aliasEmail,
    is_new_user: isNew,
    has_profile: Boolean(profile),
    display_name: payload.name ?? null,
    picture_url: payload.picture ?? null,
  });
});
