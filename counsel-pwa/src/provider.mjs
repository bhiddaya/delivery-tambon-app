// ตัวเชื่อม Gemini Live สำหรับเสียงสองทาง
// ผู้ให้บริการอื่นเพิ่มได้โดยทำ interface เดียวกันนี้
//
// interface ของ session:
//   sendAudio(base64Pcm16_16k)  ส่งเสียงผู้ใช้
//   sendText(text)              ส่งข้อความผู้ใช้
//   activity(start)             แปลสด: บอกเองว่าเริ่มพูด (true) / พูดจบ (false) เพราะปิด VAD ของ Google
//   close()
// callbacks:
//   onAudio(base64Pcm16_24k)    เสียงตอบกลับ
//   onUserText(text)            ข้อความที่ถอดจากเสียงผู้ใช้
//   onBotText(text)             ข้อความที่ถอดจากเสียงตอบ
//   onInterrupted()             ผู้ใช้แทรกพูด ให้หยุดเล่นเสียงค้าง
//   onClose(reason)

import { GoogleGenAI, Modality } from "@google/genai";
import { TOOL_DECLARATION } from "./teachings.mjs";

// รหัสอ้างอิง [P1] [S2] มีไว้ให้ตรวจ ไม่ให้ผู้ใช้เห็น
// รูปที่เจอจริง: [S2] [P1] [S110, P1] และ <ctrl46> (Gemini หลุดออกมาบางครั้งหลังค้น Google)
export const stripTags = (text) => text.replace(/\s*\[[^\]]*?\b[SP]\d+[^\]]*\]/g, "").replace(/<ctrl\d+>/g, "");

// searchTeachings(query) -> ข้อความ <sources> (ไม่ส่งมา = ไม่มีเครื่องมือค้น)
// googleSearch: เปิดเครื่องมือค้น Google ในตัวของ Gemini (หน้า NOVA)
// manualTurns: แปลสด ปิด VAD ของ Google และไม่คิดก่อนพูด หน้าเว็บบอกเองว่าพูดจบ
// (วัดจริง 24 พ.ย. 2569: VAD + คิดก่อนพูด 4.1-5.5 วินาที, บอกพูดจบเอง + ไม่คิด 1.4-1.8 วินาที นับจากพูดจบ)
export async function connectGeminiLive({ config, systemPrompt, callbacks, searchTeachings, googleSearch = false, manualTurns = false }) {
  // SDK v3 ใช้ v1 เป็นค่าเริ่มต้น แต่โมเดล Live รุ่น preview อยู่ที่ v1beta (v1 ตอบ 404)
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey, httpOptions: { apiVersion: "v1beta" } });
  let session = null;
  const answerToolCalls = async (calls) => {
    const functionResponses = await Promise.all(
      calls.map(async (call) => {
        let result;
        try {
          if (call.name !== TOOL_DECLARATION.name || !searchTeachings) throw new Error("ไม่มีเครื่องมือนี้");
          result = await searchTeachings(call.args?.query || "");
        } catch (e) {
          console.error("search_teachings failed:", e.message);
          result = "ค้นคำสอนไม่สำเร็จ ให้ใช้หลัก P1-P6 อย่างเดียว";
        }
        return { id: call.id, name: call.name, response: { result } };
      }),
    );
    session?.sendToolResponse({ functionResponses });
  };
  session = await ai.live.connect({
    model: config.liveModel,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } },
      },
      systemInstruction: systemPrompt,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // คุยยาวแล้วไม่หลุด: บีบบริบทเก่าแทนการปิด session เมื่อเต็ม
      contextWindowCompression: { slidingWindow: {} },
      ...(manualTurns
        ? { realtimeInputConfig: { automaticActivityDetection: { disabled: true } }, thinkingConfig: { thinkingBudget: 0 } }
        : {}),
      ...(searchTeachings || googleSearch
        ? {
            tools: [
              ...(searchTeachings ? [{ functionDeclarations: [TOOL_DECLARATION] }] : []),
              ...(googleSearch ? [{ googleSearch: {} }] : []),
            ],
          }
        : {}),
    },
    callbacks: {
      onmessage(msg) {
        if (msg.toolCall?.functionCalls?.length) {
          answerToolCalls(msg.toolCall.functionCalls);
          return;
        }
        const sc = msg.serverContent;
        if (!sc) return;
        if (sc.interrupted) callbacks.onInterrupted?.();
        for (const part of sc.modelTurn?.parts || []) {
          if (part.inlineData?.data) callbacks.onAudio?.(part.inlineData.data);
        }
        if (sc.inputTranscription?.text) callbacks.onUserText?.(sc.inputTranscription.text);
        if (sc.outputTranscription?.text) callbacks.onBotText?.(stripTags(sc.outputTranscription.text));
        if (sc.turnComplete) callbacks.onTurnComplete?.();
      },
      onerror(e) {
        callbacks.onClose?.(`error: ${e?.message || e}`);
      },
      onclose(e) {
        callbacks.onClose?.(e?.reason || "closed");
      },
    },
  });
  return {
    sendAudio(base64) {
      session.sendRealtimeInput({ audio: { data: base64, mimeType: "audio/pcm;rate=16000" } });
    },
    // ส่งข้อความทางเดียวกับเสียง (realtime input): รุ่น native audio ตอบและเรียกเครื่องมือได้เหมือนผู้ใช้พูด
    // (ส่งแบบ client content แล้วรุ่นนี้บอกว่าจะค้นแต่ไม่เรียกเครื่องมือจริง)
    sendText(text) {
      // แปลสด (ปิด VAD ของ Google): ข้อความต้องอยู่ระหว่างเริ่ม/จบ ไม่งั้น Gemini เงียบ (ทดสอบแล้ว)
      if (manualTurns) session.sendRealtimeInput({ activityStart: {} });
      session.sendRealtimeInput({ text });
      if (manualTurns) session.sendRealtimeInput({ activityEnd: {} });
    },
    activity(start) {
      session.sendRealtimeInput(start ? { activityStart: {} } : { activityEnd: {} });
    },
    close() {
      session.close();
    },
  };
}

// ตัวจำลองสำหรับเทสต์ ไม่เรียก API จริง
export function createFakeProvider(callbacks) {
  return {
    sendAudio() {},
    activity() {},
    sendText(text) {
      callbacks.onUserText?.(text);
      callbacks.onBotText?.("ทดสอบ");
    },
    close() {
      callbacks.onClose?.("fake closed");
    },
  };
}
