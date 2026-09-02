// ============================================================================
// app.js — ניהול מצב, אירועים, שמירה מקומית וחיווט הכל יחד
// ============================================================================
"use strict";

const STORAGE_KEY = "bridge-score-state-v1";
const MAX_SPANS = 30;
let uidCounter = 1;
const nextUid = () => "u" + uidCounter++;

let state = defaultState();
// סדר לפי מסך "סקירות לגשרים" ב-BMS: כללי · שינויים · ממצאים · רכיבים ·
// סוקר · מהנדס · תרשימים · תקשורת — ואחריהם תוצאות ותקציר מנהלים, שאין
// להם מקבילה ב-BMS.
const SEC_TABS = ["general", "changes", "findings", "components", "surveyor", "engineer", "drawings", "communication", "results", "summary", "idcard", "control", "help"];
// לשונית יכולה להציג יותר מפאנל אחד — "כללי" מציגה את פרטי המבנה ומתחתיהם
// את "תשומת לב מיידית".
const TAB_SECTION = {
  general: ["sec-structure", "sec-attention"], changes: ["sec-changes"], findings: ["sec-findings"],
  components: ["sec-components"], surveyor: ["sec-surveyor"], engineer: ["sec-engineer"],
  drawings: ["sec-drawings"], communication: ["sec-communication"],
  results: ["sec-results"], summary: ["sec-summary"], idcard: ["sec-idcard"],
  control: ["sec-control"], help: ["sec-help"],
};
// רשימות הערות חופשיות (תאריך+טקסט) המשותפות לכמה לשוניות — data-list בכל
// שורה קובע לאיזו מהן היא שייכת, כך שמטפל אירועים אחד משרת את כולן.
const NOTE_LISTS = ["changeNotes", "surveyorNotes", "engineerNotes", "communicationNotes"];
const NOTE_CONTAINERS = {
  changeNotes: "change-notes", surveyorNotes: "surveyor-notes",
  engineerNotes: "engineer-notes", communicationNotes: "communication-notes",
};
const ui = { activeSpan: 1, activeTab: "general", activeComponent: null, openDefectForm: null, draft: null, idCardTab: "general" };

// --- מאגר קבצים מצורפים (תמונות/סקיצות) — session בלבד, לא נשמר ב-localStorage:
// תמונות שוקלות מגה-בייטים והמכסה כ-5MB. מצורפות מחדש בכל טעינה, ממש לפני
// הפקת הדוח — תואם לתהליך העבודה (כפתור "הוסף קבצים מצורפים" בסוף).
// code -> { dataUrl, filename, kind: "photo"|"sketch" }
const photoStore = new Map();

// קובץ התרשימים (DWG) הוא לא תמונה — אין מה להטמיע ב-PDF, ולכן לא נשמר
// בתוכן עצמו, רק סימון session-בלבד (כמו photoStore) שקובץ נבחר בפועל,
// כדי להבדיל מהקלדה ידנית של שם קובץ בלי שנבחר קובץ אמיתי.
let drawingsFileAttached = false;

// קורא ישירות מה-DOM את מה שהוקלד בשורות של רשימה, לפני פעולה שמרנדרת אותה
// מחדש (הוספת שורה). אירוע ה-change של שדה תלוי ב-blur, וסדר blur/click אינו
// מובטח — בלי זה לחיצה על "הוסף שורה" מיד אחרי הקלדה מאבדת את ההקלדה האחרונה.
function flushRowInputs(containerId, list, uidAttr, actionToKey) {
  const root = document.getElementById(containerId);
  if (!root) return;
  for (const [action, key] of Object.entries(actionToKey)) {
    root.querySelectorAll(`[data-action="${action}"]`).forEach((inp) => {
      const item = list.find((x) => x.uid === inp.dataset[uidAttr]);
      if (item) item[key] = inp.value;
    });
  }
}

function parsePhotoCodes(str) {
  return String(str || "").split(";").map((s) => s.trim()).filter(Boolean);
}
// קוד עם אפס מוביל (001, 013) = סקיצה; אחרת תמונה — כפי שנעשה בתיקיות בפועל.
function isSketchCode(code) {
  return /^0\d+$/.test(String(code || "").trim());
}

function collectMissingPhotoCodes() {
  const codes = new Set();
  for (const s of state.spans)
    for (const c of s.components)
      for (const d of c.defects) for (const code of parsePhotoCodes(d.photo)) codes.add(code);
  for (const f of state.findingPhotos) for (const code of parsePhotoCodes(f.photo)) codes.add(code);
  for (const sk of state.sketches) if (sk.code && sk.code.trim()) codes.add(sk.code.trim());
  for (const code of parsePhotoCodes(state.immediateAttention.photo)) codes.add(code);
  if (state.idCardMainPhoto && state.idCardMainPhoto.trim()) codes.add(state.idCardMainPhoto.trim());
  for (const group of ID_CARD_GROUPS)
    for (const f of group.fields)
      if (f.type === "photo") for (const code of parsePhotoCodes(state.idCard[f.code])) codes.add(code);
  return [...codes].filter((code) => !photoStore.has(code));
}

// הקטנה לפני אחסון — בלי זה דוח בינוני יתפח לעשרות MB ו-html2canvas ייחנק.
function resizeImageFile(file, maxDim, quality) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.round(w * scale) || 1; h = Math.round(h * scale) || 1;
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// --- "הוסף קבצים מצורפים": שולף מתיקיית הגשר (תמונות/ + סקיצות/) לפי שם
// הקובץ, ומדווח מה נמצא ומה חסר (קודים שנרשמו בטופס בלי קובץ תואם) ---
async function attachFolder(fileList) {
  const files = [...fileList].filter((f) => /\.(jpe?g|png|gif|bmp|webp)$/i.test(f.name));
  let photoCount = 0, sketchCount = 0;
  for (const file of files) {
    const path = file.webkitRelativePath || "";
    const code = file.name.replace(/\.[^.]+$/, "").trim();
    const kind = path.includes("תמונות") ? "photo" : path.includes("סקיצות") ? "sketch" : (isSketchCode(code) ? "sketch" : "photo");
    const dataUrl = await resizeImageFile(file, 1200, 0.8);
    if (!dataUrl) continue;
    photoStore.set(code, { dataUrl, filename: file.name, kind });
    if (kind === "sketch") sketchCount++; else photoCount++;
  }
  const missing = collectMissingPhotoCodes();
  scheduleUpdate();
  alert(
    `צורפו ${photoCount} תמונות ו-${sketchCount} סקיצות.` +
    (missing.length
      ? `\n\nקודים שנרשמו בטופס ולא נמצא להם קובץ תואם (${missing.length}): ${missing.join(", ")}`
      : "\n\nכל הקודים שנרשמו בטופס נמצאו.")
  );
}

// --- שחזור נתונים מקוד QR (מצלמה או תמונה) — session בלבד, מאופס בכל
// פתיחת הפאנל; לא כולל תמונות (photoStore) — רק מה שהמשתמש הזין בטופס ---
let qrScan = { stream: null, rafId: null, batchId: null, n: 0, parts: new Map() };

function qrScanReset() {
  qrScan.batchId = null; qrScan.n = 0; qrScan.parts = new Map();
}
function qrScanStatusText() {
  if (!qrScan.n) return "כוונו למצלמה קוד QR מהדוח, או בחרו תמונה שלו.";
  return `נסרקו ${qrScan.parts.size} מתוך ${qrScan.n} קודים…`;
}

// מטפל בטקסט שפוענח (ממצלמה או מתמונה) — קטע שייך למספר, מצטבר, ומרכיב
// בסיום. batchId שונה מאפס את ההתקדמות (כדי לא לערבב שני דוחות/ייצואים).
function handleQrChunk(text) {
  const chunk = decodeQrChunk(text);
  if (!chunk) return;
  if (qrScan.batchId !== chunk.batchId) { qrScanReset(); qrScan.batchId = chunk.batchId; qrScan.n = chunk.n; }
  qrScan.parts.set(chunk.i, chunk.data);
  document.getElementById("qr-status").textContent = qrScanStatusText();
  if (qrScan.parts.size < qrScan.n) return;

  const ordered = [];
  for (let i = 1; i <= qrScan.n; i++) ordered.push(qrScan.parts.get(i));
  let recovered;
  try { recovered = assembleQrParts(ordered); }
  catch (e) { document.getElementById("qr-status").textContent = "שגיאה בפענוח הקודים — נסו לסרוק שוב."; qrScanReset(); return; }
  applyRecoveredState(recovered);
}

// מוודא ש-nextUid() לא יפיק בעתיד uid שכבר קיים בנתונים המשוחזרים
function bumpUidCounterPast(st) {
  let max = 0;
  const scan = (u) => { const m = /^u(\d+)$/.exec(u || ""); if (m) max = Math.max(max, +m[1]); };
  for (const s of st.spans) for (const c of s.components) { scan(c.uid); for (const d of c.defects) scan(d.uid); }
  for (const f of st.findingPhotos) scan(f.uid);
  for (const s of st.sketches) scan(s.uid);
  for (const list of [st.changeNotes, st.surveyorNotes, st.engineerNotes, st.communicationNotes]) for (const n of list) scan(n.uid);
  if (max >= uidCounter) uidCounter = max + 1;
}

function applyRecoveredState(newState) {
  // ביטול = סגירת הסורק. איפוס בלבד לא מספיק: לולאת המצלמה מזהה מיד את אותו
  // קוד שוב ומקפיצה את אותה שאלה בלי סוף.
  if (!confirm("לטעון את הנתונים שנסרקו? זה יחליף את הנתונים הנוכחיים בטופס (לא כולל תמונות מצורפות — אלה יש לצרף מחדש).")) {
    closeQrScan();
    return;
  }
  state = newState;
  bumpUidCounterPast(state);
  // הסימון ✔ שייך לקובץ שנבחר בסשן הנוכחי — הנתונים המשוחזרים נושאים רק את
  // שם הקובץ, ולכן הסימון חייב להתאפס כדי לא להצהיר על קובץ שלא נבחר
  drawingsFileAttached = false;
  ui.activeSpan = 1; ui.activeComponent = null; ui.activeTab = "general"; ui.idCardTab = "general"; ui.openDefectForm = null;
  closeQrScan();
  update();
}

// --- טעינת סקירה מקובץ JSON (קובץ הטעינה שבתוך ה-ZIP, ר' pdf.js exportZip) ---
function loadStateFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); }
    catch (e) { alert("הקובץ שנבחר אינו קובץ סקירה תקין (JSON פגום)."); return; }
    if (!confirm("לטעון את הסקירה מהקובץ? זה יחליף את הנתונים הנוכחיים בטופס (לא כולל תמונות מצורפות — יש לצרף אותן מחדש).")) return;
    state = migrateState(parsed);
    bumpUidCounterPast(state);
    drawingsFileAttached = false;
    ui.activeSpan = 1; ui.activeComponent = null; ui.activeTab = "general"; ui.idCardTab = "general"; ui.openDefectForm = null;
    update();
  };
  reader.onerror = () => alert("לא ניתן לקרוא את הקובץ שנבחר.");
  reader.readAsText(file);
}

async function startQrScan() {
  qrScanReset();
  document.getElementById("qr-scan-panel").hidden = false;
  document.getElementById("qr-status").textContent = "מבקש הרשאת מצלמה…";
  try {
    qrScan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.getElementById("qr-video");
    video.srcObject = qrScan.stream;
    await video.play();
    document.getElementById("qr-status").textContent = qrScanStatusText();
    const canvas = document.getElementById("qr-canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const tick = () => {
      if (!qrScan.stream) return;
      if (video.videoWidth) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(img.data, img.width, img.height);
        if (found && found.data) handleQrChunk(found.data);
      }
      qrScan.rafId = requestAnimationFrame(tick);
    };
    qrScan.rafId = requestAnimationFrame(tick);
  } catch (e) {
    document.getElementById("qr-status").textContent = "אין גישה למצלמה — אפשר לבחור תמונה של הקוד במקום.";
  }
}

function stopQrScanStream() {
  if (qrScan.rafId) cancelAnimationFrame(qrScan.rafId);
  if (qrScan.stream) for (const track of qrScan.stream.getTracks()) track.stop();
  const video = document.getElementById("qr-video");
  if (video) video.srcObject = null;   // בלי זה נורית המצלמה עלולה להישאר דולקת
  qrScan.stream = null; qrScan.rafId = null;
}
function closeQrScan() {
  stopQrScanStream();
  document.getElementById("qr-scan-panel").hidden = true;
  qrScanReset();
}

function scanQrFromFile(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    // קנבס פרטי ולא #qr-canvas המשותף — כך אפשר לבחור כמה תמונות בבת אחת
    // (דוח גדול מתפצל לכמה קודים) בלי שהן ידרסו זו את זו.
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const found = jsQR(data.data, data.width, data.height);
    if (found && found.data) handleQrChunk(found.data);
    else document.getElementById("qr-status").textContent = "לא זוהה קוד QR בתמונה — נסו תמונה ברורה/קרובה יותר.";
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    document.getElementById("qr-status").textContent = "לא ניתן לקרוא את הקובץ שנבחר — נסו תמונה אחרת.";
  };
  img.src = url;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// שורת ממצא לכל תמונה נדרשת לפי סוג המבנה (טבלת "ממצאים" ב"דפי עזר לסקירה..",
// נתיבי ישראל) — קוד תמונה ריק, הסוקר ממלא ומשייך את הקובץ בעצמו.
function requiredFindingsFor(structureClass) {
  return (REQUIRED_FINDINGS_BY_CLASS[structureClass] || []).map((desc) => ({ uid: nextUid(), desc, photo: "" }));
}
// true אם הרשימה עדיין בדיוק כמו שנוצרה אוטומטית (אף קוד תמונה לא מולא, ואף
// תיאור לא נערך) — כלומר בטוח להחליף אותה ברשימת ברירת המחדל של סוג אחר
// בלי למחוק עבודה של הסוקר. משמש בשינוי סיווג המבנה.
function isPristineFindingsList(list) {
  // רשימה ריקה נחשבת "נקייה" גם היא — למשל מצב שמור ישן שנשמר לפני שהתכונה
  // הזו נוספה (findingPhotos: []), או רכיב שכל שורותיו נמחקו — בלי זה שינוי
  // סיווג לא היה יכול לעולם למלא אותה מחדש (list.every על מערך ריק true,
  // אבל אף תבנית לא באורך 0, אז ההתאמה נכשלה תמיד).
  if (list.length === 0) return true;
  if (!list.every((f) => !f.photo)) return false;
  const descs = list.map((f) => f.desc);
  return Object.values(REQUIRED_FINDINGS_BY_CLASS).some(
    (tpl) => tpl.length === descs.length && tpl.every((d, i) => d === descs[i])
  );
}

function defaultState() {
  return {
    name: "", number: "", structureClass: "BRG", superType: 4, tunnelType: null,
    inspClass: "", inspDate: todayISO(), prevInspDate: "",
    surveyorName: "", companyName: "",
    immediateAttention: { text: "", photo: "" },
    findingPhotos: requiredFindingsFor("BRG"), sketches: [], drawingsFile: "",
    changeNotes: [], surveyorNotes: [], engineerNotes: [], communicationNotes: [],
    idCard: {}, idCardMainPhoto: "",
    spanCount: 1, spans: [{ id: 1, dim: "", dimNote: "", components: [] }],
  };
}

// השלמת שדות שנוספו בגרסאות חדשות למצב שמור ישן (localStorage)
function migrateState(s) {
  const out = { ...defaultState(), ...s };
  if (!out.inspDate) out.inspDate = todayISO();
  if (out.inspClass == null) out.inspClass = "";
  // ניגשים אליו כאובייקט בכמה מקומות — הגנה מפני מצב שמור שנשמר לפני שהשדה נוסף
  if (!out.immediateAttention || typeof out.immediateAttention !== "object") {
    out.immediateAttention = { text: "", photo: "" };
  }
  out.spans = (out.spans || []).map((sp) => ({
    dimNote: "", ...sp,
    components: (sp.components || []).map((c) => ({
      ...c, subs: (c.subs || []).map((su) => ({ note: "", size2: null, ...su })),
    })),
  }));
  return out;
}

// --- עזרי מצב ---
function activeSpanObj() {
  return state.spans.find((s) => s.id === ui.activeSpan) || state.spans[0];
}
function findComp(uid) {
  for (const s of state.spans)
    for (const c of s.components) if (c.uid === uid) return { span: s, comp: c };
  return null;
}
function syncSpanCount() {
  const n = Math.max(1, Math.min(MAX_SPANS, +state.spanCount || 1));
  state.spanCount = n;
  while (state.spans.length < n) state.spans.push({ id: state.spans.length + 1, dim: "", dimNote: "", components: [] });
  while (state.spans.length > n) state.spans.pop();
  if (ui.activeSpan > n) ui.activeSpan = 1;
}
// מוודא ש-ui.activeComponent מצביע על רכיב קיים במפתח הפעיל — נקרא בכל update()
function syncActiveComponent() {
  const comps = activeSpanObj().components;
  if (!comps.some((c) => c.uid === ui.activeComponent)) ui.activeComponent = comps[0] ? comps[0].uid : null;
}

// --- הוספת רכיב מהקטלוג --- (מחזירה את ה-uid החדש; הרינדור באחריות הקורא)
function addComponent(catalogId) {
  const catalog = COMPONENT_CATALOGS[state.structureClass];
  const def = catalog.find((c) => String(c.id) === String(catalogId));
  if (!def) return null;
  let name = def.name, unit = def.unit, unit2 = def.unit2, displayId = def.id;
  if (def.dynamic) {  // רכיב ראשי/משני נקבע לפי סוג המבנה (טבלה 2 / טבלה 6)
    const isTun = state.structureClass === "TUN";
    if (isTun && !state.tunnelType) {
      alert("כדי להוסיף רכיב זה יש לבחור קודם סוג מנהרה (טבלה 6) בפרטי המבנה — או להוסיף רכיב אחר.");
      return null;
    }
    const types = isTun ? TUNNEL_TYPES : SUPERSTRUCTURE_TYPES;
    const t = types.find((x) => x.id === +(isTun ? state.tunnelType : state.superType));
    const part = t && t[def.dynamic === "main" ? "main" : "secondary"];
    // הרכיב מקבל את הקוד מטבלה 2/6 (למשל 1.4 קורה ראשית, 3.4 טבלת המיסעה)
    if (part) { displayId = part.code; name = part.name; unit = part.unit; unit2 = part.unit2 || null; }
    else if (def.dynamic === "secondary") { alert("לסוג המבנה שנבחר אין רכיב משני (טבלה 2)"); return null; }
  }
  const uid = nextUid();
  // ברירת המחדל של הנוהל: רכיב ללא פגם רשום נחשב תקין (1A) — לכן כל רכיב
  // חדש מתחיל עם רשומת "רכיב תקין" מפורשת (כמו לחיצה על "✔️ רכיב תקין"),
  // ולא עם רשימת פגמים ריקה. saveDraft() מסיר אותה אוטומטית ברגע שנוסף פגם
  // אמיתי, כדי שלא תופיע יחד איתו בטבלה.
  activeSpanObj().components.push({
    uid, catalogId: displayId, name, importance: def.imp, unit, unit2,
    surveyed: true, subs: [{ id: 1, size: 1, size2: null, note: "" }],
    defects: [{ uid: nextUid(), family: null, def: null, sub: 1, s: 1, ex: "A", note: "רכיב תקין", photo: "" }],
  });
  return uid;
}

// --- טופס פגם (טיוטה) ---
function openDefectForm(compUid) {
  const found = findComp(compUid);
  if (!found) return;
  ui.openDefectForm = compUid;
  // פגם נבחר בשדה אחד (קוד או שם) — המשפחה נגזרת אוטומטית מהקוד
  ui.draft = { family: null, def: null, sub: found.comp.subs[0].id, s: 1, ex: "A", note: "", photo: "" };
  scheduleUpdate(() => {
    const input = document.querySelector(`[data-comp="${compUid}"] [data-combo-id="draft-def"] .combo-input`);
    if (input) input.focus();
  });
}
function draftChanged(action, value) {
  const d = ui.draft;
  if (action === "draft-def") {
    d.def = value || null;
    d.family = value ? +String(value).split(".")[0] : null;
    const cat = DEFECT_CATALOG.defects.find((x) => x.code === value);
    d.s = cat && cat.available_severities.length && !cat.available_severities.includes(1)
      ? cat.available_severities[0] : 1;
  } else if (action === "draft-sub") d.sub = +value;
  else if (action === "draft-s") {
    d.s = +value;
    const comp = findComp(ui.openDefectForm).comp;
    if (d.s > 1 && d.ex === "A") d.ex = "B";
    if (comp.unit === "יח'" && d.s > 1) d.ex = "B";
  }
  else if (action === "draft-ex") d.ex = value;
  else if (action === "draft-note") d.note = value;
  else if (action === "draft-photo") d.photo = value;
  scheduleUpdate();
}
function saveDraft() {
  const found = findComp(ui.openDefectForm);
  if (!found) return;
  const d = ui.draft;
  if (!d.def) return;
  const errors = Calc.validateDefect(+d.s, d.ex, found.comp.unit);
  if (errors.length) return;
  // ברגע שנרשם פגם אמיתי, רשומת ברירת המחדל "רכיב תקין" (def=null) כבר לא
  // נכונה — מוסרים אותה כדי שלא תופיע יחד עם הפגם החדש בטבלה.
  found.comp.defects = found.comp.defects.filter((x) => !(x.def == null && x.note === "רכיב תקין"));
  found.comp.defects.push({ uid: nextUid(), family: d.family, def: d.def, sub: +d.sub, s: +d.s, ex: d.ex, note: d.note, photo: d.photo });
  ui.openDefectForm = null; ui.draft = null;
  scheduleUpdate();
}

// --- חישוב ---
function buildEngineInput() {
  return {
    structureClass: state.structureClass,
    spans: state.spans.map((s) => ({
      id: s.id, dim: +s.dim || 0,
      components: s.components.map((c) => ({
        key: c.uid, name: c.name, importance: c.importance, unit: c.unit,
        surveyed: c.surveyed, subs: c.subs,
      })),
      defects: s.components.flatMap((c) =>
        c.defects.map((d) => ({ compKey: c.uid, sub: d.sub, s: d.s, ex: d.ex, def: d.def, note: d.note }))
      ),
    })),
  };
}
function hasAnyComponents() {
  return state.spans.some((s) => s.components.length);
}

// --- עדכון דחוי + שימור פוקוס -------------------------------------------
// הרינדור המלא (innerHTML) הורג את הפוקוס — קטלני למילוי רציף ב-Tab.
// הפתרון: (1) לדחות את הרינדור ב-setTimeout(0) כך שהדפדפן יספיק להעביר
// פוקוס לשדה הבא; (2) לזהות את השדה הממוקד לפי מזהה יציב ולהחזיר אליו
// את הפוקוס אחרי הרינדור.
let updateTimer = null;
const afterUpdateQueue = [];
function scheduleUpdate(after) {
  if (after) afterUpdateQueue.push(after);
  if (updateTimer !== null) return;
  updateTimer = setTimeout(() => { updateTimer = null; update(); }, 0);
}

function captureFocus() {
  const el = document.activeElement;
  if (!el || el === document.body || !("value" in el)) return null;
  let sel = null;
  if (el.classList.contains("combo-input")) {
    const combo = el.closest(".combo");
    if (combo) sel = `[data-combo-id="${combo.dataset.comboId}"] .combo-input`;
  } else if (el.id) {
    sel = "#" + CSS.escape(el.id);
  } else if (el.dataset && el.dataset.action) {
    sel = `[data-action="${el.dataset.action}"]`;
    if (el.dataset.sub) sel += `[data-sub="${el.dataset.sub}"]`;
    if (el.dataset.span) sel += `[data-span="${el.dataset.span}"]`;
    if (el.type === "radio") sel += `[value="${el.value}"]`;
    const comp = el.closest("[data-comp]");
    if (comp) sel = `[data-comp="${comp.dataset.comp}"] ` + sel;
  }
  if (!sel) return null;
  const canRange = el.setSelectionRange && /^(text|search|tel|url|password)$/.test(el.type || "");
  return { sel, start: canRange ? el.selectionStart : null, end: canRange ? el.selectionEnd : null };
}

function restoreFocus(f) {
  if (!f) return;
  const el = document.querySelector(f.sel);
  if (!el || el === document.activeElement) return;
  Combobox.silentFocus(el);
  if (f.start != null && el.setSelectionRange) {
    try { el.setSelectionRange(f.start, f.end); } catch (e) { /* שדה ללא בחירה */ }
  }
}

// --- רינדור ראשי ---
function update() {
  const focused = captureFocus();
  syncSpanCount();
  syncActiveComponent();

  document.getElementById("breadcrumb").innerHTML = renderBreadcrumb(state);
  document.querySelectorAll("#sec-tabs .sec-tab").forEach((btn) => {
    const active = btn.dataset.tab === ui.activeTab;
    btn.classList.toggle("active", active);
  });
  for (const tab of SEC_TABS) {
    const hidden = tab !== ui.activeTab;
    for (const id of TAB_SECTION[tab]) document.getElementById(id).hidden = hidden;
  }

  document.getElementById("st-name").value = state.name;
  document.getElementById("st-number").value = state.number;
  document.getElementById("st-surveyor").value = state.surveyorName;
  document.getElementById("st-company").value = state.companyName;
  document.getElementById("st-class").value = state.structureClass;
  document.getElementById("st-supertype-combo").innerHTML = Combobox.html({
    id: "st-supertype", action: "st-supertype", value: state.superType,
    options: SUPERSTRUCTURE_TYPES.map((t) => ({ value: t.id, label: `${t.id}. ${t.label}` })),
    placeholder: "הקלד לסינון…",
  });
  document.getElementById("st-tunneltype-combo").innerHTML = Combobox.html({
    id: "st-tunneltype", action: "st-tunneltype", value: state.tunnelType == null ? "none" : state.tunnelType,
    options: [{ value: "none", label: "— ללא (לא נדרש) —" }]
      .concat(TUNNEL_TYPES.map((t) => ({ value: t.id, label: `${t.id}. ${t.label}` }))),
    placeholder: "אופציונלי — הקלד לסינון…",
  });
  document.getElementById("st-spancount").value = state.spanCount;
  document.getElementById("insp-class").value = state.inspClass;
  document.getElementById("insp-date").value = state.inspDate;
  document.getElementById("prev-insp-date").value = state.prevInspDate;
  // שדות סטטיים (לא נבנים מחדש) — כך הסמן לא קופץ באמצע הקלדה בטקסט חופשי
  document.getElementById("drawings-file").value = state.drawingsFile;
  document.getElementById("drawings-file-status").innerHTML = drawingsFileAttached
    ? '<span class="photo-chip ok">✔ קובץ הועלה</span>'
    : '<span class="photo-chip missing">לא הועלה קובץ עדיין</span>';
  document.getElementById("ia-text").value = state.immediateAttention.text;
  document.getElementById("ia-photo").value = state.immediateAttention.photo;
  document.getElementById("ia-photo-status").innerHTML =
    photoCodesCell(photoStore, state.immediateAttention.photo) || '<span class="hint">לא נרשם קוד</span>';
  updateInspection();
  document.getElementById("wrap-supertype").hidden = !(state.structureClass === "BRG" || state.structureClass === "CLV");
  document.getElementById("wrap-tunneltype").hidden = state.structureClass !== "TUN";
  document.getElementById("span-dims").innerHTML = renderSpanDims(state);
  document.getElementById("span-rule-hint").textContent =
    state.spanCount <= 2
      ? ""
      : "מבנה בעל 3 מפתחים ומעלה: ציון לכל מפתח בנפרד ושקלול לפי המימד (משוואה 6.2). הזן מימד לכל מפתח.";

  document.getElementById("finding-photos").innerHTML = renderFindingPhotos(state, photoStore);
  document.getElementById("sketches").innerHTML = renderSketches(state);
  document.getElementById("change-notes").innerHTML = renderNotesTable(state.changeNotes, "changeNotes");
  document.getElementById("surveyor-notes").innerHTML = renderSurveyorNotes(state.surveyorNotes);
  document.getElementById("engineer-notes").innerHTML = renderNotesTable(state.engineerNotes, "engineerNotes");
  document.getElementById("communication-notes").innerHTML = renderNotesTable(state.communicationNotes, "communicationNotes");

  // חישוב אחד לכל update() — גם ל"ת.ז", גם ל"תוצאות" וגם ל"תקציר מנהלים".
  // בגשר בסדר גודל BR-11 (150 פגמים) חישוב כפול הורגש בהקלדה רציפה.
  let result = null, summary = null;
  if (hasAnyComponents()) {
    const input = buildEngineInput();
    result = Calc.computeStructure(input);
    summary = Calc.executiveSummary(input, result);
  }

  document.getElementById("idcard-tabs").innerHTML = renderIdCardTabs(ui.idCardTab);
  document.getElementById("idcard-fields").innerHTML = renderIdCardGroup(ui.idCardTab, state, result, photoStore);
  document.getElementById("idcard-photo").value = state.idCardMainPhoto;
  document.getElementById("control-audit").innerHTML = renderControlAudit(state, result);

  document.getElementById("add-comp-combo").innerHTML = Combobox.html({
    id: "add-comp", action: "add-comp", options: componentComboOptions(state),
    placeholder: "— בחר רכיב מהקטלוג (הקלד קוד או שם) —",
  });
  document.getElementById("span-tabs").innerHTML = renderSpanTabs(state, ui.activeSpan);
  document.getElementById("add-comp-span").innerHTML = renderAddCompSpanOptions(state, ui.activeSpan);
  document.getElementById("comp-master").innerHTML = renderComponentMasterList(activeSpanObj(), ui);
  document.getElementById("comp-detail").innerHTML = renderComponentDetail(activeSpanObj(), ui, photoStore);

  document.getElementById("results").innerHTML = renderResults(state, result);
  document.getElementById("summary").innerHTML = renderSummary(state, result, summary);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  restoreFocus(focused);
  while (afterUpdateQueue.length) afterUpdateQueue.shift()();
}

// --- טעינת דוגמה BR-11 ---
function loadExample() {
  const fx = EXAMPLE_BR11;
  const st = defaultState();
  st.name = "גשר BR-11 (דוגמה)";
  st.number = "BR-11";
  st.structureClass = fx.structureClass;
  st.findingPhotos = requiredFindingsFor(st.structureClass);  // מתעדכן לפי הסיווג בפועל, לא רק ברירת המחדל
  st.superType = fx.superstructureType;
  st.spanCount = fx.spans.length;
  st.spans = fx.spans.map((span, i) => ({
    id: span.span, dim: Math.round(fx.deckAreas[i] * 100) / 100, dimNote: "",
    components: span.components.map((c) => {
      const comp = {
        uid: nextUid(), catalogId: null, name: c.name, importance: c.importance,
        unit: null, unit2: null, surveyed: true,
        subs: c.subs.map((s) => ({ id: s.id, size: s.size, size2: null, note: "" })), defects: [],
      };
      comp.defects = span.defects.filter((d) => d.comp === c.name).map((d) => ({
        uid: nextUid(), family: d.def ? +String(d.def).split(".")[0] : null,
        def: d.def ? String(+String(d.def).split(".")[0]) + "." + String(+String(d.def).split(".")[1] || 0) : null,
        sub: d.sub, s: d.s, ex: d.ex, note: "", photo: "",
      }));
      return comp;
    }),
  }));
  state = st;
  drawingsFileAttached = false;   // הדוגמה לא נושאת קובץ תרשימים שנבחר בסשן
  ui.activeSpan = 1; ui.activeComponent = null; ui.activeTab = "results";
  ui.idCardTab = "general"; ui.openDefectForm = null;
  update();
}

// --- מועד סקירה הבאה — לוגיקה טהורה, נקראת גם מה-UI וגם מ-pdf.js ---
function computeNextInspection(state) {
  if (state.inspClass === "" || state.inspClass == null || !state.inspDate) return null;
  const freq = INSPECTION_FREQUENCIES[+state.inspClass];
  const base = new Date(state.inspDate);
  const maxDate = new Date(base); maxDate.setFullYear(maxDate.getFullYear() + freq.years);
  const defDate = new Date(base); defDate.setMonth(defDate.getMonth() + DEFAULT_NEXT_INSPECTION_MONTHS);
  const effective = defDate < maxDate ? defDate : maxDate;
  return { years: freq.years, maxDate, defDate, effective };
}

// --- מועד סקירה הבאה (מוצג בפרטי המבנה) ---
function updateInspection() {
  const out = document.getElementById("insp-result");
  const insp = computeNextInspection(state);
  if (!insp) { out.textContent = "בחר סיווג לסקירה כדי לקבל אוטומטית את מועד הסקירה הבאה."; return; }
  const f = (d) => d.toLocaleDateString("he-IL");
  out.innerHTML = `מרווח מירבי לסיווג זה: <strong>${insp.years} שנים</strong> (עד ${f(insp.maxDate)}) ·
    ברירת המחדל בטופס: 24 חודשים (${f(insp.defDate)}) ·
    <strong>מועד מומלץ לסקירה הבאה: ${f(insp.effective)}</strong>
    <br><span class="hint">הסקירה חייבת להתבצע במרווח הקטן מהמרווח המירבי; המהנדס היועץ רשאי להקדים.</span>`;
}

// --- אתחול ואירועים ---
function init() {
  const clsSel = document.getElementById("st-class");
  clsSel.innerHTML = Object.entries(STRUCTURE_CLASSES)
    .map(([k, v]) => `<option value="${k}">${k} — ${esc(v.label)}</option>`).join("");
  document.getElementById("insp-class").innerHTML =
    '<option value="">— בחר סיווג —</option>' +
    INSPECTION_FREQUENCIES.map((f, i) => `<option value="${i}">${esc(f.label)} — כל ${f.years} שנים</option>`).join("");

  const saved = localStorage.getItem(STORAGE_KEY);
  // uidCounter חייב להמשיך אחרי ה-uid הגבוה ביותר שכבר קיים בנתונים השמורים.
  // קפיצה לקבוע (10000) נשברה בטעינה השנייה: הרכיב שנוסף בפעם הקודמת כבר
  // תפס u10000, והרכיב החדש קיבל אותו uid — ואז מחיקת אחד מהם מחקה את שניהם.
  if (saved) { try { state = migrateState(JSON.parse(saved)); bumpUidCounterPast(state); } catch (e) { /* מצב פגום — מתחילים נקי */ } }

  // שדות המבנה
  document.getElementById("st-name").addEventListener("input", (e) => { state.name = e.target.value; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); });
  document.getElementById("st-number").addEventListener("input", (e) => { state.number = e.target.value; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); });
  document.getElementById("st-surveyor").addEventListener("input", (e) => { state.surveyorName = e.target.value; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); });
  document.getElementById("st-company").addEventListener("input", (e) => { state.companyName = e.target.value; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); });
  document.getElementById("drawings-file").addEventListener("input", (e) => {
    state.drawingsFile = e.target.value;
    // עריכה ידנית של שם הקובץ אחרי שנבחר קובץ אמיתי — הסימון ✔ כבר לא מדויק
    drawingsFileAttached = false;
    document.getElementById("drawings-file-status").innerHTML = '<span class="photo-chip missing">לא הועלה קובץ עדיין</span>';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  });
  document.getElementById("btn-drawings-file").addEventListener("click", () => document.getElementById("drawings-file-input").click());
  document.getElementById("drawings-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.drawingsFile = file.name;
    drawingsFileAttached = true;
    e.target.value = "";
    scheduleUpdate();
  });
  // "תשומת לב מיידית" — שדות סטטיים, לכן שמירה ישירה בלי רינדור מלא (הסמן
  // בטקסט ארוך היה קופץ). רק תגיות הסטטוס של קוד התמונה מתרעננות בנפרד.
  document.getElementById("ia-text").addEventListener("input", (e) => {
    state.immediateAttention.text = e.target.value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  });
  document.getElementById("ia-photo").addEventListener("input", (e) => {
    state.immediateAttention.photo = e.target.value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    document.getElementById("ia-photo-status").innerHTML =
      photoCodesCell(photoStore, e.target.value) || '<span class="hint">לא נרשם קוד</span>';
  });
  document.getElementById("st-class").addEventListener("change", (e) => {
    state.structureClass = e.target.value;
    // מחליף לרשימת התמונות הנדרשות של הסיווג החדש רק אם הרשימה הנוכחית עדיין
    // בדיוק ברירת המחדל שנוצרה אוטומטית — כדי לא למחוק עבודה שהסוקר כבר עשה
    if (isPristineFindingsList(state.findingPhotos)) state.findingPhotos = requiredFindingsFor(e.target.value);
    scheduleUpdate();
  });
  document.getElementById("st-spancount").addEventListener("change", (e) => {
    const n = Math.max(1, Math.min(MAX_SPANS, +e.target.value || 1));
    const lost = state.spans.slice(n).filter((s) => s.components.length);
    if (lost.length && !confirm(
      `הקטנת מספר המפתחים ל-${n} תמחק לצמיתות את כל הרכיבים והפגמים של מפתח/ים ${lost.map((s) => s.id).join(", ")}. להמשיך?`
    )) { e.target.value = state.spanCount; return; }
    state.spanCount = n;
    scheduleUpdate();
  });
  document.getElementById("insp-class").addEventListener("change", (e) => { state.inspClass = e.target.value; scheduleUpdate(); });
  document.getElementById("insp-date").addEventListener("change", (e) => { state.inspDate = e.target.value; scheduleUpdate(); });

  // אצילת אירועים לכל הפעולות הדינמיות
  document.body.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const compEl = el.closest("[data-comp]");
    const compUid = compEl ? compEl.dataset.comp : null;
    if (action === "span-tab") { ui.activeSpan = +el.dataset.span; ui.activeComponent = null; ui.openDefectForm = null; scheduleUpdate(); }
    else if (action === "sec-tab") { ui.activeTab = el.dataset.tab; scheduleUpdate(); }
    else if (action === "comp-select") { ui.activeComponent = compUid; ui.openDefectForm = null; scheduleUpdate(); }
    else if (action === "idcard-tab") { ui.idCardTab = el.dataset.group; scheduleUpdate(); }
    else if (action === "finding-add") {
      // לחיצה אחת גם שומרת את מה שהוקלד וגם פותחת שורה חדשה עם פוקוס מיידי
      flushRowInputs("finding-photos", state.findingPhotos, "finding",
        { "finding-desc": "desc", "finding-photo": "photo" });
      const uid = nextUid();
      state.findingPhotos.push({ uid, desc: "", photo: "" });
      scheduleUpdate(() => {
        const inp = document.querySelector(`[data-action="finding-desc"][data-finding="${uid}"]`);
        if (inp) inp.focus();
      });
    }
    else if (action === "finding-remove") {
      state.findingPhotos = state.findingPhotos.filter((f) => f.uid !== el.dataset.finding); scheduleUpdate();
    }
    else if (action === "sketch-add") {
      // כמו בממצאים: לחיצה אחת שומרת ופותחת שורה חדשה. קוד הסקיצה מקבל כברירת
      // מחדל את המספר הרץ הבא (001, 002, …) לפי הקוד המספרי הגבוה ביותר
      // הקיים כרגע — ונשאר ניתן לעריכה מלאה.
      flushRowInputs("sketches", state.sketches, "sketch",
        { "sketch-code": "code", "sketch-caption": "caption" });
      let maxCode = 0;
      for (const s of state.sketches) {
        const n = parseInt((s.code || "").trim(), 10);
        if (!isNaN(n) && n > maxCode) maxCode = n;
      }
      const uid = nextUid();
      state.sketches.push({ uid, code: String(maxCode + 1).padStart(3, "0"), caption: "" });
      scheduleUpdate(() => {
        const inp = document.querySelector(`[data-action="sketch-caption"][data-sketch="${uid}"]`);
        if (inp) inp.focus();
      });
    }
    else if (action === "sketch-remove") {
      state.sketches = state.sketches.filter((s) => s.uid !== el.dataset.sketch); scheduleUpdate();
    }
    else if (action === "note-add" && NOTE_LISTS.includes(el.dataset.list)) {
      // אותה בעיה בדיוק שתוקנה בממצאים ובסקיצות — ההערה שהוקלדה זה עתה אבדה
      // אם ה-change לא הספיק להירשם לפני הלחיצה על "הוסף הערה"
      const list = el.dataset.list;
      flushRowInputs(NOTE_CONTAINERS[list], state[list], "note",
        { "note-date": "date", "note-text": "text" });
      const uid = nextUid();
      state[list].push({ uid, date: todayISO(), text: "" });
      scheduleUpdate(() => {
        const inp = document.querySelector(`[data-action="note-text"][data-note="${uid}"]`);
        if (inp) inp.focus();
      });
    }
    else if (action === "note-remove" && NOTE_LISTS.includes(el.dataset.list)) {
      const list = el.dataset.list;
      state[list] = state[list].filter((n) => n.uid !== el.dataset.note); scheduleUpdate();
    }
    else if (action === "comp-remove") {
      const f = findComp(compUid);
      if (f && confirm(`למחוק את הרכיב "${f.comp.name}" על כל הפגמים שלו?`)) {
        f.span.components = f.span.components.filter((c) => c.uid !== compUid); scheduleUpdate();
      }
    }
    else if (action === "comp-intact") {
      const f = findComp(compUid);
      if (f) {
        const hasReal = f.comp.defects.some((d) => d.note !== "רכיב תקין");
        if (hasReal && !confirm('סימון "רכיב תקין" ימחק את כל רשומות הפגם הקיימות ברכיב. להמשיך?')) return;
        f.comp.defects = [{ uid: nextUid(), family: null, def: null, sub: f.comp.subs[0].id, s: 1, ex: "A", note: "רכיב תקין", photo: "" }];
        scheduleUpdate();
      }
    }
    else if (action === "sub-add") {
      const f = findComp(compUid);
      if (f) { f.comp.subs.push({ id: f.comp.subs.length + 1, size: 1, size2: null, note: "" }); scheduleUpdate(); }
    }
    else if (action === "sub-clone") {
      // שכפול תת-רכיב: מידה + הערה + כל הפגמים המשויכים אליו — ואז רק עורכים
      const f = findComp(compUid);
      const src = f && f.comp.subs.find((s) => s.id === +el.dataset.sub);
      if (src) {
        const newId = f.comp.subs.length + 1;
        f.comp.subs.push({ id: newId, size: src.size, size2: src.size2 ?? null, note: src.note || "" });
        const clones = f.comp.defects.filter((d) => +d.sub === src.id)
          .map((d) => ({ ...d, uid: nextUid(), sub: newId }));
        f.comp.defects.push(...clones);
        scheduleUpdate(() => {
          const inp = document.querySelector(`[data-comp="${compUid}"] input[data-action="sub-size"][data-sub="${newId}"]`);
          if (inp) { inp.focus(); inp.select(); }
        });
      }
    }
    else if (action === "sub-remove") {
      const f = findComp(compUid);
      if (f) {
        const removedId = +el.dataset.sub;
        const remaining = f.comp.subs.filter((s) => s.id !== removedId);
        const idMap = {};                       // מיפוי מזהים ישנים → חדשים,
        remaining.forEach((s, i) => { idMap[s.id] = i + 1; });  // כדי שהפניות הפגמים לא יזוזו
        f.comp.subs = remaining.map((s, i) => ({ ...s, id: i + 1 }));
        f.comp.defects = f.comp.defects
          .filter((d) => +d.sub !== removedId)
          .map((d) => ({ ...d, sub: idMap[+d.sub] || 1 }));
        scheduleUpdate();
      }
    }
    else if (action === "defect-open") openDefectForm(compUid);
    else if (action === "defect-remove") {
      const f = findComp(compUid);
      if (f) { f.comp.defects = f.comp.defects.filter((d) => d.uid !== el.dataset.defect); scheduleUpdate(); }
    }
    else if (action === "draft-save") saveDraft();
    else if (action === "draft-cancel") { ui.openDefectForm = null; ui.draft = null; scheduleUpdate(); }
  });

  document.body.addEventListener("change", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const compEl = el.closest("[data-comp]");
    const compUid = compEl ? compEl.dataset.comp : null;
    if (action === "finding-desc") {
      const f = state.findingPhotos.find((x) => x.uid === el.dataset.finding);
      if (f) { f.desc = el.value; scheduleUpdate(); }
    }
    else if (action === "finding-photo") {
      const f = state.findingPhotos.find((x) => x.uid === el.dataset.finding);
      if (f) { f.photo = el.value; scheduleUpdate(); }
    }
    else if (action === "sketch-code") {
      const s = state.sketches.find((x) => x.uid === el.dataset.sketch);
      if (s) { s.code = el.value; scheduleUpdate(); }
    }
    else if (action === "sketch-caption") {
      const s = state.sketches.find((x) => x.uid === el.dataset.sketch);
      if (s) { s.caption = el.value; scheduleUpdate(); }
    }
    else if (action === "note-date" && NOTE_LISTS.includes(el.dataset.list)) {
      const n = state[el.dataset.list].find((x) => x.uid === el.dataset.note);
      if (n) { n.date = el.value; scheduleUpdate(); }
    }
    else if (action === "note-text" && NOTE_LISTS.includes(el.dataset.list)) {
      const n = state[el.dataset.list].find((x) => x.uid === el.dataset.note);
      if (n) { n.text = el.value; scheduleUpdate(); }
    }
    else if (action === "idcard-field") { state.idCard[el.dataset.code] = el.value; scheduleUpdate(); }
    else if (action === "idcard-photo") { state.idCardMainPhoto = el.value; scheduleUpdate(); }
    else if (action === "prev-insp-date") { state.prevInspDate = el.value; scheduleUpdate(); }
    else if (action === "span-dim") {
      const span = state.spans.find((s) => s.id === +el.dataset.span);
      if (span) { span.dim = el.value; scheduleUpdate(); }
    }
    else if (action === "span-dim-note") {
      const span = state.spans.find((s) => s.id === +el.dataset.span);
      if (span) { span.dimNote = el.value; scheduleUpdate(); }
    }
    else if (action === "comp-surveyed") {
      const f = findComp(compUid);
      if (f) { f.comp.surveyed = el.checked; scheduleUpdate(); }
    }
    else if (action === "comp-qty") {
      // "כמות רכיבים": מספר תתי-הרכיבים בפועל (למשל 3 קורות ראשיות = 3) —
      // הטבלה מתעדכנת אוטומטית ל-N שורות במקום להוסיף אותן אחת-אחת.
      // תתי-רכיבים תמיד ממוספרים 1..N ברצף (ר' sub-remove), לכן הגדלה/הקטנה
      // היא תמיד בסוף הרשימה ולא דורשת מיפוי מזהים מחדש.
      const f = findComp(compUid);
      if (f) {
        const cur = f.comp.subs.length;
        const n = Math.max(1, Math.min(200, +el.value || 1));
        if (n === cur) { scheduleUpdate(); return; }
        if (n > cur) {
          for (let i = cur; i < n; i++) f.comp.subs.push({ id: i + 1, size: 1, size2: null, note: "" });
        } else {
          const removed = f.comp.subs.slice(n);
          const removedIds = new Set(removed.map((s) => s.id));
          const hasData = removed.some((s) => s.size !== 1 || s.size2 != null || s.note) ||
            f.comp.defects.some((d) => removedIds.has(+d.sub));
          if (hasData && !confirm(`הקטנת הכמות ל-${n} תמחק לצמיתות ${cur - n} רכיב/ים ואת הפגמים המשויכים אליהם. להמשיך?`)) {
            el.value = cur; return;
          }
          f.comp.subs = f.comp.subs.slice(0, n);
          f.comp.defects = f.comp.defects.filter((d) => !removedIds.has(+d.sub));
        }
        scheduleUpdate();
      }
    }
    else if (action === "sub-size") {
      const f = findComp(compUid);
      if (f) {
        const sub = f.comp.subs.find((s) => s.id === +el.dataset.sub);
        if (sub) { sub.size = +el.value || 0; scheduleUpdate(); }
      }
    }
    else if (action === "sub-size2") {
      const f = findComp(compUid);
      if (f) {
        const sub = f.comp.subs.find((s) => s.id === +el.dataset.sub);
        if (sub) { sub.size2 = el.value === "" ? null : +el.value || 0; scheduleUpdate(); }
      }
    }
    else if (action === "sub-note") {
      const f = findComp(compUid);
      if (f) {
        const sub = f.comp.subs.find((s) => s.id === +el.dataset.sub);
        if (sub) { sub.note = el.value; scheduleUpdate(); }
      }
    }
    else if (action === "defect-photo") {
      const f = findComp(compUid);
      if (f) {
        const d = f.comp.defects.find((x) => x.uid === el.dataset.defect);
        if (d) { d.photo = el.value; scheduleUpdate(); }
      }
    }
    else if (action === "add-comp-span") { ui.activeSpan = +el.value; ui.activeComponent = null; ui.openDefectForm = null; scheduleUpdate(); }
    else if (action === "add-comp") {
      // בחירה בקומבו = הוספה מיידית (בלי כפתור), למפתח שנבחר ב"הוספה למפתח" —
      // והפוקוס עובר קודם לכמות הרכיבים (לא למידה) כדי שסדר המילוי הטבעי
      // יהיה קודם "כמה יש" ורק אז "כמה מודד כל אחד"
      const v = el.value;
      if (v) {
        Combobox.setValue("add-comp", "");
        const uid = addComponent(v);
        if (uid) ui.activeComponent = uid;   // הרכיב החדש נבחר מיד ברשימת-האב
        scheduleUpdate(uid ? () => {
          const inp = document.querySelector(`[data-comp="${uid}"] input[data-action="comp-qty"]`);
          if (inp) { inp.focus(); inp.select(); }
        } : undefined);
      }
    }
    else if (action === "st-supertype") { state.superType = +el.value; scheduleUpdate(); }
    else if (action === "st-tunneltype") { state.tunnelType = el.value === "none" || el.value === "" ? null : +el.value; scheduleUpdate(); }
    else if (action.startsWith("draft-")) draftChanged(action, el.value);
  });

  // סרגל כלים
  document.getElementById("btn-example").addEventListener("click", () => {
    if (!hasAnyComponents() || confirm("טעינת הדוגמה תחליף את הנתונים הנוכחיים. להמשיך?")) loadExample();
  });
  async function runExport(btnId, label, fn) {
    const btn = document.getElementById(btnId);
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = "⏳ מכין…";
    try { await fn(); }
    catch (err) { alert(`${label} נכשל: ${err.message} — נסה שוב או השתמש בהדפסת דוח.`); }
    finally { btn.disabled = false; btn.textContent = orig; }
  }
  document.getElementById("btn-pdf-report").addEventListener("click", () =>
    runExport("btn-pdf-report", "ייצוא הדוח", () => PdfExport.exportReport()));
  document.getElementById("btn-pdf-summary").addEventListener("click", () =>
    runExport("btn-pdf-summary", "ייצוא התקציר", () => PdfExport.exportSummary()));
  document.getElementById("btn-pdf-idcard").addEventListener("click", () =>
    runExport("btn-pdf-idcard", "ייצוא תעודת הזהות", () => PdfExport.exportIdCard()));
  document.getElementById("btn-pdf-zip").addEventListener("click", () =>
    runExport("btn-pdf-zip", "ייצוא ה-ZIP", () => PdfExport.exportZip()));
  document.getElementById("btn-print").addEventListener("click", () => window.print());

  document.getElementById("btn-load-file").addEventListener("click", () => document.getElementById("load-file-input").click());
  document.getElementById("load-file-input").addEventListener("change", (e) => {
    if (e.target.files[0]) loadStateFromFile(e.target.files[0]);
    e.target.value = "";
  });

  document.getElementById("btn-attach").addEventListener("click", () => document.getElementById("attach-dir-input").click());
  document.getElementById("btn-attach-files").addEventListener("click", () => document.getElementById("attach-files-input").click());
  document.getElementById("attach-dir-input").addEventListener("change", (e) => {
    if (e.target.files.length) attachFolder(e.target.files);
    e.target.value = "";
  });
  document.getElementById("attach-files-input").addEventListener("change", (e) => {
    if (e.target.files.length) attachFolder(e.target.files);
    e.target.value = "";
  });
  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm("לאפס את כל הנתונים? גם הקבצים המצורפים בסשן הנוכחי ינותקו.")) return;
    state = defaultState();
    // מצב ה-session מתאפס יחד עם הנתונים: אחרת תגיות "צורף"/"✔ קובץ הועלה"
    // ימשיכו להצהיר על קבצים של המבנה הקודם
    photoStore.clear();
    drawingsFileAttached = false;
    ui.activeSpan = 1; ui.activeComponent = null; ui.activeTab = "general";
    ui.idCardTab = "general"; ui.openDefectForm = null;
    update();
  });

  document.getElementById("btn-scan-qr").addEventListener("click", startQrScan);
  document.getElementById("qr-scan-close").addEventListener("click", closeQrScan);
  document.getElementById("qr-file-btn").addEventListener("click", () => document.getElementById("qr-file-input").click());
  document.getElementById("qr-file-input").addEventListener("change", (e) => {
    for (const f of e.target.files) scanQrFromFile(f);   // דוח גדול = כמה קודים
    e.target.value = "";
  });

  // קיפול <details> מיושם דרך ::details-content ולא ניתן לביטול ב-CSS —
  // לכן פותחים כל פאנל מקופל לפני הדפסה ומחזירים את מצבו אחריה, אחרת
  // דוח מודפס של פאנל מקופל היה יוצא כותרת בלי תוכן.
  let reopenAfterPrint = [];
  window.addEventListener("beforeprint", () => {
    reopenAfterPrint = [...document.querySelectorAll(".panel:not([open])")];
    for (const p of reopenAfterPrint) p.open = true;
  });
  window.addEventListener("afterprint", () => {
    for (const p of reopenAfterPrint) p.open = false;
    reopenAfterPrint = [];
  });

  update();
}

document.addEventListener("DOMContentLoaded", init);
