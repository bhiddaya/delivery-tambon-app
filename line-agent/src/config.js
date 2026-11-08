// อ่านค่าตั้งจาก environment ไม่มีค่าลับในโค้ด
export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 10000),
    bridgeSecret: env.BRIDGE_SECRET || '',
    lineToken: env.LINE_CHANNEL_ACCESS_TOKEN || '',
    supabaseUrl: (env.SUPABASE_URL || 'https://kaeoxqiqonwjoqjoiiho.supabase.co').replace(/\/$/, ''),
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    openrouterKey: env.OPENROUTER_API_KEY || '',
    model: env.OPENROUTER_MODEL || 'anthropic/claude-opus-5.5',
    githubToken: env.GITHUB_TOKEN || '',
    githubRepo: env.GITHUB_REPO || 'bhiddaya/delivery-tambon-app',
    baseBranch: env.BASE_BRANCH || 'main',
    repoDir: env.REPO_DIR || '/tmp/line-agent/repo',
    dailyLimit: Number(env.DAILY_TASK_LIMIT || 20),
    maxSteps: Number(env.MAX_AGENT_STEPS || 12),
    // ระยะที่ 1: เฉพาะ superadmin และ admin (tambon_agent ยังไม่เปิด)
    allowedLevels: ['superadmin', 'admin'],
  };
}

export function missingSecrets(cfg) {
  const need = [
    ['BRIDGE_SECRET', cfg.bridgeSecret],
    ['LINE_CHANNEL_ACCESS_TOKEN', cfg.lineToken],
    ['SUPABASE_SERVICE_ROLE_KEY', cfg.supabaseKey],
    ['OPENROUTER_API_KEY', cfg.openrouterKey],
    ['GITHUB_TOKEN', cfg.githubToken],
  ];
  return need.filter(([, v]) => !v).map(([k]) => k);
}
