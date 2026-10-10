const j = $input.first().json;
const text = String(j.text || '');
const start = text.indexOf('[order:v1 ');
if (!j.userId || start < 0 || text.indexOf(']', start) < 0) return [];
return [{ json: { userId: String(j.userId), text: text, replyToken: j.replyToken || '', test: String(j.userId).indexOf('TEST') === 0 } }];
