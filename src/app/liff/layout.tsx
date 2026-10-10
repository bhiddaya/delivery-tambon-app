/**
 * เปลือกหน้าที่เปิดในแอป LINE ผ่าน LIFF: ไม่มีแถบหัวเว็บ เพราะ LINE มีแถบของตัวเองอยู่แล้ว
 * มือถือที่ตั้งตัวอักษรใหญ่ทำให้ชื่อยาว ๆ ดันหน้ากว้างเกินจอจนเลื่อนซ้ายขวาได้ จึงให้ตัดบรรทัดทุกข้อความ (break-words)
 * และไม่ให้เนื้อหาล้นข้างออกนอกจอ (overflow-x-clip) เป็นตัวกันเผื่อ
 */
export default function LiffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#fbfaf6] text-[#1c2333]">
      <main className="mx-auto max-w-6xl break-words px-4 py-4 sm:px-8">{children}</main>
    </div>
  );
}
