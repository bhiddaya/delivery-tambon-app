# ตั้งค่าลับของ line-agent บน Render ด้วย PowerShell
# ค่าลับจะถูกพิมพ์ตอนรันเท่านั้น ไม่แสดงบนหน้าจอและไม่ถูกบันทึกในไฟล์
# วิธีรัน:  powershell -ExecutionPolicy Bypass -File .\scripts\set-render-env.ps1

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ServiceId = 'srv-dbof8lpsrm7s73bq51dg'   # line-agent บน Render
$SupabaseRef = 'kaeoxqiqonwjoqjoiiho'      # โปรเจกต์หลัก

function Read-Secret([string]$Label) {
  $secure = Read-Host -Prompt $Label -AsSecureString
  return [System.Net.NetworkCredential]::new('', $secure).Password
}

function Set-RenderEnv([string]$Key, [string]$Value, [hashtable]$Headers) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "ค่า $Key ว่าง ข้ามไป" }
  $body = @{ value = $Value } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Put -Uri "https://api.render.com/v1/services/$ServiceId/env-vars/$Key" `
    -Headers $Headers -Body $body -ContentType 'application/json' | Out-Null
  Write-Host "ตั้ง $Key แล้ว"
}

# 1) Render API key (Render > Account Settings > API Keys)
$renderKey = $env:RENDER_API_KEY
if (-not $renderKey) { $renderKey = Read-Secret 'RENDER_API_KEY' }
$renderHeaders = @{ Authorization = "Bearer $renderKey"; Accept = 'application/json' }

# 2) service_role ดึงจาก Supabase Management API (Supabase > Account > Access Tokens)
$sbToken = $env:SUPABASE_ACCESS_TOKEN
if (-not $sbToken) { $sbToken = Read-Secret 'SUPABASE_ACCESS_TOKEN' }
$keys = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$SupabaseRef/api-keys" `
  -Headers @{ Authorization = "Bearer $sbToken" }
$serviceRole = ($keys | Where-Object { $_.name -eq 'service_role' }).api_key
Set-RenderEnv 'SUPABASE_SERVICE_ROLE_KEY' $serviceRole $renderHeaders
$serviceRole = $null

# 3) ค่าที่คัดลอกจาก n8n (ใส่ตอนถูกถาม)
Set-RenderEnv 'LINE_CHANNEL_ACCESS_TOKEN' (Read-Secret 'LINE_CHANNEL_ACCESS_TOKEN (n8n > Credentials > LINE OA บวรไทย)') $renderHeaders
Set-RenderEnv 'OPENROUTER_API_KEY' (Read-Secret 'OPENROUTER_API_KEY (n8n > Credentials > openRouterApi)') $renderHeaders

# 4) GitHub token ที่สร้างใหม่ (fine-grained: Contents และ Pull requests เป็น Read and write)
Set-RenderEnv 'GITHUB_TOKEN' (Read-Secret 'GITHUB_TOKEN') $renderHeaders

Write-Host 'เสร็จแล้ว Render จะ deploy ใหม่อัตโนมัติ'
