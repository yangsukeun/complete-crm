import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트 싱글톤 (요청마다 new 하지 않음).
 * 서비스 롤이 있으면 우선 사용, 없으면 anon 키.
 * Realtime·브라우저용은 `realtime-client.ts`의 별도 싱글톤을 사용합니다.
 */
let supabaseServerInstance: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const key = service || anon;
  if (!url || !key) return null;

  if (!supabaseServerInstance) {
    supabaseServerInstance = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseServerInstance;
}

/** Route에서 `import { createClient } from '@/lib/supabase/server'` 호환용. 세션은 NextAuth 기준이면 `auth.getUser()`만으로는 로그인 사용자가 안 잡힐 수 있습니다. */
export async function createClient(): Promise<SupabaseClient> {
  const c = getSupabaseServer();
  if (!c) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY(또는 ANON)가 필요합니다.");
  }
  return c;
}
