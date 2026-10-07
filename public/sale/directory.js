(() => {
  const form = document.getElementById('area-search-form');
  if (!form) return;
  const query = document.getElementById('area-query');
  const list = document.getElementById('area-list');
  const status = document.getElementById('area-status');
  const prev = document.getElementById('area-prev');
  const next = document.getElementById('area-next');
  const modal = document.getElementById('area-share');
  const shareStatus = document.getElementById('area-share-status');
  const qr = document.getElementById('area-qr');
  const download = document.getElementById('area-download');
  const link = document.getElementById('area-link');
  let page = 1, search = '', requestId = 0, shareId = 0, trigger;
  function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function webLink(slug) {
    return 'https://delivery-tambon-app-v3.vercel.app/t/' + encodeURIComponent(slug);
  }
  async function share(area, button) {
    trigger = button;
    const id = ++shareId;
    document.getElementById('area-share-title').textContent = 'แชร์ ' + area.name;
    link.value = webLink(area.slug);
    document.getElementById('area-open').href = link.value;
    qr.hidden = download.hidden = true;
    qr.removeAttribute('src');
    download.removeAttribute('href');
    shareStatus.textContent = 'กำลังสร้าง QR…';
    modal.showModal();
    try {
      const response = await fetch('/api/public/tambons?slug=' + encodeURIComponent(area.slug));
      if (!response.ok) throw new Error('QR unavailable');
      const data = await response.json();
      if (id !== shareId || !modal.open) return;
      qr.src = data.qr;
      qr.alt = 'QR เปิดหน้า ' + area.name;
      download.href = data.qr;
      download.download = 'bavornthai-web-' + area.slug + '.png';
      qr.hidden = download.hidden = false;
      shareStatus.textContent = 'แชร์ลิงก์หรือดาวน์โหลด QR ส่งให้เพื่อนได้เลย';
    } catch {
      if (id === shareId && modal.open) shareStatus.textContent = 'ยังสร้าง QR ไม่ได้ ใช้ลิงก์ตำบลด้านล่างได้ หรือปิดแล้วลองใหม่';
    }
  }
  async function load() {
    const id = ++requestId;
    status.textContent = 'กำลังโหลดตำบล…';
    list.replaceChildren();
    prev.hidden = next.hidden = true;
    const params = new URLSearchParams({ page: String(page), q: search });
    try {
      const response = await fetch('/api/public/tambons?' + params);
      if (!response.ok) throw new Error('Directory unavailable');
      const data = await response.json();
      if (id !== requestId) return;
      page = data.page;
      const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
      status.textContent = data.total
        ? data.total + ' ตำบล · หน้า ' + page + ' จาก ' + pages
        : 'ไม่พบตำบล ลองค้นหาด้วยชื่ออำเภอหรือจังหวัด';
      for (const area of data.areas) {
        const card = element('article', '', 'area-card');
        card.append(element('p', area.is_active ? 'เปิดตำบลแล้ว' : 'กำลังเตรียมเปิดบริการ', 'area-badge'));
        card.append(element('h3', area.name));
        card.append(element('p', [area.district, area.province].filter(Boolean).join(' · ')));
        const actions = element('div', '', 'actions');
        const open = element('a', 'ดูร้านและบริการ', 'button');
        open.href = webLink(area.slug);
        const button = element('button', 'แชร์ตำบล / QR', 'button outline');
        button.type = 'button';
        button.addEventListener('click', () => share(area, button));
        actions.append(open, button);
        card.append(actions);
        list.append(card);
      }
      prev.hidden = page <= 1;
      next.hidden = page >= pages;
    } catch {
      if (id !== requestId) return;
      status.textContent = 'ยังโหลดรายการตำบลไม่ได้';
      const retry = element('button', 'ลองใหม่', 'button outline');
      retry.type = 'button';
      retry.addEventListener('click', load);
      list.append(retry);
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault(); search = query.value.trim(); page = 1; load();
  });
  document.getElementById('area-clear').addEventListener('click', () => {
    query.value = search = ''; page = 1; load();
  });
  prev.addEventListener('click', () => { page--; load(); });
  next.addEventListener('click', () => { page++; load(); });
  document.getElementById('area-share-close').addEventListener('click', () => modal.close());
  modal.addEventListener('close', () => { shareId++; trigger?.focus(); });
  document.getElementById('area-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link.value);
      shareStatus.textContent = 'คัดลอกลิงก์แล้ว ส่งให้เพื่อนได้เลย';
    } catch {
      link.focus(); link.select();
      shareStatus.textContent = 'เลือกลิงก์ให้แล้ว กรุณาคัดลอกจากช่องนี้';
    }
  });
  load();
})();
