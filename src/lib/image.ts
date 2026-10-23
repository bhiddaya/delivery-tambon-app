/**
 * ย่อรูปในเบราว์เซอร์ก่อนอัปโหลด
 *
 * ทำไมต้องย่อ: รูปจากกล้องมือถือทุกวันนี้ใหญ่ 3–8 MB ส่วนเน็ตในตำบลช้า
 * ถ้าอัปไฟล์เต็ม ๆ ร้านจะกดแล้วรอเป็นนาทีจนคิดว่าแอปค้าง แล้วกดซ้ำ
 * รูปเมนูขนาด 1200px กว้างพอสำหรับหน้าจอมือถือทุกรุ่นอยู่แล้ว
 *
 * ย่อฝั่งเบราว์เซอร์ยังช่วยให้ไฟล์ไม่ชนเพดาน 5 MB ของ bucket ด้วย
 * แต่เพดานนั้นยังต้องมีอยู่ เพราะการย่อฝั่งนี้เลี่ยงได้ถ้าใครยิง API ตรง
 */

const MAX_EDGE = 1200;
const QUALITY = 0.82;

export type ResizeResult = { blob: Blob; ext: "jpg" };

/** รูปจากกล้อง Samsung/iPhone บางรุ่นเป็น HEIC ซึ่ง Chrome บน Android เปิดเองไม่ได้ (ชนิดไฟล์อาจว่าง จึงดูนามสกุลด้วย) */
export function isHeic(file: File): boolean {
  return /^image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export async function resizeImage(file: File): Promise<ResizeResult> {
  // แปลง HEIC เป็น JPEG ก่อน โหลดตัวแปลง (ใหญ่) เฉพาะตอนเจอไฟล์ HEIC
  let source: Blob = file;
  if (isHeic(file)) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    source = Array.isArray(converted) ? converted[0] : converted;
  }
  const bitmap = await createImageBitmap(source);

  // ย่อตามด้านที่ยาวกว่า เพื่อรักษาสัดส่วนเดิมไว้
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้");
  }

  // เติมพื้นขาวก่อน เพราะ PNG ที่มีพื้นโปร่งใสจะกลายเป็นดำเมื่อแปลงเป็น JPEG
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  if (!blob) throw new Error("แปลงรูปไม่สำเร็จ");

  return { blob, ext: "jpg" };
}
