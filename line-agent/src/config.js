// อ่านค่าตั้งจาก environment ไม่มีค่าลับในโค้ด
// บริการนี้ไม่ถือ LINE token, Supabase key หรือ OpenRouter key เอง
// ทุกการเรียกภายนอก (LINE, Supabase, OpenRouter) ผ่าน webhook ของ n8n ที่ใช้ credential เดิม
export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 10000),
    bridgeSecret: env.BRIDGE_SECRET || '',
    n8nUrl: (env.N8N_BRIDGE_URL || 'https://srv2091778.hstgr.cloud').replace(/\/$/, ''),
    githubToken: env.GITHUB_TOKEN || '',
    githubRepo: env.GITHUB_REPO || 'bhiddaya/delivery-tambon-app',
    baseBranch: env.BASE_BRANCH || 'main',
    repoDir: env.REPO_DIR || '/tmp/line-agent/repo',
    model: env.OPENROUTER_MODEL || 'anthropic/claude-haiku-5.5',
    dailyLimit: Number(env.DAILY_TASK_LIMIT || 20),
    maxSteps: Number(env.MAX_AGENT_STEPS || 12),
    // ระยะที่ 1: เฉพาะ superadmin และ admin (tambon_agent ยังไม่เปิด)
    allowedLevels: ['superadmin', 'admin'],
  };
}

export function missingSecrets(cfg) {
  const need = [
    ['BRIDGE_SECRET', cfg.bridgeSecret],
    ['GITHUB_TOKEN', cfg.githubToken],
  ];
  return need.filter(([, v]) => !v).map(([k]) => k);
}
