// ============================================================================
// recovery.js — שחזור נתונים דרך קוד QR, בלי שרת.
// serializeForRecovery/deserializeFromRecovery: רק מה שהמשתמש הזין (טקסט) —
// לא photoStore (ממילא session-only, אף פעם לא ב-state).
// encodeStateToQrChunks/decodeQrChunk: דחיסה (pako) + פיצול לכמה קודי QR
// כשהנתונים ארוכים מדי לקוד אחד — עם כותרת קטנה לזיהוי/הרכבה מחדש.
// ============================================================================
"use strict";

const QR_MAGIC = "BRS1";
const MAX_CHARS_PER_QR = 1200;
const RECOVERY_VERSION = 1;

// --- מבנה קומפקטי (מערכי-ערכים במקום אובייקטים עם שמות שדה) לפני דחיסה ---
function serializeForRecovery(state) {
  return {
    v: RECOVERY_VERSION,
    st: {
      nm: state.name, no: state.number, cl: state.structureClass,
      sp: state.superType, tt: state.tunnelType, ic: state.inspClass,
      id: state.inspDate, pd: state.prevInspDate,
      sn: state.surveyorName, cn: state.companyName, sc: state.spanCount,
      ord: state.client, sty: state.surveyType, dsn: state.designer,
      cx: state.coordX, cy: state.coordY, rn: state.roadNumber,
    },
    spans: state.spans.map((s) => [
      s.id, s.dim, s.dimNote,
      s.components.map((c) => [
        c.uid, c.catalogId, c.name, c.importance, c.unit, c.unit2, c.surveyed,
        c.subs.map((su) => [su.id, su.size, su.note, su.size2 ?? null]),
        c.defects.map((d) => [d.uid, d.family, d.def, d.sub, d.s, d.ex, d.note, d.photo]),
      ]),
    ]),
    find: state.findingPhotos.map((f) => [f.uid, f.desc, f.photo]),
    sk: state.sketches.map((s) => [s.uid, s.code, s.caption]),
    cn: state.changeNotes.map((n) => [n.uid, n.date, n.text]),
    svn: state.surveyorNotes.map((n) => [n.uid, n.date, n.text]),
    en: state.engineerNotes.map((n) => [n.uid, n.date, n.text]),
    co: state.communicationNotes.map((n) => [n.uid, n.date, n.text]),
    ic: state.idCard,
    mp: state.idCardMainPhoto,
    ia: [state.immediateAttention.text, state.immediateAttention.photo],
    df: state.drawingsFile,
  };
}

function deserializeFromRecovery(c) {
  // בדיקת גרסה מפורשת — כדי שקוד שנוצר בגרסה עתידית עם מבנה אחר ייתן הודעה
  // ברורה במקום להישבר באמצע עם שגיאה סתומה על שדה חסר.
  if (!c || c.v !== RECOVERY_VERSION) {
    throw new Error(`גרסת קוד שחזור לא נתמכת (${c && c.v}) — נדרשת גרסה ${RECOVERY_VERSION}`);
  }
  const st = defaultState();
  Object.assign(st, {
    name: c.st.nm, number: c.st.no, structureClass: c.st.cl,
    superType: c.st.sp, tunnelType: c.st.tt, inspClass: c.st.ic,
    inspDate: c.st.id, prevInspDate: c.st.pd,
    surveyorName: c.st.sn, companyName: c.st.cn, spanCount: c.st.sc,
    // שדות שנוספו אחרי הגרסה הראשונה — קוד ישן פשוט לא נושא אותם, אז נופלים
    // חזרה לברירת המחדל (כולל "שגרתית" לסוג הסקירה) במקום להיטען כ-undefined
    client: c.st.ord || "", surveyType: c.st.sty || st.surveyType,
    designer: c.st.dsn || "", roadNumber: c.st.rn || "",
    // cx/cy: השדה המשולב הקודם (crd) קוד שהודפס בחלון הקצר שהוא היה קיים —
    // מפוצל כאן כדי לא לאבד אותו
    coordX: c.st.cx || (c.st.crd || "").trim().split(/\s+/)[0] || "",
    coordY: c.st.cy || (c.st.crd || "").trim().split(/\s+/)[1] || "",
  });
  st.spans = c.spans.map(([id, dim, dimNote, comps]) => ({
    id, dim, dimNote,
    components: comps.map(([uid, catalogId, name, importance, unit, unit2, surveyed, subs, defects]) => ({
      uid, catalogId, name, importance, unit, unit2, surveyed,
      // size2 (מידה משנית) נוסף אחרי הגרסה הראשונה — קוד ישן פשוט לא נושא
      // אותו באיבר הרביעי, ואז הוא נטען null במקום להיאבד בשקט
      subs: subs.map(([sid, size, note, size2]) => ({ id: sid, size, note, size2: size2 ?? null })),
      defects: defects.map(([duid, family, def, sub, s, ex, note, photo]) => ({ uid: duid, family, def, sub, s, ex, note, photo })),
    })),
  }));
  st.findingPhotos = c.find.map(([uid, desc, photo]) => ({ uid, desc, photo }));
  st.sketches = c.sk.map(([uid, code, caption]) => ({ uid, code, caption }));
  st.changeNotes = c.cn.map(([uid, date, text]) => ({ uid, date, text }));
  st.surveyorNotes = c.svn.map(([uid, date, text]) => ({ uid, date, text }));
  st.engineerNotes = c.en.map(([uid, date, text]) => ({ uid, date, text }));
  st.communicationNotes = c.co.map(([uid, date, text]) => ({ uid, date, text }));
  st.idCard = c.ic || {};
  st.idCardMainPhoto = c.mp || "";
  // תוספת אחרי הגרסה הראשונה — נשארת תואמת לאחור: קוד שהודפס לפני כן פשוט
  // לא נושא את השדה, ולכן הוא נטען ריק במקום להיכשל.
  st.immediateAttention = { text: (c.ia && c.ia[0]) || "", photo: (c.ia && c.ia[1]) || "" };
  st.drawingsFile = c.df || "";
  return st;
}

// --- base64url: טקסט ASCII בטוח לכל ערוץ QR (מחיר ~33% נפח, משתלם לאמינות) ---
function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlToBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// --- קידוד: state -> מערך מחרוזות, אחת לכל קוד QR ---
function encodeStateToQrChunks(state) {
  const json = JSON.stringify(serializeForRecovery(state));
  const compressed = pako.deflateRaw(json);
  const b64 = bytesToBase64Url(compressed);
  const batchId = Math.random().toString(36).slice(2, 8);
  const n = Math.max(1, Math.ceil(b64.length / MAX_CHARS_PER_QR));
  const chunks = [];
  for (let i = 0; i < n; i++) {
    const part = b64.slice(i * MAX_CHARS_PER_QR, (i + 1) * MAX_CHARS_PER_QR);
    chunks.push(`${QR_MAGIC}|${batchId}|${i + 1}|${n}|${part}`);
  }
  return chunks;
}

// --- פענוח קטע QR בודד: {batchId, i, n, data} | null אם לא קטע שלנו ---
function decodeQrChunk(text) {
  const parts = String(text || "").split("|");
  if (parts.length < 5 || parts[0] !== QR_MAGIC) return null;
  const i = +parts[2], n = +parts[3];
  if (!Number.isInteger(i) || !Number.isInteger(n) || i < 1 || i > n) return null;
  return { batchId: parts[1], i, n, data: parts.slice(4).join("|") };
}

// --- הרכבת כל הקטעים (לפי סדר 1..n) בחזרה ל-state מלא ---
function assembleQrParts(orderedDataParts) {
  const b64 = orderedDataParts.join("");
  const bytes = base64UrlToBytes(b64);
  const json = pako.inflateRaw(bytes, { to: "string" });
  return deserializeFromRecovery(JSON.parse(json));
}
