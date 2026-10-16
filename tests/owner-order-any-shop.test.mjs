// Static check of the migration that lets the owner (superadmin) order from any shop through LINE.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base = fileURLToPath(new URL('../', import.meta.url));
const sql = fs.readFileSync(path.join(base, 'supabase/migrations/20261016b_owner_order_any_shop.sql'), 'utf8');
assert.match(sql, /old_cond constant text := \$o\$v_role is distinct from 'customer' and v_ptambon is distinct from v_shop\.tambon_id then\$o\$;/);
assert.match(sql, /new_cond constant text := \$n\$v_role not in \('customer', 'superadmin'\) and v_ptambon is distinct from v_shop\.tambon_id then\$n\$;/);
assert.match(sql, /if position\(old_cond in d\) = 0 then\s+raise exception/, 'stops without changing anything when the old rule is not found');
assert.ok(!/superadmin.*merchant|merchant.*superadmin/.test(sql.replace(/--.*\n/g, '')), 'merchants and riders stay fixed to their own tambon');
console.log('PASS owner order any shop: only superadmin is exempt, patch aborts if the old rule is missing');
