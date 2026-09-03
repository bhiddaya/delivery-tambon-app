/**
 * แสดงเมื่อ deployment ยังไม่ได้ตั้งค่าเชื่อมฐานข้อมูล
 *
 * ดีกว่าปล่อยให้ throw แล้วผู้ใช้เห็นแค่ "A server error occurred"
 * ซึ่งไม่บอกอะไรเลยว่าต้องแก้ตรงไหน
 */
export default function SetupRequired() {
  const vars = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#eeece6",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          background: "#fff",
          borderRadius: 16,
          padding: "32px 28px",
          boxShadow: "0 1px 3px rgba(0,0,0,.08)",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#2e3e68", margin: 0 }}>
          ยังตั้งค่าไม่เสร็จ
        </h1>

        <p style={{ marginTop: 12, lineHeight: 1.7, color: "#444" }}>
          เว็บขึ้นเรียบร้อยแล้ว แต่ยังเชื่อมกับฐานข้อมูลไม่ได้
          เพราะยังไม่ได้ใส่ค่าตั้งค่า (Environment Variables) ใน Vercel
        </p>

        <p style={{ marginTop: 20, marginBottom: 8, fontWeight: 600, color: "#2e3e68" }}>
          ต้องใส่ 2 ตัวนี้
        </p>

        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
          {vars.map((v) => (
            <li key={v}>
              <code
                style={{
                  background: "#f2f1ec",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 13,
                }}
              >
                {v}
              </code>
            </li>
          ))}
        </ul>

        <p style={{ marginTop: 20, lineHeight: 1.7, color: "#444" }}>
          ค่าทั้งสองอยู่ใน Supabase → Settings → API
          <br />
          ใส่ที่ Vercel → Settings → Environment Variables แล้วกด{" "}
          <strong>Redeploy</strong>
        </p>

        <p style={{ marginTop: 20, fontSize: 13, color: "#8a8a8a" }}>
          หน้านี้จะหายไปเองเมื่อตั้งค่าครบ
        </p>
      </div>
    </main>
  );
}
