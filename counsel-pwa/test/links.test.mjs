import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createLinkReader, fileParts, pageText } from "../src/links.mjs";

test("pageText: meta ก่อน แล้วข้อความในหน้า ตัดสคริปต์และเมนู", () => {
  const html = `<html><head><title>ข่าว &amp; บทความ</title>
    <meta content="คำอธิบาย &quot;ดี&quot;" name="description"><meta property="og:title" content="หัวข้อ"></head>
    <body><nav>เมนู</nav><script>var x=1</script><p>ย่อหน้าแรก</p><p>ย่อหน้า&nbsp;สอง &#3585;</p><footer>ท้าย</footer></body></html>`;
  const { title, text } = pageText(html);
  assert.equal(title, "ข่าว & บทความ");
  assert.match(text, /^หัวข้อ\nคำอธิบาย "ดี"/);
  assert.match(text, /ย่อหน้าแรก\n+ย่อหน้า สอง ก/);
  assert.doesNotMatch(text, /เมนู|var x|ท้าย/);
});

test("fileParts: PDF ภาพ ข้อความ และชนิดที่อ่านไม่ได้", () => {
  assert.equal(fileParts({ name: "a.pdf", mime: "application/pdf", data: "QQ==" })[0].type, "pdf");
  assert.equal(fileParts({ name: "a.jpg", mime: "image/jpeg", data: "QQ==" })[0].mime, "image/jpeg");
  assert.equal(fileParts({ name: "n.md", mime: "", data: Buffer.from("สวัสดี").toString("base64") })[0].text, "สวัสดี");
  assert.equal(fileParts({ name: "v.mp4", mime: "video/mp4", data: "QQ==" }), null);
});

const fakeChat = (seen) => async ({ messages }) => {
  seen.push(messages[0].content);
  return { choices: [{ message: { content: " สรุปแล้ว " } }] };
};
const htmlRes = (html) => ({ ok: true, headers: new Headers({ "content-type": "text/html; charset=utf-8" }), text: async () => html });
const PAGE = `<title>t</title><p>${"เนื้อหายาวพอให้อ่าน ".repeat(10)}</p>`;

test("readLink: หน้าเว็บ ส่งข้อความในหน้าและคำขอให้ Haiku", async () => {
  const seen = [];
  const reader = createLinkReader({ chat: fakeChat(seen), ears: {}, fetchFn: async () => htmlRes(PAGE) });
  assert.equal(await reader.readLink({ url: "https://example.com/a", question: "ใจความ" }), "สรุปแล้ว");
  assert.match(seen[0][0].text, /เนื้อหายาวพอให้อ่าน/);
  assert.match(seen[0][1].text, /ข้อความในหน้าเว็บ https:\/\/example.com\/a ผู้ใช้ขอว่า: ใจความ/);
  assert.match(await reader.readLink({ url: "example.com" }), /http/);
});

test("readLink: คลิป ถอดเสียงทุกช่วง ถามซ้ำใช้ของเดิม ไม่ดาวน์โหลดใหม่", async () => {
  const seen = [];
  const calls = [];
  const runFn = async (cmd, args) => {
    calls.push(cmd);
    if (cmd === "yt-dlp") {
      const dir = dirname(args[args.indexOf("-o") + 1]);
      await writeFile(join(dir, "clip.m4a"), "audio");
      await writeFile(join(dir, "clip.info.json"), JSON.stringify({ title: "คลิปธรรมะ", uploader: "ผู้โพสต์" }));
    } else {
      const dir = dirname(args[args.length - 1]);
      await writeFile(join(dir, "piece000.mp3"), "a");
      await writeFile(join(dir, "piece001.mp3"), "b");
    }
    return { stdout: "", stderr: "" };
  };
  const ears = { eleven: async (buf) => ({ text: `ช่วง${buf.toString()}` }) };
  const reader = createLinkReader({ chat: fakeChat(seen), ears, runFn, fetchFn: async () => assert.fail("ไม่ควรเปิดหน้าเว็บ") });
  const url = "https://www.tiktok.com/@a/video/1";
  assert.equal(await reader.readLink({ url }), "สรุปแล้ว");
  assert.match(seen[0][0].text, /ชื่อคลิป: คลิปธรรมะ[\s\S]*ช่วงa ช่วงb/);
  await reader.readLink({ url, question: "อีกข้อ" });
  assert.deepEqual(calls, ["yt-dlp", "ffmpeg"]);
});

test("readLink: ดึงเสียงคลิปไม่ได้ (YouTube บล็อก VPS) อ่านหน้าเว็บแทนและบอกว่าไม่ได้ฟังเสียง", async () => {
  const seen = [];
  const runFn = async () => {
    throw new Error("Sign in to confirm you're not a bot");
  };
  const reader = createLinkReader({ chat: fakeChat(seen), ears: {}, runFn, fetchFn: async () => htmlRes(PAGE) });
  assert.equal(await reader.readLink({ url: "https://youtu.be/x" }), "สรุปแล้ว");
  assert.match(seen[0][1].text, /ฟังเสียงคลิปไม่ได้/);
});

test("readFile: ชนิดที่อ่านไม่ได้ บอกผู้ใช้ ไม่เรียก Haiku", async () => {
  const reader = createLinkReader({ chat: async () => assert.fail("ไม่ควรเรียก"), ears: {} });
  assert.match(await reader.readFile({ name: "v.mp4", mime: "video/mp4", data: "QQ==" }, ""), /อ่านไฟล์ชนิดนี้ไม่ได้/);
});
