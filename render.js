// ============================================================================
// render.js — פונקציות בניית HTML (ללא state; מקבלות נתונים ומחזירות מחרוזות)
// ============================================================================
"use strict";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt(v, digits = 2) {
  return v == null || isNaN(v) ? "—" : (+v).toFixed(digits);
}

// --- breadcrumb עליון ---
function renderBreadcrumb(state) {
  const parts = ["🏠 מחשבון ציוני מבנים"];
  parts.push(state.name ? esc(state.name) : "מבנה חדש");
  if (state.number) parts.push(esc(state.number));
  return parts.join(" &nbsp;›&nbsp; ");
}

// --- תגית סטטוס לקוד תמונה/סקיצה אחד: ירוק אם צורף קובץ תואם, אפור אם לא ---
function photoChip(photoStore, code) {
  const ok = photoStore.has(code);
  return `<span class="photo-chip ${ok ? "ok" : "missing"}" title="${ok ? "צורף" : "לא צורף עדיין"}">${esc(code)}</span>`;
}
function photoCodesCell(photoStore, photoField) {
  const codes = parsePhotoCodes(photoField);
  // dir="ltr" — בלי זה סדר הקודים מתהפך ויזואלית בתוך הקשר RTL (למשל "4;99")
  return codes.length ? `<span dir="ltr">${codes.map((c) => photoChip(photoStore, c)).join(" ")}</span>` : "";
}

// --- תיעוד ממצאים: תמונות תיעוד כלליות, לא קשורות לרכיב ספציפי ---
function renderFindingPhotos(state, photoStore) {
  const rows = state.findingPhotos.map((f) => `<tr>
    <td><input type="text" value="${esc(f.desc)}" data-action="finding-desc" data-finding="${f.uid}" placeholder="למשל: תמונה כללית"></td>
    <td><input type="text" value="${esc(f.photo)}" data-action="finding-photo" data-finding="${f.uid}" placeholder="קוד תמונה, אפשר כמה מופרדים ב-;" dir="ltr"></td>
    <td>${photoCodesCell(photoStore, f.photo)}</td>
    <td><button class="btn btn-sm btn-danger" data-action="finding-remove" data-finding="${f.uid}">✕</button></td>
  </tr>`).join("");
  return `<table class="subs-table"><tr><th>תיאור</th><th>קוד תמונה</th><th>סטטוס</th><th></th></tr>${rows}</table>
    <button class="btn btn-sm" data-action="finding-add">➕ הוסף שורת תיעוד</button>`;
}

// --- סקיצות: מיפוי קוד סקיצה לכותרת שתופיע בנספח התרשימים ---
function renderSketches(state, photoStore) {
  const rows = state.sketches.map((s) => {
    const code = (s.code || "").trim();
    return `<tr>
      <td><input type="text" value="${esc(s.code)}" data-action="sketch-code" data-sketch="${s.uid}" placeholder="001" dir="ltr"></td>
      <td><input type="text" value="${esc(s.caption)}" data-action="sketch-caption" data-sketch="${s.uid}" placeholder="למשל: תנוחה"></td>
      <td>${code ? photoChip(photoStore, code) : ""}</td>
      <td><button class="btn btn-sm btn-danger" data-action="sketch-remove" data-sketch="${s.uid}">✕</button></td>
    </tr>`;
  }).join("");
  return `<table class="subs-table"><tr><th>קוד סקיצה</th><th>כותרת</th><th>סטטוס</th><th></th></tr>${rows}</table>
    <button class="btn btn-sm" data-action="sketch-add">➕ הוסף סקיצה</button>`;
}

// --- טבלת הערות חופשיות (תאריך + טקסט) — משותפת ל-שינויים/סוקר/מהנדס/תקשורת ---
function renderNotesTable(notes, listKey) {
  const rows = notes.map((n) => `<tr>
    <td><input type="date" value="${esc(n.date)}" data-action="note-date" data-list="${listKey}" data-note="${n.uid}"></td>
    <td><input type="text" value="${esc(n.text)}" data-action="note-text" data-list="${listKey}" data-note="${n.uid}" placeholder="הערה חופשית"></td>
    <td><button class="btn btn-sm btn-danger" data-action="note-remove" data-list="${listKey}" data-note="${n.uid}">✕</button></td>
  </tr>`).join("");
  return `<table class="subs-table"><tr><th>תאריך</th><th>הערה</th><th></th></tr>${rows}</table>
    <button class="btn btn-sm" data-action="note-add" data-list="${listKey}">➕ הוסף הערה</button>`;
}

// ============================================================================
// תעודת זהות לגשר ומובל (ת.ז) — מהדורה 6-2008
// ============================================================================
function renderIdCardTabs(activeGroup) {
  return ID_CARD_GROUPS.map((g) =>
    `<button class="tab ${g.id === activeGroup ? "active" : ""}" data-action="idcard-tab" data-group="${g.id}">${esc(g.label)}</button>`
  ).join("");
}

// שדות שנמשכים אוטומטית מלשוניות אחרות — תצוגה בלבד, לפי הקבוצה הפעילה
// (סעיף 1/2 ב"כללי", סעיף 4 ב"נתונים גיאומטריים", סעיפים 10/13 ב"מדדי מצב").
function idCardAutoFields(groupId, state, result) {
  if (groupId === "general") {
    return [
      { code: "1.1", label: "מספר המבנה", value: state.number },
      { code: "1.2", label: "שם המבנה", value: state.name },
      { code: "2.1", label: "קבוצת סווג ראשית", value: state.structureClass },
    ];
  }
  if (groupId === "geometry") {
    return [{ code: "4.1", label: "מספר מפתחים", value: state.spanCount }];
  }
  if (groupId === "indices") {
    const freq = state.inspClass !== "" && state.inspClass != null ? INSPECTION_FREQUENCIES[+state.inspClass] : null;
    return [
      { code: "10.1", label: "Condition PIav", value: result ? fmt(result.bridge.method_norm.cpiAv) : "—" },
      { code: "10.2", label: "Condition PIcrit", value: result ? fmt(result.bridge.cpiCrit) : "—" },
      { code: "13.1", label: "סיווג לסקירה", value: freq ? freq.label : "—" },
      { code: "13.2", label: "תאריך ביצוע סקירה (קודמת)", value: state.prevInspDate || "—" },
      { code: "13.3", label: "תאריך ביצוע סקירה (נוכחית)", value: state.inspDate || "—" },
      { code: "13.4", label: "תדירות ביצוע סקירה שגרתית [חודש]", value: DEFAULT_NEXT_INSPECTION_MONTHS },
    ];
  }
  return [];
}

function renderIdCardGroup(groupId, state, result) {
  const group = ID_CARD_GROUPS.find((g) => g.id === groupId) || ID_CARD_GROUPS[0];
  const auto = idCardAutoFields(groupId, state, result).map(({ code, label, value }) => `
    <label>${esc(code)} ${esc(label)} <span class="hint">(נמשך אוטומטית)</span>
      <input type="text" value="${esc(value)}" readonly>
    </label>`).join("");
  const editable = group.fields.map((f) => `
    <label>${esc(f.code)} ${esc(f.label)}
      <input type="${f.type === "date" ? "date" : "text"}" value="${esc(state.idCard[f.code] || "")}"
        data-action="idcard-field" data-code="${esc(f.code)}">
    </label>`).join("");
  return `<div class="grid-2">${auto}${editable}</div>`;
}

// --- קטלוג הרכיבים כאפשרויות קומבו מקובצות ---
// רכיבים דינמיים (1 ראשי / 3 משני) מוצגים עם הקוד מטבלה 2/6 לפי סוג המבנה
// שנבחר — כך הקלדת "1.4" מביאה ישירות את "1.4 קורה ראשית".
function componentComboOptions(state) {
  const catalog = COMPONENT_CATALOGS[state.structureClass] || [];
  const isTun = state.structureClass === "TUN";
  const types = isTun ? TUNNEL_TYPES : SUPERSTRUCTURE_TYPES;
  const t = types.find((x) => x.id === +(isTun ? state.tunnelType : state.superType));
  return catalog.map((c) => {
    const impLabel = c.imp ? IMPORTANCE[c.imp].label : "רכיב עזר — לא נכלל בציון";
    let code = c.id, name = c.name, unit = c.unit;
    const part = c.dynamic && t ? t[c.dynamic === "main" ? "main" : "secondary"] : null;
    if (part) {
      code = part.code; unit = part.unit;
      name = `${part.name} — ${c.dynamic === "main" ? "רכיב ראשי" : "רכיב משני"} לפי ${isTun ? "טבלה 6" : "טבלה 2"}`;
    }
    return { value: c.id, label: `${code}. ${name} (${impLabel} · ${unit})`, group: c.group };
  });
}

// --- שדות מימדי המפתחים ---
function renderSpanDims(state) {
  const cls = STRUCTURE_CLASSES[state.structureClass];
  if (state.spanCount <= 2) return "";
  let html = `<table class="subs-table"><tr><th>מפתח</th><th>${esc(cls.dimLabel)}</th><th>הערה — איך חושבה המידה</th></tr>`;
  for (const span of state.spans) {
    html += `<tr><td>מפתח ${span.id}</td>
      <td><input type="number" min="0" step="any" value="${esc(span.dim)}"
        data-action="span-dim" data-span="${span.id}" placeholder="0"></td>
      <td><input type="text" class="note-input" value="${esc(span.dimNote || "")}"
        data-action="span-dim-note" data-span="${span.id}" placeholder="זכרון ארגוני — לא משפיע על החישוב"></td></tr>`;
  }
  return html + "</table>";
}

// --- טאבים של מפתחים ---
function renderSpanTabs(state, activeSpan) {
  if (state.spanCount === 1)
    return '<button class="tab active" data-action="span-tab" data-span="1">המבנה כולו</button>';
  return state.spans.map((s) =>
    `<button class="tab ${s.id === activeSpan ? "active" : ""}" data-action="span-tab" data-span="${s.id}">מפתח ${s.id}</button>`
  ).join("");
}

// --- כל פגמי הפנקס בקומבו אחד — הקלדת קוד ("14.1") או שם מביאה את הפגם ---
function allDefectComboOptions() {
  const famName = {};
  for (const f of DEFECT_CATALOG.families) famName[f.id] = `${f.id}. ${f.he}`;
  return DEFECT_CATALOG.defects.map((d) => ({
    value: d.code, label: `${d.code} — ${d.name_he}`, group: famName[d.family] || "",
  }));
}

// --- טופס הוספת פגם ---
function renderDefectForm(comp, draft) {
  const catalogDefect = DEFECT_CATALOG.defects.find((d) => d.code === draft.def) || null;
  const severities = catalogDefect ? catalogDefect.available_severities : [1, 2, 3, 4, 5];
  const sevTexts = (n) => {
    if (catalogDefect && catalogDefect.severities[String(n)])
      return catalogDefect.severities[String(n)].join(" ");
    return SEVERITY_GENERIC[n];
  };
  const isUnit = comp.unit === "יח'";
  const exOptions = Object.entries(EXTENT).map(([k, v]) => {
    const disabled = (k === "A" && draft.s > 1) || (isUnit && draft.s > 1 && k !== "B");
    return `<option value="${k}" ${k === draft.ex ? "selected" : ""} ${disabled ? "disabled" : ""}>
      ${k} — ${esc(v.label)} (${esc(v.pct)})</option>`;
  }).join("");
  const subOptions = comp.subs.map((s) =>
    `<option value="${s.id}" ${s.id === +draft.sub ? "selected" : ""}>תת-רכיב ${s.id}</option>`
  ).join("");
  const errors = Calc.validateDefect(+draft.s || 1, draft.ex, comp.unit);

  const family = catalogDefect ? DEFECT_CATALOG.families.find((f) => f.id === catalogDefect.family) : null;
  const short = (t) => (t.length > 90 ? t.slice(0, 87) + "…" : t);
  const sevOptions = severities.map((n) =>
    `<option value="${n}" ${+draft.s === n ? "selected" : ""}>${n} — ${esc(short(sevTexts(n)))}</option>`
  ).join("");
  return `<div class="defect-form" data-comp="${comp.uid}">
    <strong>הוספת פגם — לפי הפנקס לסוקר</strong>
    <div class="grid-2">
      <label>הפגם — הקלד קוד (למשל 14.1) או שם
        ${Combobox.html({ id: "draft-def", action: "draft-def", value: draft.def,
          options: allDefectComboOptions(), placeholder: 'הקלד קוד ("14.1") או שם פגם…' })}
        ${family ? `<span class="hint">משפחה: ${esc(family.id + ". " + family.he)}</span>` : ""}
      </label>
      <label>תת-רכיב
        <select data-action="draft-sub">${subOptions}</select>
      </label>
      ${draft.def ? `<label>דרגת חומרה (S)
        <select data-action="draft-s">${sevOptions}</select>
        <span class="hint">${esc(sevTexts(+draft.s) || "")}</span>
      </label>
      <label>היקף הנזק (Ex)
        <select data-action="draft-ex">${exOptions}</select>
        ${isUnit ? '<span class="hint">רכיב ביחידת "יח\'" — היקף B קבוע (או A לתקין)</span>' : ""}
      </label>` : ""}
    </div>
    ${!draft.def ? '<p class="hint">בחר פגם כדי לראות את דרגות החומרה מהפנקס.</p>' : ""}
    ${+draft.s === 5 ? '<p class="warn">חומרה 5 = כשל: הרכיב יקבל ECS = 5.0 ללא תלות בהיקף</p>' : ""}
    <div class="grid-2">
      <label>הערות / מידות הפגם <input type="text" data-action="draft-note" value="${esc(draft.note)}"></label>
      <label>קוד תמונה <input type="text" data-action="draft-photo" value="${esc(draft.photo)}" dir="ltr"
        placeholder="למשל 14 — כמה תמונות: 14;153"></label>
    </div>
    ${errors.length ? `<p class="error-text">⚠ ${errors.map(esc).join(" · ")}</p>` : ""}
    <div class="add-row" style="margin:8px 0 0">
      <button class="btn btn-primary btn-sm" data-action="draft-save" ${errors.length || !draft.def ? "disabled" : ""}>💾 שמור פגם</button>
      <button class="btn btn-sm" data-action="draft-cancel">ביטול</button>
    </div>
  </div>`;
}

// --- כרטיס רכיב ---
function renderComponent(comp, ui, photoStore) {
  const impLabel = comp.importance ? IMPORTANCE[comp.importance].label : "רכיב עזר";
  const badgeCls = comp.importance === "veryHigh" ? "badge-vh" : comp.importance ? "" : "badge-aux";
  const defectRows = comp.defects.map((d) => {
    const cat = DEFECT_CATALOG.defects.find((x) => x.code === d.def);
    return `<tr>
      <td>${esc(d.def || "—")}</td>
      <td>${esc(cat ? cat.name_he : d.note === "רכיב תקין" ? "רכיב תקין" : "")}</td>
      <td>${d.sub}</td><td>${d.s}</td><td>${esc(d.ex)}</td>
      <td>${esc(d.note || "")}</td>
      <td><input type="text" class="note-input" value="${esc(d.photo)}" data-action="defect-photo" data-defect="${d.uid}"
        placeholder="קוד, אפשר כמה מופרדים ב-;" dir="ltr" style="width:110px"></td>
      <td>${photoCodesCell(photoStore, d.photo)}</td>
      <td><button class="btn btn-sm btn-danger" data-action="defect-remove" data-defect="${d.uid}">✕</button></td>
    </tr>`;
  }).join("");

  const subRows = comp.subs.map((s) => `
    <tr><td>תת-רכיב ${s.id}</td>
      <td><input type="number" min="0" step="any" value="${esc(s.size)}" data-action="sub-size" data-sub="${s.id}"></td>
      <td><input type="text" class="note-input" value="${esc(s.note || "")}" data-action="sub-note" data-sub="${s.id}"
        placeholder="זכרון ארגוני — לא משפיע על החישוב"></td>
      <td class="sub-actions">
        <button class="btn btn-sm" data-action="sub-clone" data-sub="${s.id}" title="שכפול תת-הרכיב כולל הפגמים שלו">⧉ שכפל</button>
        ${comp.subs.length > 1 ? `<button class="btn btn-sm btn-danger" data-action="sub-remove" data-sub="${s.id}" title="מחיקת תת-הרכיב והפגמים שלו">✕</button>` : ""}
      </td>
    </tr>`).join("");

  const formOpen = ui.openDefectForm === comp.uid;
  return `<div class="comp ${comp.surveyed ? "" : "not-surveyed"}" data-comp="${comp.uid}">
    <div class="comp-head">
      <span class="comp-title">${esc(comp.catalogId != null ? comp.catalogId + ". " : "")}${esc(comp.name)}</span>
      <span class="badge ${badgeCls}">${esc(impLabel)}</span>
      <span class="badge badge-aux">${esc(comp.unit || "")}</span>
      <label style="flex-direction:row;align-items:center;gap:4px;font-size:.8rem">
        <input type="checkbox" ${comp.surveyed ? "checked" : ""} data-action="comp-surveyed"> נסקר
      </label>
      <button class="btn btn-sm" data-action="comp-intact" title="מסמן את הרכיב כתקין (1A)">✔️ רכיב תקין</button>
      <button class="btn btn-sm btn-danger" data-action="comp-remove">🗑</button>
    </div>
    <div class="comp-body">
      <div class="subs-block">
        <div class="hint">תתי-רכיבים ומידות (${comp.subs.length}) — יחידה: ${esc(comp.unit || "")}</div>
        <table class="subs-table"><tr><th>תת-רכיב</th><th>מידה [${esc(comp.unit || "")}]</th><th>הערה — איך חושבה המידה</th><th></th></tr>${subRows}</table>
        <button class="btn btn-sm" data-action="sub-add">➕ תת-רכיב</button>
      </div>
      ${comp.defects.length ? `<table class="defects-table">
        <tr><th>קוד</th><th>פגם</th><th>תת-רכיב</th><th>S</th><th>Ex</th><th>הערות</th><th>קוד תמונה</th><th>סטטוס</th><th></th></tr>
        ${defectRows}</table>` : '<p class="hint">אין רשומות פגם — רכיב ללא רשומות יחושב כתקין (1A) ויסומן בתקציר.</p>'}
      ${formOpen ? renderDefectForm(comp, ui.draft) : `<button class="btn btn-sm btn-primary" data-action="defect-open">➕ הוסף פגם</button>`}
      ${!comp.surveyed ? '<p class="warn">רכיב מסומן "לא ניתן לסקירה" — לא ייכלל בחישוב הציון</p>' : ""}
    </div>
  </div>`;
}

// --- רשימת-אב (משמאל): שורה תמציתית לכל רכיב, בחירה מציגה את הפירוט מימין ---
function renderComponentMasterList(span, ui) {
  if (!span || !span.components.length)
    return '<div class="comp-master-empty">אין רכיבים במפתח זה עדיין — בחר רכיב מהקטלוג למעלה.</div>';
  return span.components.map((c) => {
    const impLabel = c.importance ? IMPORTANCE[c.importance].label : "עזר";
    const badgeCls = c.importance === "veryHigh" ? "badge-vh" : c.importance ? "" : "badge-aux";
    const active = c.uid === ui.activeComponent;
    // <button> ולא <div> — מילוי רציף במקלדת הוא עקרון מוביל בכלי הזה,
    // ורשימת הרכיבים חייבת להיות נגישה ב-Tab ולא רק בעכבר
    return `<button type="button" class="comp-master-row ${active ? "active" : ""} ${c.surveyed ? "" : "not-surveyed"}"
      data-action="comp-select" data-comp="${c.uid}" aria-pressed="${active}">
      <span class="cm-name">${esc(c.catalogId != null ? c.catalogId + ". " : "")}${esc(c.name)}</span>
      <span class="badge ${badgeCls}">${esc(impLabel)}</span>
    </button>`;
  }).join("");
}

// --- פאנל פירוט (מימין): הרכיב הנבחר בלבד ---
function renderComponentDetail(span, ui, photoStore) {
  // ההודעה על מפתח ריק מוצגת ברשימת-האב — כאן נשארים ריקים כדי לא לכפול אותה
  if (!span || !span.components.length) return "";
  const comp = span.components.find((c) => c.uid === ui.activeComponent);
  if (!comp) return '<div class="comp-detail-empty">בחר רכיב מהרשימה משמאל כדי לערוך אותו.</div>';
  return renderComponent(comp, ui, photoStore);
}

// --- תוצאות ---
function scoreCardHTML(title, cpiValue, meaningRow, extra) {
  const color = meaningRow ? meaningRow.color : "#999";
  return `<div class="score-card" style="border-inline-start:6px solid ${color}">
    <h3>${esc(title)}</h3>
    <div class="score-row">
      <span class="score-big" style="color:${color}">${fmt(cpiValue)}</span>
      <span class="score-name" style="color:${color}">${meaningRow ? esc(meaningRow.name) : ""}</span>
    </div>
    ${extra || ""}
    ${meaningRow ? `<div class="score-meaning"><strong>משמעות (טבלה 15):</strong> ${esc(meaningRow.text)}</div>` : ""}
  </div>`;
}

function renderResults(state, result) {
  if (!result) return '<p class="empty-note">הזן רכיבים כדי לקבל ציון.</p>';
  const b = result.bridge;
  let html = '<div class="results-grid">';
  html += scoreCardHTML(
    "Condition PI ממוצע (CPIav) — לפי הנוהל",
    b.method_norm.cpiAv, b.meaningAv,
    `<div class="method-tag">שקלול SCS לפי משוואה 6.2 · SCSav=${fmt(b.method_norm.scsAv, 3)}</div>`
  );
  html += scoreCardHTML(
    "Condition PI קריטי (CPIcrit)",
    b.cpiCrit, b.meaningCrit,
    `<div class="method-tag">הרכיב הגרוע ביותר בחשיבות "גבוהה מאוד" · SCScrit=${fmt(b.scsCrit, 2)}</div>`
  );
  html += "</div>";

  if (!result.singleUnit) {
    html += `<table class="spans-table">
      <tr><th>מפתח</th><th>${esc(STRUCTURE_CLASSES[state.structureClass].dimLabel)}</th>
      <th>SCSav</th><th>CPIav</th><th>SCScrit</th><th>CPIcrit</th><th>מצב</th></tr>`;
    for (const s of result.spans) {
      const m = Calc.meaning(s.unit.cpiAv, MEANING_AV);
      html += `<tr><td>מפתח ${s.id}</td><td>${fmt(s.dim, 1)}</td>
        <td>${fmt(s.unit.scsAv, 3)}</td><td>${fmt(s.unit.cpiAv)}</td>
        <td>${fmt(s.unit.scsCrit, 2)}</td><td>${fmt(s.unit.cpiCrit)}</td>
        <td>${m ? `<span class="pill" style="background:${m.color}">${esc(m.name)}</span>` : "—"}</td></tr>`;
    }
    html += "</table>";
  } else if (state.spanCount === 2) {
    html += '<p class="hint">מבנה בעל שני מפתחים — נסקר ומחושב כיחידה אחת לפי הנוהל (משוואה 6.1).</p>';
  }
  return html;
}

// --- מד מהירות (0–100) — קשת צבועה לפי טווחי טבלה 15, מחט על הציון ---
function gaugeSVG(value, bands, meaningRow, title, subtitle) {
  const cx = 110, cy = 104, r = 86, W = 220, H = 118;
  const pt = (v, rad) => {
    const a = Math.PI * (1 - Math.max(0, Math.min(100, v)) / 100);  // 0→שמאל, 100→ימין
    return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)];
  };
  const asc = [...bands].sort((a, b) => a.min - b.min);
  let segs = "";
  asc.forEach((band, i) => {
    const from = band.min, to = i + 1 < asc.length ? asc[i + 1].min : 100;
    const [x1, y1] = pt(from, r), [x2, y2] = pt(to, r);
    segs += `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}"
      fill="none" stroke="${band.color}" stroke-width="18"/>`;
  });
  let ticks = "";
  for (const v of [0, ...asc.map((b) => b.min).filter((m) => m > 0), 100]) {
    const [tx, ty] = pt(v, r + 16);
    ticks += `<text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}" text-anchor="middle" font-size="10" fill="#57606a">${v}</text>`;
  }
  const has = value != null && !isNaN(value);
  let needle = "";
  if (has) {
    const [nx, ny] = pt(value, r - 20);
    needle = `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}"
        stroke="#1f2328" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="6" fill="#1f2328"/>`;
  }
  const color = meaningRow ? meaningRow.color : "#999";
  return `<div class="gauge">
    <div class="gauge-title">${esc(title)}</div>
    <div class="gauge-sub">${esc(subtitle || "")}</div>
    <svg viewBox="0 0 ${W} ${H}" dir="ltr" xmlns="http://www.w3.org/2000/svg">${segs}${ticks}${needle}</svg>
    <div class="gauge-value" style="color:${color}">${fmt(value)}</div>
    <div class="gauge-name" style="color:${color}">${meaningRow ? esc(meaningRow.name) : "הזן מימד שקלול לכל מפתח"}</div>
    ${meaningRow ? `<div class="gauge-meaning">${esc(meaningRow.text)}</div>` : ""}
  </div>`;
}

// --- תקציר מנהלים ---
function renderSummary(state, result, summary) {
  if (!result || !summary || !summary.totalScored) return '<p class="empty-note">התקציר ייווצר אוטומטית לאחר הזנת רכיבים.</p>';
  const b = result.bridge;

  let html = '<div class="summary-block">';
  html += `<h3>🏗️ זיהוי המבנה</h3><p class="summary-name">${esc(state.name || "—")}</p>`;

  // מבנה מרובה-מפתחים ללא מימדי שקלול — הציון עדיין null, אין להפיל את הרינדור
  html += `<h3>🎯 הציונים ומשמעותם</h3><div class="gauges">
    ${gaugeSVG(b.method_norm.cpiAv, MEANING_AV, b.meaningAv, "CPIav — ציון ממוצע", "לפי הנוהל, משוואה 6.2 · טבלה 15")}
    ${gaugeSVG(b.cpiCrit, MEANING_CRIT, b.meaningCrit, "CPIcrit — הרכיב הקריטי", "הרכיב הגרוע בחשיבות \"גבוהה מאוד\" · טבלה 15")}
  </div>`;

  if (summary.criticalComp) {
    const c = summary.criticalComp;
    const defs = (c.defects || []).filter((d) => d.s === c.sMax).map((d) => {
      const cat = DEFECT_CATALOG.defects.find((x) => x.code === d.def);
      return `${d.def || ""}${cat ? " — " + cat.name_he : d.note ? " — " + d.note : ""}`;
    });
    html += `<h3>🔴 הרכיב הקריטי (קובע את CPIcrit)</h3>
      <p><strong>${esc(c.name)}</strong>${result.singleUnit ? "" : ` · מפתח ${esc(c.spanId)}`}${
        defs.length ? " · פגם: " + defs.map(esc).join("; ") : ""}</p>`;
  }

  html += "</div>";
  return html;
}
