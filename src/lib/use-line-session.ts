"use client";
import { useEffect, useState } from "react";
import { useLiff } from "@/components/LiffProvider";
import { signInWithLineIdToken } from "@/lib/line-login";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types";

/** Always exchange the verified LINE token; a leftover browser session may belong to somebody else. */
export function useLineSession() {
  const liff = useLiff();
  const token = liff.status === "ready" && liff.isLoggedIn ? liff.getIdToken() : null;
  const [state, setState] = useState<{ token: string | null; profile: Tables<"profiles"> | null; ready: boolean; error: string }>({ token: null, profile: null, ready: false, error: "" });
  useEffect(() => {
    if (!token) return;
    let live = true;
    (async () => {
      try {
        const signedIn = await signInWithLineIdToken(token);
        let profile = signedIn.profile;
        if (profile === undefined) {
          // ฟังก์ชันไม่ได้ส่งโปรไฟล์มา (รุ่นเก่า/อ่านพลาด) → อ่านเองเหมือนเดิม
          const db = createClient();
          // เพิ่งแลก session เองเมื่อครู่ อ่านจากเครื่องได้เลย (getUser ต้องถามเซิร์ฟเวอร์อีก 1 รอบ) · หน้าฝั่งเซิร์ฟเวอร์ตรวจสิทธิ์ซ้ำอยู่แล้ว
          const { data: { session }, error } = await db.auth.getSession();
          const user = session?.user;
          if (error || !user) throw new Error("เข้าสู่ระบบไม่สำเร็จ");
          const result = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
          if (result.error) throw new Error("โหลดข้อมูลบัญชีไม่ได้");
          profile = result.data;
        }
        if (live) setState({ token, profile, ready: true, error: "" });
      } catch (e) {
        if (live) setState({ token, profile: null, ready: false, error: e instanceof Error ? e.message : "เข้าสู่ระบบไม่สำเร็จ" });
      }
    })();
    return () => { live = false; };
  }, [token]);
  return { ...state, ready: state.ready && state.token === token, liff };
}
