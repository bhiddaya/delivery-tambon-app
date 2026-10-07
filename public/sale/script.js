const dialog=document.getElementById('join-dialog');
const message=document.getElementById('join-message');
const status=document.getElementById('copy-status');
let trigger;
document.querySelectorAll('[data-role]').forEach(button=>button.addEventListener('click',()=>{
trigger=button;
const role=button.dataset.role;
document.getElementById('dialog-title').textContent=`สนใจร่วมเป็น${role}`;
const detail=role==='ร้านค้า'?'ชื่อร้าน: …\nประเภทสินค้า: …':role==='ไรเดอร์'?'พื้นที่ที่สะดวกให้บริการ: …':'พื้นที่ที่ต้องการประสานงาน: …';
message.value=`สวัสดีครับ/ค่ะ สนใจร่วมเป็น${role}กับบวรไทย\nชื่อ: …\nตำบล / อำเภอ / จังหวัด: …\n${detail}\nขอสอบถามเงื่อนไขและขั้นตอนการเข้าร่วมครับ/ค่ะ`;
status.textContent='ข้อความนี้ยังไม่ได้ส่ง และยังไม่ถือว่าเป็นการสมัคร';dialog.showModal();
}));
document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>trigger?.focus());
document.getElementById('copy-message').addEventListener('click',async()=>{
try{await navigator.clipboard.writeText(message.value);status.textContent='คัดลอกแล้ว เปิดเว็บบวรไทยเพื่อใช้ช่องทาง LINE และส่งข้อความด้วยตัวคุณเอง';}
catch{message.focus();message.select();status.textContent='เลือกข้อความให้แล้ว กรุณาคัดลอกจากช่องนี้ แล้วส่งด้วยตัวคุณเอง';}
});
