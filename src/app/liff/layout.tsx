/** เปลือกหน้าที่เปิดในแอป LINE ผ่าน LIFF: ไม่มีแถบหัวเว็บ เพราะ LINE มีแถบของตัวเองอยู่แล้ว */
export default function LiffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fbfaf6] text-[#1c2333]">
      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-8">{children}</main>
    </div>
  );
}
