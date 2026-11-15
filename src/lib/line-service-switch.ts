import { signInWithLineIdToken } from "@/lib/line-login";
import { createClient } from "@/lib/supabase/client";

type LineTokenSource = { getIDToken(): string | null; isInClient(): boolean };

export function lineServiceForPath(pathname: string): "food" | "web" {
  return /^\/(?:liff|llp)(?:\/?$|\/(?:shop|cart|checkout|register)(?:\/|$))/.test(pathname) ? "food" : "web";
}

export async function switchLineServiceOnOpen(sdk: LineTokenSource): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  if (!sdk.isInClient() && !/^\/(?:liff|llp)(?:\/|$)/.test(window.location.pathname)) return;
  const idToken = sdk.getIDToken();
  if (!idToken) return;
  await signInWithLineIdToken(idToken);
  const { error } = await createClient().rpc("bavorn_switch_my_line_service", {
    p_target: lineServiceForPath(window.location.pathname),
  });
  if (error) throw new Error("line_service_switch_failed");
}
