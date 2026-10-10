import Link from "next/link";
import { ArrowRight, Bike, ChevronLeft, ChevronRight, MapPin, Search, ShoppingBag, Store, Utensils, Users, Newspaper, Navigation } from "lucide-react";
import InstallPwa from "@/components/InstallPwa";
import { directoryLink, DIRECTORY_PAGE_SIZE, type DeliveryArea, type PublicDeliveryShop } from "@/lib/delivery-directory";
import { tambonDisplayName } from "@/lib/tambon-choice";
import { ROLE_LABEL } from "@/lib/domain";

type Props = { areas: DeliveryArea[]; total: number; query: string; page: number; unavailable: boolean; shops?: PublicDeliveryShop[]; shopsUnavailable?: boolean };
const action = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-head font-semibold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c97418]";

export default function DeliveryLanding({ areas, total, query, page, unavailable, shops = [], shopsUnavailable = false }: Props) {
  const pages = Math.ceil(total / DIRECTORY_PAGE_SIZE);
  return (
    <div className="min-h-screen bg-[#fbfaf6] text-[#1c2333]">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white p-3 focus:not-sr-only focus:absolute focus:left-4 focus:top-4">ข้ามไปเนื้อหา</a>
      <header className="border-b border-[#e7e9e1] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/delivery" aria-label="บวรไทย Delivery หน้าหลัก" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2e3e68] text-white"><ShoppingBag size={24} aria-hidden="true" /></span>
            <span><span className="block font-display text-xl text-[#2e3e68]">บวรไทย</span><span className="text-[11px] tracking-widest text-[#5b6478]">DELIVERY • ชุมชนของเรา</span></span>
          </Link>
          <nav aria-label="เมนูหลัก" className="flex items-center gap-5 text-sm font-semibold">
            <a href="#areas" className="hidden hover:text-[#c97418] sm:block">พื้นที่บริการ</a>
            <a href="#how" className="hidden hover:text-[#c97418] md:block">วิธีใช้งาน</a>
            <Link href="/app" className="rounded-xl bg-[#2e3e68] px-4 py-2.5 text-white hover:bg-[#1b2547]">เปิดแอป</Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-12 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-14 lg:pb-20">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#e0ede6] px-4 py-2 text-xs font-semibold text-[#2e6b4c]"><MapPin size={14} aria-hidden="true" />บริการใกล้บ้าน โดยคนในชุมชน</p>
            <h1 className="text-[2.6rem] font-semibold leading-[1.2] tracking-tight sm:text-6xl">ใกล้บ้าน<br /><span className="text-[#2e3e68]">ส่งถึงมือ</span><span className="text-[#c97418]">.</span></h1>
            <p className="mt-6 max-w-md text-base leading-8 text-[#5b6478]">อาหารจานโปรด ของใช้จำเป็น และเรื่องราวในชุมชน เริ่มจากเลือกตำบลของคุณ แล้วเชื่อมกับร้านค้า ไรเดอร์ และตัวแทนใกล้บ้าน</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#areas" className={`${action} bg-[#2e3e68] text-white`}>ค้นหาตำบลของฉัน<ArrowRight size={18} aria-hidden="true" /></a>
              <Link href="/signup" className={`${action} border border-[#dbdfd5] bg-white text-[#2e3e68]`}>สมัครสมาชิก</Link>
            </div>
            <p className="mt-5 text-xs leading-6 text-[#5b6478]">ดูข้อมูลตำบลได้ทันที • เข้าสู่ระบบเพื่อจัดรายการ • ยืนยันบริการผ่าน LINE</p>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] bg-[#2e3e68] p-6 text-white sm:p-8" aria-label="เชื่อมร้านค้า ไรเดอร์ และคนในตำบล">
            <div className="absolute -right-12 -top-12 h-60 w-60 rounded-full border-[35px] border-white/5" aria-hidden="true" />
            <div className="relative flex items-center justify-between text-sm"><span className="font-semibold text-white/80">จากร้านใกล้บ้าน</span><span className="rounded-full bg-white/10 px-3 py-1.5 text-xs">ถึงคนในตำบล</span></div>
            <div className="relative my-7 rounded-3xl bg-[#f8edd9] p-6 text-[#2e3e68]">
              <div className="flex items-center gap-5"><span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#c97418] text-white"><Utensils size={36} aria-hidden="true" /></span>
                <div><p className="text-xs font-semibold uppercase tracking-widest text-[#a3611b]">LOCAL IS LOVELY</p><p className="mt-2 text-xl font-semibold sm:text-2xl">ของดีใกล้ตัว<br />ไม่ต้องไปไกล</p></div></div>
              <div className="mt-5 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white px-3 py-2">อาหารและของแห้ง</span><span className="rounded-full bg-white px-3 py-2">ของใช้ในชุมชน</span></div>
            </div>
            <div className="relative grid grid-cols-3 items-center gap-2 text-center">
              <div><Store size={25} className="mx-auto mb-2 text-[#f2c078]" aria-hidden="true" /><span className="text-xs">ร้านค้า</span></div>
              <div><Bike size={30} className="mx-auto mb-2 text-[#b5d8c2]" aria-hidden="true" /><span className="text-xs">{ROLE_LABEL.driver}</span></div>
              <div><Users size={25} className="mx-auto mb-2 text-[#f2c078]" aria-hidden="true" /><span className="text-xs">คนในชุมชน</span></div>
            </div>
            <p className="relative mt-6 border-t border-white/15 pt-4 text-center text-xs leading-6 text-white/70">ความพร้อมของร้านค้าและผู้ส่งขึ้นอยู่กับแต่ละตำบล</p>
          </div>
        </section>

        <section id="areas" className="scroll-mt-6 border-y border-[#e7e9e1] bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-semibold tracking-widest text-[#c97418]">เริ่มต้นจากพื้นที่ของคุณ</p><h2 className="text-3xl font-semibold">ตำบลไหน ใกล้คุณ?</h2><p className="mt-3 text-sm leading-7 text-[#5b6478]">ค้นหาชื่อตำบล อำเภอ หรือจังหวัด เพื่อดูร้านค้า ข่าว และช่องทางติดต่อของพื้นที่</p></div>
              <Link href="/apply-tambon" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#2e3e68]">อยากเปิดพื้นที่ใหม่<ArrowRight size={16} aria-hidden="true" /></Link></div>
            <form method="get" action="/delivery#areas" className="mt-7 flex flex-wrap gap-3">
              <div className="relative min-w-0 flex-1 basis-64"><Search size={19} className="pointer-events-none absolute left-4 top-4 text-[#5b6478]" aria-hidden="true" /><label htmlFor="area-search" className="sr-only">ค้นหาตำบล อำเภอ หรือจังหวัด</label>
                <input id="area-search" name="q" type="search" defaultValue={query} maxLength={80} placeholder="เช่น บุ่งไหม หรือ กรุงเทพมหานคร" className="h-12 w-full rounded-xl border border-[#dbdfd5] bg-[#fbfaf6] pl-12 pr-4 outline-none focus:border-[#2e3e68] focus:ring-2 focus:ring-[#e4e7f0]" /></div>
              <button type="submit" className={`${action} bg-[#2e3e68] text-white`}>ค้นหา</button>
              {query && <Link href="/delivery#areas" className={`${action} border border-[#dbdfd5] text-[#5b6478]`}>ล้างการค้นหา</Link>}
            </form>
            {unavailable ? <div role="status" className="mt-6 rounded-2xl border border-[#f0d9b7] bg-[#fbebd6] p-5 text-sm leading-7 text-[#75450f]">ยังโหลดพื้นที่บริการไม่ได้ กรุณาลองใหม่อีกครั้ง คุณยังอ่านวิธีใช้งานและไปเข้าสู่ระบบได้</div> : <>
              <p className="mt-5 text-sm text-[#5b6478]" role="status">{query ? `ผลค้นหา “${query}”` : "พื้นที่ในระบบ"} · {total.toLocaleString("th-TH")} ตำบล{total > 0 && ` · หน้า ${page.toLocaleString("th-TH")}/${pages.toLocaleString("th-TH")}`}</p>
              {areas.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{areas.map((area) => <Link key={area.id} href={`/t/${encodeURIComponent(area.slug ?? "")}`} className="group rounded-2xl border border-[#dbdfd5] bg-[#fbfaf6] p-5 transition hover:-translate-y-0.5 hover:border-[#2e3e68] hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#2e3e68]">
                <div className="flex items-center justify-between gap-2"><span className="rounded-xl bg-white p-2.5 text-[#2e3e68]"><MapPin size={22} aria-hidden="true" /></span><span className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${area.is_active ? "bg-[#e0ede6] text-[#2e6b4c]" : "bg-[#fbebd6] text-[#925716]"}`}>{area.is_active ? "เปิดตำบลแล้ว" : "กำลังเตรียมพื้นที่"}</span></div>
                <h3 className="mt-4 text-lg font-semibold">{tambonDisplayName(area.name)}</h3><p className="mt-1 text-sm text-[#5b6478]">{[area.district, area.province].filter(Boolean).join(" · ") || "ดูรายละเอียดพื้นที่"}</p>
                <span className="mt-5 flex items-center justify-between border-t border-[#e7e9e1] pt-4 text-sm font-semibold text-[#2e3e68]">เปิดหน้าชุมชน<ArrowRight size={17} aria-hidden="true" /></span>
              </Link>)}</div> : <div className="mt-5 rounded-2xl bg-[#eff1ec] p-8 text-center"><MapPin size={26} className="mx-auto text-[#5b6478]" aria-hidden="true" /><h3 className="mt-3 font-semibold">{page > 1 ? "ไม่มีรายการในหน้านี้" : "ยังไม่พบพื้นที่ที่ค้นหา"}</h3><p className="mt-2 text-sm text-[#5b6478]">ลองค้นด้วยชื่อจังหวัด หรือส่งใบขอเปิดตำบลใหม่</p><Link href={directoryLink(query)} className="mt-4 inline-block text-sm font-semibold text-[#2e3e68]">กลับไปหน้าแรกของผลค้นหา</Link></div>}
              {pages > 1 && <nav aria-label="หน้ารายการตำบล" className="mt-6 flex justify-center gap-3">{page > 1 && <Link href={directoryLink(query, page - 1)} className={`${action} border border-[#dbdfd5]`}><ChevronLeft size={18} aria-hidden="true" />ก่อนหน้า</Link>}{page < pages && <Link href={directoryLink(query, page + 1)} className={`${action} border border-[#dbdfd5]`}>ถัดไป<ChevronRight size={18} aria-hidden="true" /></Link>}</nav>}
            </>}
            <p className="mt-6 text-xs leading-6 text-[#5b6478]">“เปิดตำบลแล้ว” หมายถึงพื้นที่เปิดในระบบ โปรดตรวจร้านที่เปิดและผู้ส่งกับตัวแทนก่อนสั่งจริง</p>
          </div>
        </section>

        <section id="shops" className="mx-auto max-w-6xl px-5 pt-12 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-semibold tracking-widest text-[#c97418]">ร้านจริง ในชุมชนของเรา</p><h2 className="text-3xl font-semibold">ร้านที่เปิดในพื้นที่ข้างต้น</h2><p className="mt-3 text-sm leading-7 text-[#5b6478]">แสดงสูงสุด 12 ร้าน · กดเข้าร้านเพื่อดูเมนู รูป และราคา เลือกรายการแล้วยืนยันผ่าน LINE</p></div><Link href="/customer" className={`${action} border border-[#dbdfd5] bg-white text-[#2e3e68]`}>เข้าหน้าร้าน<ArrowRight size={17} aria-hidden="true" /></Link></div>
          {shopsUnavailable ? <p role="status" className="mt-5 rounded-xl bg-[#fbebd6] p-5 text-sm">ยังโหลดข้อมูลร้านไม่ได้ โปรดลองอีกครั้ง</p> : shops.length ? <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shops.map(shop => { const area = areas.find(t => t.id === shop.tambon_id); return <article key={shop.id} className="rounded-2xl border border-[#dbdfd5] bg-white p-6"><div className="flex items-center justify-between gap-3"><span className="rounded-xl bg-[#e4e7f0] p-3 text-[#2e3e68]"><Store size={25} aria-hidden="true" /></span><span className="rounded-full bg-[#e0ede6] px-3 py-1.5 text-xs text-[#2e6b4c]">ร้านเปิดขาย</span></div><h3 className="mt-4 text-lg font-semibold">{shop.name}</h3><p className="mt-2 text-sm leading-7 text-[#5b6478]">{shop.category || "ร้านค้าในชุมชน"}</p><p className="mt-3 text-xs text-[#5b6478]">{area ? tambonDisplayName(area.name) : ""}{area && !area.is_active ? " · พื้นที่ยังเตรียมเปิดบริการ" : ""}</p><Link href={`/shop/${encodeURIComponent(shop.id)}`} className="mt-4 flex min-h-11 items-center justify-between border-t border-[#dbdfd5] pt-4 text-sm font-semibold text-[#2e3e68]">ดูเมนูและสั่ง<ArrowRight size={17} aria-hidden="true" /></Link>{area?.slug && <Link href={`/t/${encodeURIComponent(area.slug)}`} className="mt-1 block text-xs text-[#5b6478] underline">ข้อมูลและช่องทางของตำบล</Link>}</article>; })}</div> : <p className="mt-5 rounded-2xl bg-[#eff1ec] p-6 text-sm text-[#5b6478]">ยังไม่มีร้านเปิดขายในพื้นที่ที่แสดง ลองค้นหาตำบลอื่นหรือติดต่อช่องทางตัวแทน</p>}
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-6 px-5 py-12 sm:px-8 sm:py-16">
          <div className="max-w-xl"><p className="mb-2 text-xs font-semibold tracking-widest text-[#c97418]">ไม่กี่ขั้นตอน ก็ใกล้กัน</p><h2 className="text-3xl font-semibold">เริ่มใช้งานบวรไทย</h2></div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">{[
            { icon: MapPin, title: "เลือกตำบลของคุณ", body: "เปิดหน้าชุมชนเพื่อดูร้านค้า ข่าว ประกาศ และตัวแทนของพื้นที่" },
              { icon: ShoppingBag, title: "เลือกร้าน แล้วสั่ง", body: "เข้าสู่ระบบเพื่อจัดรายการสินค้า ตรวจยอด แล้วเปิด LINE เพื่อยืนยันค่าส่งและบริการกับตัวแทน" },
            { icon: Navigation, title: "ติดตามการจัดส่ง", body: "แจ้งตำแหน่งตามขั้นตอนของระบบ แล้วติดตามสถานะออเดอร์ ค่าส่งและวิธีชำระยึดตามตำบล" },
          ].map((step, i) => <article key={step.title} className="rounded-2xl border border-[#dbdfd5] bg-white p-6"><div className="flex items-center justify-between"><step.icon size={25} className="text-[#2e3e68]" aria-hidden="true" /><span className="font-head text-3xl text-[#dbdfd5]">0{i + 1}</span></div><h3 className="mt-5 text-lg font-semibold">{step.title}</h3><p className="mt-3 text-sm leading-7 text-[#5b6478]">{step.body}</p></article>)}</div>
          <div className="mt-8"><InstallPwa /></div>
        </section>

        <section className="bg-[#e7ece4] py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-5 sm:px-8"><h2 className="text-3xl font-semibold">ชุมชนเข้มแข็ง เริ่มจากเรา</h2><p className="mt-3 text-sm leading-7 text-[#5b6478]">เป็นลูกค้า เปิดร้าน หรือรับงานส่ง เลือกบทบาทหลังสมัคร และทำตามขั้นตอนของตัวแทนตำบล</p>
            <div className="mt-7 grid gap-4 md:grid-cols-3">{[
              { icon: Store, title: "มีร้านอยู่แล้ว?", body: "นำร้านและเมนูของคุณมาให้คนในตำบลรู้จัก สมัครบัญชีแล้วเลือกบทบาทร้านค้า", cta: "สมัครร้านค้า", href: "/signup" },
              { icon: Bike, title: `อยากเป็น${ROLE_LABEL.driver}?`, body: "สมัครบัญชีและเลือกบทบาทไรเดอร์ รอตัวแทนอนุมัติก่อนเริ่มรับงานจริง", cta: `สมัคร${ROLE_LABEL.driver}`, href: "/signup" },
              { icon: Users, title: "อยากดูแลพื้นที่ของคุณ?", body: "ส่งใบขอเปิดตำบลใหม่ เพื่อให้ทีมตรวจความพร้อมและประสานตัวแทนของพื้นที่", cta: "ขอเปิดตำบลใหม่", href: "/apply-tambon" },
            ].map((role) => <article key={role.title} className="flex flex-col rounded-2xl bg-white p-6"><role.icon size={27} className="text-[#2e3e68]" aria-hidden="true" /><h3 className="mt-4 text-lg font-semibold">{role.title}</h3><p className="mb-6 mt-3 flex-1 text-sm leading-7 text-[#5b6478]">{role.body}</p><Link href={role.href} className="flex min-h-11 items-center justify-between font-semibold text-[#2e3e68]">{role.cta}<ArrowRight size={17} aria-hidden="true" /></Link></article>)}</div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:px-8 sm:py-16 md:grid-cols-[1fr_1.5fr]">
          <div><Newspaper size={27} className="mb-4 text-[#c97418]" aria-hidden="true" /><h2 className="text-3xl font-semibold">ก่อนเริ่มใช้งาน</h2><p className="mt-3 text-sm leading-7 text-[#5b6478]">รายละเอียดที่ช่วยให้สั่งง่าย<br className="hidden md:block" /> และเข้าใจตรงกัน</p></div>
          <div className="space-y-3">{[
            ["ค่าส่งเท่าไร และจ่ายอย่างไร?", "ดูข้อมูลในหน้าตำบลและยอดที่ระบบแสดงก่อนยืนยันออเดอร์ ค่าส่ง วิธีชำระ และบัญชีรับเงินอาจต่างกันตามพื้นที่ อย่าโอนตามข้อมูลที่ยังไม่ได้ยืนยันกับตัวแทน"],
            ["ไม่มีร้านหรือผู้ส่งออนไลน์ ทำอย่างไร?", "ติดต่อช่องทางตัวแทนที่แสดงในหน้าตำบลเพื่อตรวจความพร้อม การมีหน้าตำบลไม่ได้หมายความว่ามีร้านและไรเดอร์ออนไลน์ตลอดเวลา"],
            ["ใช้งานได้เมื่อไม่มีอินเทอร์เน็ตไหม?", "PWA แสดงหน้าแจ้งออฟไลน์ได้เมื่อเคยเปิดออนไลน์แล้ว การค้นหาข้อมูลล่าสุด สั่งสินค้า และติดตามงานต้องเชื่อมต่ออินเทอร์เน็ต"],
            ["หน้าชุมชนมีข้อมูลอะไรอีก?", "นอกจากร้านค้า ยังมีข่าว ประกาศ งานในพื้นที่ และเสียงจากตำบลตามข้อมูลที่แต่ละพื้นที่เปิดใช้ ดูแหล่งที่มาของรายการ AI และวันที่อัปเดตก่อนนำไปใช้"],
          ].map(([title, body]) => <details key={title} className="rounded-2xl border border-[#dbdfd5] bg-white p-5"><summary className="cursor-pointer font-head font-semibold leading-7">{title}</summary><p className="mt-3 text-sm leading-7 text-[#5b6478]">{body}</p></details>)}</div>
        </section>
      </main>
      <footer className="border-t border-[#dbdfd5] bg-white py-7"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 sm:px-8"><p className="font-semibold text-[#2e3e68]">บวรไทย <span className="ml-2 text-sm font-normal text-[#5b6478]">ใกล้บ้าน ส่งถึงมือ</span></p><div className="flex flex-wrap gap-5 text-sm text-[#5b6478]"><a href="#areas">ค้นหาพื้นที่</a><Link href="/apply-tambon">เปิดตำบลใหม่</Link><Link href="/login">บัญชีของฉัน</Link></div></div></footer>
    </div>
  );
}
