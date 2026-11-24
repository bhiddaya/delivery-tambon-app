#!/bin/sh
# จัดการรหัสรายคนบน VPS (มีผลทันที ไม่ต้อง restart)
#   sh deploy/codes.sh add "ชื่อ"   สร้างรหัสใหม่ให้คนนี้ พิมพ์รหัสออกมา
#   sh deploy/codes.sh del "ชื่อ"   ลบรหัสของคนนี้ (คนนี้เข้าใหม่ไม่ได้)
#   sh deploy/codes.sh list          รายชื่อคนที่มีรหัส (ไม่แสดงรหัส)
set -eu
cd "$(dirname "$0")/.."
F=access/codes.json
mkdir -p access
[ -f "$F" ] || echo '{}' > "$F"
case "${1:-}" in
  add)
    CODE=$(head -c 9 /dev/urandom | base64 | tr '+/' 'xy')
    jq --arg c "$CODE" --arg n "$2" '. + {($c): $n}' "$F" > "$F.tmp" && mv "$F.tmp" "$F"
    echo "$CODE" ;;
  del)
    jq --arg n "$2" 'with_entries(select(.value != $n))' "$F" > "$F.tmp" && mv "$F.tmp" "$F" ;;
  list)
    jq -r '.[]' "$F" ;;
  *) echo "usage: add|del|list" >&2; exit 1 ;;
esac
chown 1000:1000 "$F" && chmod 600 "$F" # คอนเทนเนอร์รันเป็นผู้ใช้ node (uid 1000)
