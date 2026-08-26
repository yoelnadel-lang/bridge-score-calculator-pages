// ============================================================================
// app.js — ניהול מצב, אירועים, שמירה מקומית וחיווט הכל יחד
// ============================================================================
"use strict";

const STORAGE_KEY = "bridge-score-state-v1";
const MAX_SPANS = 30;
let uidCounter = 1;
const nextUid = () => "u" + uidCounter++;

let state = defaultState();
const ui = { activeSpan: 1, openDefectForm: null, draft: null };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultState() {
  return {
    name: "", number: "", structureClass: "BRG", superType: 4, tunnelType: null,
    inspClass: "", inspDate: todayISO(),
    spanCount: 1, spans: [{ id: 1, dim: "", dimNote: "", components: [] }],
  };
}

// השלמת שדות שנוספו בגרסאות חדשות למצב שמור ישן (localStorage)
function migrateState(s) {
  const out = { ...defaultState(), ...s };
  if (!out.inspDate) out.inspDate = todayISO();
  if (out.inspClass == null) out.inspClass = "";
  out.spans = (out.spans || []).map((sp) => ({
    dimNote: "", ...sp,
    components: (sp.components || []).map((c) => ({
      ...c, subs: (c.subs || []).map((su) => ({ note: "", ...su })),
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
  activeSpanObj().components.push({
    uid, catalogId: displayId, name, importance: def.imp, unit, unit2,
    surveyed: true, subs: [{ id: 1, size: 1, note: "" }], defects: [],
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
  document.getElementById("st-name").value = state.name;
  document.getElementById("st-number").value = state.number;
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
  updateInspection();
  document.getElementById("wrap-supertype").hidden = !(state.structureClass === "BRG" || state.structureClass === "CLV");
  document.getElementById("wrap-tunneltype").hidden = state.structureClass !== "TUN";
  document.getElementById("span-dims").innerHTML = renderSpanDims(state);
  document.getElementById("span-rule-hint").textContent =
    state.spanCount <= 2
      ? "מבנה בעל מפתח אחד או שניים נסקר ומחושב כיחידה אחת (משוואה 6.1) — אין צורך במימדי שקלול."
      : "מבנה בעל 3 מפתחים ומעלה: ציון לכל מפתח בנפרד ושקלול לפי המימד (משוואה 6.2). הזן מימד לכל מפתח.";

  document.getElementById("add-comp-combo").innerHTML = Combobox.html({
    id: "add-comp", action: "add-comp", options: componentComboOptions(state),
    placeholder: "— בחר רכיב מהקטלוג (הקלד קוד או שם) —",
  });
  document.getElementById("span-tabs").innerHTML = renderSpanTabs(state, ui.activeSpan);
  document.getElementById("comp-list").innerHTML = renderComponentList(activeSpanObj(), ui);

  let result = null, summary = null;
  if (hasAnyComponents()) {
    const input = buildEngineInput();
    result = Calc.computeStructure(input);
    summary = Calc.executiveSummary(input, result);
  }
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
  st.superType = fx.superstructureType;
  st.spanCount = fx.spans.length;
  st.spans = fx.spans.map((span, i) => ({
    id: span.span, dim: Math.round(fx.deckAreas[i] * 100) / 100, dimNote: "",
    components: span.components.map((c) => {
      const comp = {
        uid: nextUid(), catalogId: null, name: c.name, importance: c.importance,
        unit: null, unit2: null, surveyed: true,
        subs: c.subs.map((s) => ({ id: s.id, size: s.size, note: "" })), defects: [],
      };
      comp.defects = span.defects.filter((d) => d.comp === c.name).map((d) => ({
        uid: nextUid(), family: d.def ? +String(d.def).split(".")[0] : null,
        def: d.def ? String(+String(d.def).split(".")[0]) + "." + String(+String(d.def).split(".")[1] || 0) : null,
        sub: d.sub, s: d.s, ex: d.ex, note: "", photo: "",
      }));
      return comp;
    }),
  }));
  state = st; ui.activeSpan = 1; ui.openDefectForm = null;
  update();
  document.getElementById("sec-results").scrollIntoView({ behavior: "smooth" });
}

// --- מועד סקירה הבאה (מוצג בפרטי המבנה, מחושב מה-state) ---
function updateInspection() {
  const out = document.getElementById("insp-result");
  if (state.inspClass === "" || state.inspClass == null || !state.inspDate) {
    out.textContent = "בחר סיווג לסקירה כדי לקבל אוטומטית את מועד הסקירה הבאה.";
    return;
  }
  const freq = INSPECTION_FREQUENCIES[+state.inspClass];
  const base = new Date(state.inspDate);
  const maxDate = new Date(base); maxDate.setFullYear(maxDate.getFullYear() + freq.years);
  const defDate = new Date(base); defDate.setMonth(defDate.getMonth() + DEFAULT_NEXT_INSPECTION_MONTHS);
  const effective = defDate < maxDate ? defDate : maxDate;
  const f = (d) => d.toLocaleDateString("he-IL");
  out.innerHTML = `מרווח מירבי לסיווג זה: <strong>${freq.years} שנים</strong> (עד ${f(maxDate)}) ·
    ברירת המחדל בטופס: 24 חודשים (${f(defDate)}) ·
    <strong>מועד מומלץ לסקירה הבאה: ${f(effective)}</strong>
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
  if (saved) { try { state = migrateState(JSON.parse(saved)); uidCounter = 10000; } catch (e) { /* מצב פגום — מתחילים נקי */ } }

  // שדות המבנה
  document.getElementById("st-name").addEventListener("input", (e) => { state.name = e.target.value; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); });
  document.getElementById("st-number").addEventListener("input", (e) => { state.number = e.target.value; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); });
  document.getElementById("st-class").addEventListener("change", (e) => { state.structureClass = e.target.value; scheduleUpdate(); });
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
    if (action === "span-tab") { ui.activeSpan = +el.dataset.span; ui.openDefectForm = null; scheduleUpdate(); }
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
      if (f) { f.comp.subs.push({ id: f.comp.subs.length + 1, size: 1, note: "" }); scheduleUpdate(); }
    }
    else if (action === "sub-clone") {
      // שכפול תת-רכיב: מידה + הערה + כל הפגמים המשויכים אליו — ואז רק עורכים
      const f = findComp(compUid);
      const src = f && f.comp.subs.find((s) => s.id === +el.dataset.sub);
      if (src) {
        const newId = f.comp.subs.length + 1;
        f.comp.subs.push({ id: newId, size: src.size, note: src.note || "" });
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
    if (action === "span-dim") {
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
    else if (action === "sub-size") {
      const f = findComp(compUid);
      if (f) {
        const sub = f.comp.subs.find((s) => s.id === +el.dataset.sub);
        if (sub) { sub.size = +el.value || 0; scheduleUpdate(); }
      }
    }
    else if (action === "sub-note") {
      const f = findComp(compUid);
      if (f) {
        const sub = f.comp.subs.find((s) => s.id === +el.dataset.sub);
        if (sub) { sub.note = el.value; scheduleUpdate(); }
      }
    }
    else if (action === "add-comp") {
      // בחירה בקומבו = הוספה מיידית (בלי כפתור) — והפוקוס עובר למידת הרכיב החדש
      const v = el.value;
      if (v) {
        Combobox.setValue("add-comp", "");
        const uid = addComponent(v);
        scheduleUpdate(uid ? () => {
          const inp = document.querySelector(`[data-comp="${uid}"] input[data-action="sub-size"]`);
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
  document.getElementById("btn-pdf").addEventListener("click", async () => {
    const btn = document.getElementById("btn-pdf");
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = "⏳ מכין PDF…";
    try { await PdfExport.exportPdf(); }
    catch (err) { alert("יצירת ה-PDF נכשלה: " + err.message + " — נסה שוב או השתמש בהדפסת דוח."); }
    finally { btn.disabled = false; btn.textContent = orig; }
  });
  document.getElementById("btn-print").addEventListener("click", () => window.print());
  document.getElementById("btn-reset").addEventListener("click", () => {
    if (confirm("לאפס את כל הנתונים?")) { state = defaultState(); ui.activeSpan = 1; ui.openDefectForm = null; update(); }
  });

  update();
}

document.addEventListener("DOMContentLoaded", init);
