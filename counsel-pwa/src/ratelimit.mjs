// จำกัดจำนวนการเชื่อมต่อต่อโทเค็นต่อวัน กันการใช้ค่า API เกินจำเป็น
// เก็บในหน่วยความจำ รีเซ็ตเมื่อเปลี่ยนวัน ถ้าเซิร์ฟเวอร์รีสตาร์ตค่าจะหายไป

export function createDailyLimiter(limit) {
  const counts = new Map();
  return {
    // คืน true ถ้ายังอนุญาต และนับหนึ่งครั้ง
    allow(token, now = new Date()) {
      const day = now.toISOString().slice(0, 10);
      const key = `${token}|${day}`;
      const used = counts.get(key) || 0;
      if (used >= limit) return false;
      counts.set(key, used + 1);
      return true;
    },
    usedToday(token, now = new Date()) {
      const day = now.toISOString().slice(0, 10);
      return counts.get(`${token}|${day}`) || 0;
    },
  };
}
