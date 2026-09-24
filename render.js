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
// תאריך ISO ("YYYY-MM-DD", כפי שנשמר מ-<input type="date">) לפורמט DD/MM/YYYY
// לתצוגה בדוחות — בלי לעבור דרך Date() כדי לא להיתקל בהזזת אזור-זמן
function fmtIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}
// אובייקט Date (למשל תאריך סקירה הבאה שמחושב מהתאריך הנוכחי) לאותו פורמט —
// שעון מקומי, עקבי עם השעון שכבר שימש לחישוב התאריך עצמו
function fmtDateDMY(d) {
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
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
// מס"ד: לא שדה בנתונים — נגזר ממיקום השורה (i+1) ומתעדכן אוטומטית בכל
// הוספה/הסרה, בדיוק כמו המספור בעמוד המקביל בדוח המודפס (buildFindingsPages).
function renderFindingPhotos(state, photoStore) {
  const rows = state.findingPhotos.map((f, i) => `<tr>
    <td class="serial-cell">
      <button type="button" class="serial-insert-btn" data-action="finding-insert-before" data-finding="${f.uid}"
        title="הוסף שורה חדשה מעל שורה זו">${i + 1}</button>
    </td>
    <td><input type="text" value="${esc(f.desc)}" data-action="finding-desc" data-finding="${f.uid}" placeholder="למשל: תמונה כללית"></td>
    <td>
      <input type="text" value="${esc(f.photo)}" data-action="finding-photo" data-finding="${f.uid}" placeholder="שם התמונה, אפשר כמה מופרדים ב-;" dir="ltr">
      ${photoCodesCell(photoStore, f.photo)}
    </td>
    <td><button class="btn btn-sm btn-danger" data-action="finding-remove" data-finding="${f.uid}">✕</button></td>
  </tr>`).join("");
  return `<table class="subs-table findings-table"><tr><th>מס"ד</th><th>תיאור הממצאים</th><th>שם התמונה</th><th></th></tr>${rows}</table>
    <button class="btn btn-sm" data-action="finding-add">➕ הוסף שורת תיעוד</button>
    <p class="hint">לחיצה על מספר שורה מוסיפה שורה חדשה וריקה מעליה.</p>`;
}

// --- סקיצות: מיפוי קוד סקיצה לכותרת שתופיע בנספח התרשימים ---
function renderSketches(state) {
  const rows = state.sketches.map((s) => `<tr>
      <td><input type="text" value="${esc(s.code)}" data-action="sketch-code" data-sketch="${s.uid}" placeholder="001" dir="ltr"></td>
      <td><input type="text" value="${esc(s.caption)}" data-action="sketch-caption" data-sketch="${s.uid}" placeholder="למשל: תנוחה"></td>
      <td><button class="btn btn-sm btn-danger" data-action="sketch-remove" data-sketch="${s.uid}">✕</button></td>
    </tr>`).join("");
  return `<table class="subs-table"><tr><th>קוד סקיצה</th><th>כותרת</th><th></th></tr>${rows}</table>
    <button class="btn btn-sm" data-action="sketch-add">➕ הוסף סקיצה</button>`;
}

// --- לוגואי מזמיני העבודה (0 עד כמה) — כל אחד תמונה ממוזערת + הסרה ---
function renderClientLogos(state) {
  if (!state.clientLogos.length) return '<span class="hint">לא נבחרו לוגואים — בדוח תודפס רק פינת הלוגו שלנו</span>';
  return `<div class="client-logos-row">${state.clientLogos.map((url, i) => `
    <span class="client-logo-item">
      <img src="${esc(url)}" class="client-logo-thumb">
      <button type="button" class="btn btn-sm btn-danger" data-action="client-logo-remove" data-idx="${i}">✕</button>
    </span>`).join("")}</div>`;
}

// --- טבלת הערות חופשיות (תאריך + טקסט) — משותפת ל-שינויים/מהנדס/תקשורת ---
function renderNotesTable(notes, listKey) {
  const rows = notes.map((n) => `<tr>
    <td><input type="date" value="${esc(n.date)}" data-action="note-date" data-list="${listKey}" data-note="${n.uid}"></td>
    <td><input type="text" value="${esc(n.text)}" data-action="note-text" data-list="${listKey}" data-note="${n.uid}" placeholder="הערה חופשית"></td>
    <td><button class="btn btn-sm btn-danger" data-action="note-remove" data-list="${listKey}" data-note="${n.uid}">✕</button></td>
  </tr>`).join("");
  return `<table class="subs-table"><tr><th>תאריך</th><th>הערה</th><th></th></tr>${rows}</table>
    <button class="btn btn-sm" data-action="note-add" data-list="${listKey}">➕ הוסף הערה</button>`;
}

// --- הערות הסוקר: מס"ד רץ (לא תאריך) + טקסט חופשי — מבנה הנתונים זהה לשאר
// רשימות ההערות (עדיין יש n.date בכל רשומה, לתאימות אחורה בשחזור QR); כאן
// פשוט לא מוצג ולא נערך, לפי בקשת המשתמש שאין צורך בתאריך בלשונית הזו ---
function renderSurveyorNotes(notes) {
  const rows = notes.map((n, i) => `<tr>
    <td class="serial-cell">${i + 1}</td>
    <td><input type="text" value="${esc(n.text)}" data-action="note-text" data-list="surveyorNotes" data-note="${n.uid}" placeholder="הערה חופשית"></td>
    <td><button class="btn btn-sm btn-danger" data-action="note-remove" data-list="surveyorNotes" data-note="${n.uid}">✕</button></td>
  </tr>`).join("");
  return `<table class="subs-table surveyor-notes-table"><tr><th>מס"ד</th><th>הערות הסוקר</th><th></th></tr>${rows}</table>
    <button class="btn btn-sm" data-action="note-add" data-list="surveyorNotes">➕ הוסף הערה</button>`;
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
      { code: "1.6", label: "כביש", value: state.roadNumber || "—" },
      { code: "1.10", label: "קואורדינטה Y", value: state.coordY || "—" },
      { code: "1.11", label: "קואורדינטה X", value: state.coordX || "—" },
      { code: "2.1", label: "קבוצת סווג ראשית", value: state.structureClass },
    ];
  }
  if (groupId === "service") {
    return [{ code: "3.21", label: "מתכנן מקורי", value: state.designer || "—" }];
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
      { code: "13.2", label: "תאריך ביצוע סקירה (קודמת)", value: fmtIsoDate(state.prevInspDate) },
      { code: "13.3", label: "תאריך ביצוע סקירה (נוכחית)", value: fmtIsoDate(state.inspDate) },
      { code: "13.4", label: "תדירות ביצוע סקירה שגרתית [חודש]", value: DEFAULT_NEXT_INSPECTION_MONTHS },
    ];
  }
  return [];
}

// הנחיית המדידה שמוצגת מתחת לשדה — נגזרת מהמטא-דאטה עצמה, כדי שהכלל שמופיע
// למשתמש והכלל שהקוד אוכף יהיו תמיד אותו דבר
function measureHint(f) {
  if (f.hint) return f.hint;
  const parts = [];
  if (f.unit) parts.push(f.unit);
  if (f.step) parts.push(f.step >= 1 ? "מספר שלם" : `דיוק ${Math.round(f.step * 100)} ס"מ`);
  if (f.round === "up") parts.push("עיגול כלפי מעלה");
  else if (f.round === "down") parts.push("עיגול כלפי מטה");
  return parts.join(" · ");
}

function renderIdCardGroup(groupId, state, result, photoStore) {
  const group = ID_CARD_GROUPS.find((g) => g.id === groupId) || ID_CARD_GROUPS[0];
  const auto = idCardAutoFields(groupId, state, result).map(({ code, label, value }) => `
    <label>${esc(code)} ${esc(label)} <span class="hint">(נמשך אוטומטית)</span>
      <input type="text" value="${esc(value)}" readonly>
    </label>`).join("");
  const editable = group.fields.map((f) => {
    if (f.type === "photo") {
      // dir="ltr" נחוץ כדי שכמה קודים מופרדים ב-; לא יתהפכו ויזואלית (כמו בכל
      // שדה קוד-תמונה מרובה באפליקציה) — text-align:right מיושר את ההנחיה
      // ואת הטקסט שכן מוזן לימין, כמו בשאר הטופס
      return `<label>${esc(f.displayCode || f.code)} ${esc(f.label)}
        <input type="text" value="${esc(state.idCard[f.code] || "")}" dir="ltr" style="text-align:right"
          placeholder="הכנס תמונת מעקף מקומי" data-action="idcard-field" data-code="${esc(f.code)}">
        <span class="hint">${photoCodesCell(photoStore, state.idCard[f.code]) || "לא נרשם קוד"}</span>
      </label>`;
    }
    const val = state.idCard[f.code] || "";
    // שדה מדידה/מנייה (step מוגדר ב-ID_CARD_GROUPS): קלט מספרי בלבד, ברזולוציה
    // שהמדריך לתיעוד מחייב — כדי שהנתון יישאר בר-השוואה בין סקירות ובר-שאילתה.
    if (f.step) {
      return `<label>${esc(f.code)} ${esc(f.label)}
        <input type="number" min="0" step="${f.step}" ${f.max ? `max="${f.max}"` : ""}
          inputmode="decimal" value="${esc(val)}"
          data-action="idcard-field" data-code="${esc(f.code)}">
        <span class="hint">${esc(measureHint(f))}</span>
      </label>`;
    }
    // f.placeholder: סעיפים שהנוהל מייעד למילוי על ידי גורם אחר (למשל מנהל
    // תחום סקירת גשרים) ולא הסוקר — התיבה נשארת ניתנת לעריכה, רק עם הנחיה
    // בתוכה כשהיא ריקה, ולא מוצג ריק ("—") אם היא לא מולאה בדוח המודפס.
    return `<label>${esc(f.code)} ${esc(f.label)}
      <input type="${f.type === "date" ? "date" : "text"}" value="${esc(val)}"
        ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""}
        data-action="idcard-field" data-code="${esc(f.code)}">
    </label>`;
  }).join("");
  return `<div class="grid-2">${auto}${editable}</div>`;
}

// ============================================================================
// בקרה — פירוט מלא של שרשרת החישוב (S,Ex → ECS → ECF → ECI → EIF → SCS →
// Condition PI) לכל רכיב, מפתח ומבנה, לצורך אימות ידני של הציון. מסך בלבד —
// לא מודפס: הדוח המודפס כולל את מקטע [4] (סיכום כמויות וציוני ECS), שהוא
// כבר בדיוק העמוד המקביל בדוח הרשמי של נתיבי ישראל ("Bridge Inspections",
// עמ' 6) — טבלת ECS לכל רכיב ושורת סיכום SCS/CPI. אין צורך לשכפל אותו כאן.
// ============================================================================
function controlComponentRow(c) {
  const impLabel = c.importance ? IMPORTANCE[c.importance].label : "רכיב עזר";
  if (!c.surveyed) {
    return `<tr class="hint"><td>${esc(c.name)}</td><td colspan="8">לא נסקר — לא נכלל בחישוב</td></tr>`;
  }
  if (c.aux) {
    return `<tr><td>${esc(c.name)}</td><td>${impLabel}</td>
      <td>${c.sMax}</td><td>${fmt(c.extent)}</td><td><strong>${fmt(c.ecs)}</strong></td>
      <td colspan="4" class="hint">רכיב עזר — אין השפעה על הציון</td></tr>`;
  }
  const base = IMPORTANCE[c.importance].ecfBase;
  return `<tr>
    <td>${esc(c.name)}${c.defaulted ? ' <span class="hint">(ברירת מחדל 1A — אין רשומות פגם)</span>' : ""}</td>
    <td>${impLabel}</td>
    <td>${c.sMax}</td><td>${fmt(c.extent)}</td>
    <td><strong>${fmt(c.ecs)}</strong></td>
    <td>${fmt(base, 1)}</td>
    <td>${fmt(c.ecf)}</td>
    <td><strong>${fmt(c.eci)}</strong></td>
    <td>${fmt(c.eif, 1)}</td>
  </tr>`;
}

// כרטיס נוסחה: כותרת (עברית) + הנוסחה הסימבולית + שורת ההצבה עם הנתונים
// בפועל. שתי השורות האחרונות ב-dir="ltr" — נוסחה עם משתנים לטיניים, "×"
// ומספרים בהקשר RTL מתהפכת ויזואלית בלי זה (אותה בעיה שכבר תוקנה במקומות
// אחרים באפליקציה לקודים כמו "4;99"). לא חצים משורשרים בתוך משפט עברי.
function auditFormula(title, eq, sub) {
  return `<div class="audit-formula">
    <div class="audit-formula-title">${esc(title)}</div>
    <div class="audit-formula-eq" dir="ltr">${eq}</div>
    <div class="audit-formula-sub" dir="ltr">${sub}</div>
  </div>`;
}
// שורת הצבה של ממוצע משוקלל: "(v1×w1 + v2×w2 + …) / (w1+w2+…) = result"
function weightedAvgSubstitution(terms, vDigits, wDigits, result, rDigits) {
  const num = terms.map((t) => `${fmt(t.v, vDigits)}×${fmt(t.w, wDigits)}`).join(" + ");
  const den = terms.map((t) => fmt(t.w, wDigits)).join(" + ");
  return `(${num}) / (${den}) = ${fmt(result, rDigits)}`;
}
// המרת SCS ל-Condition PI (משוואות 8.1/8.2) — כרטיס נוסחה עם הצבת המספר בפועל
function cpiFormulaBlock(scs, cpiValue, title) {
  if (scs == null) return "";
  const raw = 100 - 2 * (scs * scs + 6.5 * scs - 7.5);
  let html = auditFormula(title,
    "Condition PI = 100 − 2 × (SCS² + 6.5 × SCS − 7.5)",
    `100 − 2 × (${fmt(scs, 3)}² + 6.5 × ${fmt(scs, 3)} − 7.5) = ${fmt(raw)}`);
  if (raw < 0 || raw > 100) html += `<p class="hint">חתוך לטווח 0–100 → ${fmt(cpiValue)}</p>`;
  return html;
}
// SCSav (ממוצע משוקלל של ECI לפי EIF) ו-SCScrit (הרכיב הגרוע בחשיבות
// "גבוהה מאוד") ליחידת חישוב אחת (מפתח בודד, או המבנה כולו כשהוא יחידה אחת)
function renderUnitFormulas(unit) {
  const scsAvTerms = unit.scored.map((c) => ({ v: c.eci, w: c.eif }));
  let html = auditFormula("SCSav — ממוצע משוקלל של ECI לפי EIF",
    "SCSav = Σ(ECIᵢ × EIFᵢ) / Σ EIFᵢ",
    weightedAvgSubstitution(scsAvTerms, 2, 1, unit.scsAv, 3));
  html += cpiFormulaBlock(unit.scsAv, unit.cpiAv, "CPIav");

  const critical = unit.scored.filter((c) => c.importance === "veryHigh");
  if (critical.length) {
    html += auditFormula('SCScrit — הרכיב הגרוע ביותר בחשיבות "גבוהה מאוד"',
      "SCScrit = max(ECI) על פני רכיבים בחשיבות גבוהה מאוד",
      `max(${critical.map((c) => fmt(c.eci)).join(", ")}) = ${fmt(unit.scsCrit)}`);
    html += cpiFormulaBlock(unit.scsCrit, unit.cpiCrit, "CPIcrit");
  } else {
    html += '<p class="hint">אין רכיב בחשיבות "גבוהה מאוד" — אין SCScrit.</p>';
  }
  return html;
}

// forPdf=true: מיועד ל"ייצוא חישוב ציון" (pdf.js, exportCalculation) — משמיט
// את ההערה על אי-הדפסה (שרלוונטית רק למסך החי) ומדפיס את כל הבקרה במלואה
function renderControlAudit(state, result, forPdf) {
  if (!result) return '<p class="empty-note">הבקרה תוצג אוטומטית לאחר הזנת רכיבים.</p>';
  const dimLabel = STRUCTURE_CLASSES[state.structureClass].dimLabel;
  const thead = `<tr><th>רכיב</th><th>חשיבות</th><th>S מקס'</th><th>Ext</th><th>ECS</th>
    <th>ECF בסיס</th><th>ECF</th><th>ECI</th><th>EIF</th></tr>`;

  let html = `<ol class="audit-steps">
    <li>מחומרה (S) והיקף הנזק (Ext) של הפגמים מחושב <strong>ECS</strong> לכל רכיב (טבלה 11).</li>
    <li>מ-ECS, לפי מקדם החשיבות של הרכיב, מחושב <strong>ECF</strong> (טבלה 12).</li>
    <li><strong>ECI</strong> = ECS − ECF (משוואה 5).</li>
    <li>לפי אותו מקדם חשיבות נקבע גם <strong>EIF</strong> (טבלה 13).</li>
    <li>רכיבי המפתח משוקללים יחד לציון <strong>SCS</strong>.</li>
    <li>ה-SCS מומר לציון <strong>Condition PI</strong> (משוואות 8.1–8.2).</li>
  </ol>
  ${forPdf ? "" : `<p class="hint">המסך הזה אינו מודפס במלואו — לייצוא מלא ומעוצב של הבקרה, לרבות כל הנוסחאות
    וההצבות, יש להשתמש בכפתור "🧮 ייצוא חישוב ציון".</p>`}`;

  state.spans.forEach((span, i) => {
    const comps = result.spans[i].comps;
    if (!comps.length) return;
    const label = state.spanCount > 1 ? `מפתח ${span.id} (${fmt(span.dim, 2)} ${esc(dimLabel)})` : `מפתח ${span.id}`;
    html += `<h3>${label}</h3>
      <table class="spans-table audit-table">${thead}<tbody>${comps.map(controlComponentRow).join("")}</tbody></table>`;
    const unit = result.spans[i].unit;
    if (unit) html += renderUnitFormulas(unit);
  });

  if (result.singleUnit) {
    html += `<h3>שילוב לרמת המבנה</h3>
      <p class="hint">מבנה בעל מפתח אחד או שניים — כל הרכיבים לעיל נסקרים ומחושבים כיחידה אחת (משוואה 6.1).</p>`;
    html += renderUnitFormulas(result.unit);
  } else {
    html += `<h3>שילוב מפתחות לרמת המבנה (משוואה 6.2)</h3>
      <table class="spans-table audit-table">
        <tr><th>מפתח</th><th>${esc(dimLabel)}</th><th>SCSav</th><th>CPIav</th></tr>
        ${result.spans.map((s) => `<tr><td>מפתח ${s.id}</td><td>${fmt(s.dim, 1)}</td>
          <td>${fmt(s.unit.scsAv, 3)}</td><td>${fmt(s.unit.cpiAv)}</td></tr>`).join("")}
      </table>`;

    const withScore = result.spans.filter((s) => s.unit.scsAv != null && s.dim > 0);
    const normTerms = withScore.map((s) => ({ v: s.unit.scsAv, w: s.dim }));
    html += auditFormula("שיטת הנוהל — שקלול SCSav לפי מימד (משוואה 6.2)",
      `SCSavW = Σ(SCSavᵢ × ${esc(dimLabel)}ᵢ) / Σ ${esc(dimLabel)}ᵢ`,
      weightedAvgSubstitution(normTerms, 3, 1, result.bridge.method_norm.scsAv, 3));
    html += cpiFormulaBlock(result.bridge.method_norm.scsAv, result.bridge.method_norm.cpiAv, "CPIav (לפי הנוהל)");

    const filesTerms = withScore.map((s) => ({ v: s.unit.cpiAv, w: s.dim }));
    html += auditFormula("שיטת הקבצים הקיימים — שקלול CPIav לפי מימד (להשוואה בלבד)",
      `CPIavW = Σ(CPIavᵢ × ${esc(dimLabel)}ᵢ) / Σ ${esc(dimLabel)}ᵢ`,
      weightedAvgSubstitution(filesTerms, 2, 1, result.bridge.method_files.cpiAv, 2));

    const critSpans = result.spans.filter((s) => s.unit.scsCrit != null);
    if (critSpans.length) {
      html += auditFormula("SCScrit — המפתח הגרוע ביותר",
        "SCScrit = max(SCScritᵢ) על פני המפתחים",
        `max(${critSpans.map((s) => `מפתח ${s.id}: ${fmt(s.unit.scsCrit)}`).join(", ")}) = ${fmt(result.bridge.scsCrit)}`);
      html += cpiFormulaBlock(result.bridge.scsCrit, result.bridge.cpiCrit, "CPIcrit");
    }
  }
  return html;
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

// --- זיהוי הפוך: איזה ערך קטלוג (c.id) הניב את comp.catalogId הנוכחי —
// נדרש כדי למלא מראש את קומבו "שינוי סוג" בטבלת "סיכום רכיבים" (כי לרכיבים
// דינמיים catalogId הוא הקוד המפוענח מטבלה 2/6, לא ה-id הגולמי בקטלוג) ---
function catalogValueForComponent(state, comp) {
  const catalog = COMPONENT_CATALOGS[state.structureClass] || [];
  const isTun = state.structureClass === "TUN";
  const types = isTun ? TUNNEL_TYPES : SUPERSTRUCTURE_TYPES;
  const t = types.find((x) => x.id === +(isTun ? state.tunnelType : state.superType));
  for (const c of catalog) {
    if (c.dynamic) {
      const part = t && t[c.dynamic === "main" ? "main" : "secondary"];
      if (part && part.code === comp.catalogId) return c.id;
    } else if (String(c.id) === String(comp.catalogId)) {
      return c.id;
    }
  }
  return "";
}

// --- אפשרויות הקומבו של שורת רכיב קיים בטבלת "סיכום רכיבים": אם הרכיב לא
// מזוהה מול אף ערך בקטלוג הנוכחי (למשל רכיב מדוגמת BR-11 או קוד ישן ללא
// catalogId) — מוסיפים אפשרות סינתטית עם השם הקיים כדי לא "לאבד" אותו
// מהתצוגה; בחירה מחדש בה אינה עושה כלום (אין לה ערך קטלוג אמיתי) ---
function componentComboOptionsForRow(state, comp) {
  const options = componentComboOptions(state);
  if (catalogValueForComponent(state, comp)) return options;
  const label = `${comp.catalogId != null ? comp.catalogId + ". " : ""}${comp.name}`;
  return [{ value: "__current__", label, group: "הרכיב הנוכחי (לא מזוהה בקטלוג)" }, ...options];
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

// --- כל פגמי הפנקס בקומבו אחד — הקלדת קוד ("14.01") או שם מביאה את הפגם ---
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
  const editing = !!draft.editUid;
  return `<div class="defect-form" data-comp="${comp.uid}">
    <strong>${editing ? "עריכת פגם" : "הוספת פגם"} — לפי הפנקס לסוקר</strong>
    <div class="grid-2">
      <label>הפגם — הקלד קוד (למשל 14.01) או שם
        ${Combobox.html({ id: "draft-def", action: "draft-def", value: draft.def,
          options: allDefectComboOptions(), placeholder: 'הקלד קוד ("14.01") או שם פגם…' })}
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
      <button class="btn btn-primary btn-sm" data-action="draft-save" ${errors.length || !draft.def ? "disabled" : ""}>💾 ${editing ? "שמור שינויים" : "שמור פגם"}</button>
      <button class="btn btn-sm" data-action="draft-cancel">ביטול</button>
    </div>
  </div>`;
}

// --- טאבים של תת-הטאבים בלשונית "רכיבים" (אותו דפוס כמו ID_CARD_GROUPS) ---
function renderCompTabs(activeCompTab) {
  const tabs = [{ id: "summary", label: "סיכום רכיבים" }, { id: "detail", label: "פירוט הרכיבים" }];
  return tabs.map((t) =>
    `<button class="tab ${t.id === activeCompTab ? "active" : ""}" data-action="comp-tab" data-comptab="${t.id}">${esc(t.label)}</button>`
  ).join("");
}

// --- תת-טאב 1 ("סיכום רכיבים"): שורה שטוחה לכל רכיב בכל המפתחים —
// קטלוג (ניתן לשינוי) / כמות / מפתח / מחיקה. הוספת רכיב חדש: שורת "add-comp"
// הקבועה בתחתית — בחירה בקומבו מוסיפה מיד למפתח שנבחר לצידה ---
function renderComponentsSummary(state, ui) {
  const rows = [];
  state.spans.forEach((span) => {
    span.components.forEach((c) => {
      const spanOptions = state.spans.map((s) =>
        `<option value="${s.id}" ${s.id === span.id ? "selected" : ""}>מפתח ${s.id}</option>`).join("");
      rows.push(`<tr data-comp="${c.uid}">
        <td>${Combobox.html({ id: `comp-type-${c.uid}`, action: "comp-change-type",
          value: catalogValueForComponent(state, c) || "__current__",
          options: componentComboOptionsForRow(state, c),
          placeholder: "בחר רכיב מהקטלוג…" })}</td>
        <td><input type="number" min="1" step="1" value="${c.subs.length}" data-action="comp-qty" style="width:70px"
          title='לדוגמה: אם יש 3 קורות ראשיות במפתח, הכמות היא 3 — הטבלה בתת-הטאב הבא תתעדכן אוטומטית'></td>
        <td><select data-action="comp-move-span">${spanOptions}</select></td>
        <td><button class="btn btn-sm btn-danger" data-action="comp-remove">✕</button></td>
      </tr>`);
    });
  });
  const emptyMsg = rows.length ? "" : '<p class="empty-note">אין עדיין רכיבים — בחרו רכיב מהקטלוג למטה כדי להתחיל.</p>';
  const defaultSpan = ui.addCompSpan || state.spans[0].id;
  const spanOptionsNew = state.spans.map((s) =>
    `<option value="${s.id}" ${s.id === defaultSpan ? "selected" : ""}>מפתח ${s.id}</option>`).join("");
  return `${emptyMsg}
    <table class="subs-table comp-summary-table">
      <tr><th>רכיב (מהקטלוג)</th><th>כמות</th><th>מפתח</th><th></th></tr>
      ${rows.join("")}
    </table>
    <div class="add-row">
      <label class="add-comp-span-field">למפתח
        <select id="add-comp-span" data-action="add-comp-span">${spanOptionsNew}</select>
      </label>
      <div id="add-comp-combo" class="combo-host">${Combobox.html({
        id: "add-comp", action: "add-comp", options: componentComboOptions(state),
        placeholder: "— בחר רכיב מהקטלוג להוספה (הקלד קוד או שם) —",
      })}</div>
    </div>
    <p class="hint">קודם בוחרים למפתח מס' כמה, ואז בוחרים רכיב מהקטלוג — הוא נוסף מיד למפתח שנבחר.
      אפשר להקליד בתיבת הקטלוג קוד (למשל "12") או שם.</p>`;
}

// --- כותרת חוזרת לרכיב בשתי הרשימות הפתוחות ("מפתח X — [קוד]. [שם]") ---
function componentFlatHeading(span, comp) {
  const impLabel = comp.importance ? IMPORTANCE[comp.importance].label : "רכיב עזר";
  const badgeCls = comp.importance === "veryHigh" ? "badge-vh" : comp.importance ? "" : "badge-aux";
  return `<div class="comp-flat-heading">
    <span class="comp-title">מפתח ${span.id} — ${esc(comp.catalogId != null ? comp.catalogId + ". " : "")}${esc(comp.name)}</span>
    <span class="badge ${badgeCls}">${esc(impLabel)}</span>
    <span class="badge badge-aux">${esc(comp.unit || "")}</span>
  </div>`;
}

// --- טבלת מידה/מידה משנית לתת-רכיבים (ללא "כמות" — זה בתת-טאב "סיכום רכיבים") ---
function renderSubsTable(comp) {
  const size2Col = !!comp.unit2;
  const subRows = comp.subs.map((s) => `
    <tr><td>תת-רכיב ${s.id}</td>
      <td><input type="number" min="0" step="any" value="${esc(s.size)}" data-action="sub-size" data-sub="${s.id}"></td>
      ${size2Col ? `<td><input type="number" min="0" step="any" value="${esc(s.size2 == null ? "" : s.size2)}"
        data-action="sub-size2" data-sub="${s.id}"></td>` : ""}
      <td><input type="text" class="note-input" value="${esc(s.note || "")}" data-action="sub-note" data-sub="${s.id}"
        placeholder="זכרון ארגוני — לא משפיע על החישוב"></td>
      <td class="sub-actions">
        <button class="btn btn-sm" data-action="sub-clone" data-sub="${s.id}" title="שכפול תת-הרכיב כולל הפגמים שלו">⧉ שכפל</button>
        ${comp.subs.length > 1 ? `<button class="btn btn-sm btn-danger" data-action="sub-remove" data-sub="${s.id}" title="מחיקת תת-הרכיב והפגמים שלו">✕</button>` : ""}
      </td>
    </tr>`).join("");
  return `<div class="hint">מלאו את המידה (וה"מידה משנית" אם יש) לכל תת-רכיב — יחידה: ${esc(comp.unit || "")}${size2Col ? `, ${esc(comp.unit2)}` : ""}</div>
    <table class="subs-table"><tr><th>תת-רכיב</th><th>מידה [${esc(comp.unit || "")}]</th>${size2Col ? `<th>מידה משנית ${esc(comp.unit2)}</th>` : ""}<th>הערה — איך חושבה המידה</th><th></th></tr>${subRows}</table>
    <button class="btn btn-sm" data-action="sub-add">➕ תת-רכיב</button>`;
}

// --- תת-טאב 2 ("פירוט הרכיבים"): רשימה פתוחה — כותרת + טבלת מידה לכל רכיב ---
function renderComponentsDetailList(state) {
  const blocks = [];
  state.spans.forEach((span) => {
    span.components.forEach((comp) => {
      blocks.push(`<div class="comp" data-comp="${comp.uid}">
        ${componentFlatHeading(span, comp)}
        ${renderSubsTable(comp)}
      </div>`);
    });
  });
  if (!blocks.length) return '<p class="empty-note">אין עדיין רכיבים — הוסיפו רכיבים בתת-הטאב "סיכום רכיבים".</p>';
  return blocks.join("");
}

// --- לשונית "סקירת המבנה": טבלה אחת לכל מפתח, עם כל הרכיבים שלו יחד —
// עמודת "רכיב" (rowspan על כל שורות הרכיב) מזהה כל קבוצה במקום כותרת נפרדת
// לכל רכיב, כדי לצמצם גלילה. נסקר/רכיב תקין/מחיקה יושבים בתא ה-rowspan. ---
function renderComponentSurveyRows(comp, ui, photoStore) {
  const impLabel = comp.importance ? IMPORTANCE[comp.importance].label : "רכיב עזר";
  const badgeCls = comp.importance === "veryHigh" ? "badge-vh" : comp.importance ? "" : "badge-aux";
  const rowCls = comp.surveyed ? "" : "not-surveyed";
  const defectRows = comp.defects.length ? comp.defects.map((d) => {
    const cat = DEFECT_CATALOG.defects.find((x) => x.code === d.def);
    const defectLabel = d.note === "רכיב תקין" ? "רכיב תקין"
      : `${d.def ? esc(d.def) + " — " : ""}${esc(cat ? cat.name_he : "")}`;
    return `<tr class="${rowCls}" data-comp="${comp.uid}">
      <td>${defectLabel}</td>
      <td>${d.sub}</td><td>${d.s}</td><td>${esc(d.ex)}</td>
      <td>${esc(d.note || "")}</td>
      <td><input type="text" class="note-input" value="${esc(d.photo)}" data-action="defect-photo" data-defect="${d.uid}"
        placeholder="קוד, אפשר כמה מופרדים ב-;" dir="ltr" style="width:110px"></td>
      <td>${photoCodesCell(photoStore, d.photo)}</td>
      <td class="sub-actions">
        ${d.def ? `<button class="btn btn-sm" data-action="defect-edit" data-defect="${d.uid}" title="עריכת הפגם — פותח מחדש את הנתונים לתיקון">✏️</button>` : ""}
        <button class="btn btn-sm btn-danger" data-action="defect-remove" data-defect="${d.uid}">✕</button>
      </td>
    </tr>`;
  }) : [`<tr class="${rowCls}" data-comp="${comp.uid}"><td colspan="8" class="hint">אין רשומות פגם — יחושב כתקין (1A)</td></tr>`];
  const formOpen = ui.openDefectForm === comp.uid;
  const actionRow = `<tr class="${rowCls}" data-comp="${comp.uid}"><td colspan="8">
    ${formOpen ? renderDefectForm(comp, ui.draft) : `<button class="btn btn-sm btn-primary" data-action="defect-open">➕ הוסף פגם</button>`}
    ${!comp.surveyed ? '<p class="warn">רכיב מסומן "לא ניתן לסקירה" — לא ייכלל בחישוב הציון</p>' : ""}
  </td></tr>`;
  const allRows = [...defectRows, actionRow];
  const nameCell = `<td rowspan="${allRows.length}" class="comp-name-cell ${rowCls}">
    <div class="comp-name-cell-inner">
      <span class="comp-title">${esc(comp.name)}</span>
      <span class="badge ${badgeCls}">${esc(impLabel)}</span>
      <label style="flex-direction:row;align-items:center;gap:4px;font-size:.78rem">
        <input type="checkbox" ${comp.surveyed ? "checked" : ""} data-action="comp-surveyed"> נסקר
      </label>
      <button class="btn btn-sm" data-action="comp-intact" title="מסמן את הרכיב כתקין (1A)">✔️ תקין</button>
      <button class="btn btn-sm btn-danger" data-action="comp-remove">🗑</button>
    </div>
  </td>`;
  allRows[0] = allRows[0].replace(/^(<tr[^>]*>)/, `$1${nameCell}`);
  return allRows.join("");
}

// --- לשונית "סקירת המבנה": master-detail — רשימת כל הרכיבים (לפי מפתח)
// מימין, ומימין לה טבלת הפגמים של הרכיב הנבחר בלבד (ui.surveyComponent) —
// כדי שלא יהיה צורך לגלול/לראות את כל פגמי הגשר כדי לעבוד על רכיב אחד ---
function renderSurveyMasterList(state, ui) {
  const blocks = [];
  state.spans.forEach((span) => {
    if (!span.components.length) return;
    blocks.push(`<div class="survey-master-group">מפתח ${span.id}</div>`);
    span.components.forEach((c) => {
      const impLabel = c.importance ? IMPORTANCE[c.importance].label : "עזר";
      const badgeCls = c.importance === "veryHigh" ? "badge-vh" : c.importance ? "" : "badge-aux";
      const active = c.uid === ui.surveyComponent;
      // <button> ולא <div> — מילוי/ניווט רציף במקלדת הוא עקרון מוביל בכלי הזה
      blocks.push(`<button type="button" class="survey-master-row ${active ? "active" : ""} ${c.surveyed ? "" : "not-surveyed"}"
        data-action="survey-select" data-comp="${c.uid}" aria-pressed="${active}">
        <span class="cm-name">${esc(c.catalogId != null ? c.catalogId + ". " : "")}${esc(c.name)}</span>
        <span class="badge ${badgeCls}">${esc(impLabel)}</span>
      </button>`);
    });
  });
  return blocks.join("") || '<div class="survey-master-empty">אין רכיבים.</div>';
}
function renderSurveyDetail(state, ui, photoStore) {
  let comp = null;
  for (const span of state.spans) {
    comp = span.components.find((c) => c.uid === ui.surveyComponent);
    if (comp) break;
  }
  if (!comp) return '<div class="survey-detail-empty">בחר רכיב מהרשימה מימין כדי לרשום לו פגמים.</div>';
  // רוחבי העמודות מוגדרים על שורת הכותרת בלבד (table-layout:fixed משתמש
  // בה, לא בשורות הבאות) — בלעדיהם, טופס הוספת הפגם הפתוח (בתא ה-colspan)
  // "דורש" רוחב תוכן ומרחיב את הטבלה כולה מעבר לגבול התיבה שלה, ובמסך RTL
  // ההתרחבות הזו יוצאת שמאלה — ישר לתוך רשימת הרכיבים שלצד הטבלה
  return `<table class="defects-table survey-table">
    <tr>
      <th class="survey-col-name">רכיב</th><th class="survey-col-defect">פגם</th>
      <th class="survey-col-sub">תת-רכיב</th><th class="survey-col-s">S</th><th class="survey-col-ex">Ex</th>
      <th class="survey-col-notes">הערות</th><th class="survey-col-photo">קוד תמונה</th>
      <th class="survey-col-status">סטטוס</th><th class="survey-col-actions"></th>
    </tr>
    ${renderComponentSurveyRows(comp, ui, photoStore)}
  </table>`;
}
function renderStructureSurvey(state, ui, photoStore) {
  if (!state.spans.some((s) => s.components.length))
    return '<p class="empty-note">אין עדיין רכיבים — הוסיפו רכיבים בלשונית "רכיבים".</p>';
  return `<div class="survey-split">
    <div class="survey-master">${renderSurveyMasterList(state, ui)}</div>
    <div class="survey-detail">${renderSurveyDetail(state, ui, photoStore)}</div>
  </div>`;
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

  // רכיבים שקיימים אך סומנו "לא ניתן לסקירה" — לא נכללים בשום חישוב לעיל
  // (ר' comp.surveyed ב-calc.js); כאן כדי שהחריגה תהיה גלויה, לא רק מרומזת
  // מהציון. אותה רשימה בדיוק מוצגת גם בטאב "בקרה", שורה-שורה מול כל מפתח.
  const notSurveyed = result.spans.flatMap((s) => s.comps.filter((c) => !c.surveyed).map((c) => ({ ...c, spanId: s.id })));
  if (notSurveyed.length) {
    html += `<h3>⚠️ רכיבים קיימים שלא נסקרו — לא נכללים בחישוב הציון</h3>
      <table class="spans-table">
        <tr><th>מפתח</th><th>רכיב</th></tr>
        ${notSurveyed.map((c) => `<tr><td>מפתח ${c.spanId}</td><td>${esc(c.name)}</td></tr>`).join("")}
      </table>`;
  }

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
// title/subtitle: HTML מוכן מראש (לא נמלט כאן) — כך שקריאה יכולה לעטוף
// מונחים באנגלית ב-<bdi> למניעת בלבול bidi מול הטקסט העברי הסמוך, בלי
// ש-esc() ימחק את התגית. שני הקוראים היחידים (renderSummary) מעבירים
// מחרוזות קבועות בקוד, לא נתוני משתמש — אין כאן סיכון הזרקה
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
    <div class="gauge-title">${title}</div>
    <div class="gauge-sub">${subtitle || ""}</div>
    <svg viewBox="0 0 ${W} ${H}" dir="ltr" xmlns="http://www.w3.org/2000/svg">${segs}${ticks}${needle}</svg>
    <div class="gauge-value" dir="ltr" style="color:${color}">${fmt(value)}<span class="gauge-of"> / 100</span></div>
    <div class="gauge-name" style="color:${color}">${meaningRow ? esc(meaningRow.name) : "הזן מימד שקלול לכל מפתח"}</div>
    ${meaningRow ? `<div class="gauge-meaning">${esc(meaningRow.text)}</div>` : ""}
  </div>`;
}

// --- תקציר מנהלים ---
// פגמים זהים (אותו רכיב + אותו קוד פגם) חוזרים לרוב בכמה מפתחים; בתקציר
// מקבצים אותם לשורה אחת עם רשימת המפתחים, כדי שהטבלה תישאר קצרה וקריאה
function summaryDefectLabel(code) {
  const cat = DEFECT_CATALOG.defects.find((x) => x.code === code);
  return code ? `<bdi>${esc(code)}</bdi>${cat ? " " + esc(cat.name_he) : ""}` : "—";
}
function summarySpansText(spanIds, singleUnit, totalSpans) {
  if (singleUnit) return "המבנה כולו";
  const ids = [...new Set(spanIds)].sort((a, b) => a - b);
  if (totalSpans > 1 && ids.length === totalSpans) return "כל המפתחים";
  return (ids.length > 1 ? "מפתחים " : "מפתח ") + ids.join(", ");
}
function summaryCompLabel(comp, catalogIds) {
  const cid = catalogIds.get(comp.key);
  return esc((cid != null ? cid + ". " : "") + comp.name);
}
const SUMMARY_DISCLAIMER = "המידע המוצג כאן אינו תחליף לייעוץ הנדסי של מתכנן שיקום, אלא נועד לתת הבנה כללית של מה נדרש לבצע.";
const SUMMARY_SEVERITY_NAME ={ 2: "קל", 3: "בינוני", 4: "חמור", 5: "כשל" };

// ציון מצטבר בתא הטבלה: הציון לאחר התיקון והשינוי מהשורה הקודמת בלבד (ה"לפני"
// הוא הציון בשורה שמעל) — קצר מספיק לעמודה צרה. dir=ltr שומר על סדר המספרים
function summaryScoreChange(label, before, after) {
  if (before == null || after == null) return `<div class="summary-chg"><bdi>${label}</bdi>: —</div>`;
  const d = after - before;
  const body = Math.abs(d) < 0.005
    ? `<span dir="ltr">${fmt(after)}</span> <span class="summary-nochange">(ללא שינוי)</span>`
    : `<strong dir="ltr">${fmt(after)}</strong> <span dir="ltr">(+${fmt(d)})</span>`;
  return `<div class="summary-chg"><bdi>${label}</bdi>: ${body}</div>`;
}
function summaryMeaningName(m) {
  return m ? ` (${esc(m.name)})` : "";
}

// מבנה התקציר — באותה שפה חזותית כמו דוח הסקירה ודוח החישוב: כותרות מקטע
// "[n] כותרת" על פס אפור, טבלאות בגבולות שחורים דקים, טקסט שחור. כל מקטע
// פותח בפסקה מלאה שמסבירה את מה שמתחתיו (לא כותרת עם שורה בודדת).
// .summary-keep = אסור לחתוך עמוד מיד אחרי האלמנט (פסקת פתיחה של טבלה) —
// ר' exportSummary ב-pdf.js
function renderSummary(state, result, summary, plan) {
  if (!result || !summary || !summary.totalScored) return '<p class="empty-note">התקציר ייווצר אוטומטית לאחר הזנת רכיבים.</p>';
  const b = result.bridge;
  const single = result.singleUnit;
  const catalogIds = new Map(state.spans.flatMap((s) => s.components.map((c) => [c.uid, c.catalogId])));
  const ia = state.immediateAttention || { text: "", photo: "" };
  const iaText = (ia.text || "").trim(), iaPhoto = (ia.photo || "").trim();
  const hasIA = !!(iaText || iaPhoto);
  const spansTxt = (ids) => summarySpansText(ids, single, state.spans.length);
  const sectionTitle = (n, t) => `<div class="gov-section-title summary-section-title">${n}. ${t}</div>`;
  const meaningQ = (m) => (m ? ` — "${esc(m.name)}"` : "");

  let html = '<div class="summary-block">';

  // [1] ציוני המבנה ומשמעותם — פסקת פתיחה (זיהוי המבנה + הסבר שני הציונים
  // והציון שהתקבל בכל אחד), ומתחתיה מדי המהירות עם משמעות כל ציון
  html += `${sectionTitle(1, "ציוני מצב המבנה ומשמעותם")}
    <p class="summary-p">בהתאם למתודולוגיית נתיבי ישראל, מצב המבנה מוערך באמצעות שני מדדי <bdi>Condition PI</bdi>
      בסולם 0–100: <strong>ציון ממוצע</strong> (<bdi>CPIav</bdi>) — ממוצע משוקלל של ציוני המצב של כל הרכיבים
      שנסקרו, לפי דרגת חשיבותם; ו<strong>ציון קריטי</strong> (<bdi>CPIcrit</bdi>) — הנקבע לפי ציון המצב הגרוע ביותר
      מבין הרכיבים בדרגת חשיבות "גבוהה מאוד". ציוני המבנה בסקירה הנוכחית: ציון ממוצע
      <strong dir="ltr">${fmt(b.method_norm.cpiAv)}</strong>${meaningQ(b.meaningAv)}, וציון קריטי
      <strong dir="ltr">${fmt(b.cpiCrit)}</strong>${meaningQ(b.meaningCrit)}. סיווג המצב בהתאם לטבלה 15
      ב"הנחיות להערכת המצב המבני של גשרים, מנהרות ומבני דרך" (מהדורה 9):</p>
    <div class="gauges">
      ${gaugeSVG(b.method_norm.cpiAv, MEANING_AV, b.meaningAv, "<bdi>CPIav</bdi> — ציון ממוצע", "מצב המבנה בכללותו · משוואה 6.2")}
      ${gaugeSVG(b.cpiCrit, MEANING_CRIT, b.meaningCrit, "<bdi>CPIcrit</bdi> — ציון קריטי", "הרכיב הקובע בדרגת חשיבות \"גבוהה מאוד\"")}
    </div>`;

  // ממצא לתשומת לב מיידית — מיד אחרי הציונים, באותה מסגרת אדומה כמו בדוח הסקירה
  if (hasIA) {
    html += `<div class="gov-attention">
      <div class="gov-attention-title">⚠ תשומת לב מיידית</div>
      ${iaText ? `<div class="gov-attention-text">${esc(iaText)}</div>` : ""}
      ${iaPhoto ? `<div class="gov-attention-codes">קוד תמונה: <span dir="ltr">${esc(iaPhoto)}</span></div>` : ""}
    </div>`;
  }

  // [2] קביעת הציון — פסקה על הציון הממוצע, ופסקה על הציון הקריטי
  // שמובילה לטבלת הרכיבים הקובעים אותו
  html += sectionTitle(2, "קביעת הציון — רכיבים ופגמים קובעים");
  const contribs = summary.avContributions || [];
  const notSurveyedTxt = summary.notSurveyed.length
    ? ` ${summary.notSurveyed.length === 1 ? "רכיב אחד קיים במבנה אך סומן" : `${summary.notSurveyed.length} רכיבים קיימים במבנה אך סומנו`} "לא ניתן לסקירה" ולא ${summary.notSurveyed.length === 1 ? "נכלל" : "נכללו"} בחישוב הציון: ${summary.notSurveyed.map((c) => esc(c.name)).join("; ")}.`
    : "";
  if (contribs.length) {
    const total = contribs.reduce((a, x) => a + x.contribution, 0);
    const byName = new Map();
    for (const x of contribs) byName.set(x.comp.name, (byName.get(x.comp.name) || 0) + x.contribution);
    const top = [...byName.entries()].sort((a, c) => c[1] - a[1]).slice(0, 3)
      .map(([name, v]) => `${esc(name)} (${Math.round((v / total) * 100)}%)`);
    const weak = summary.weakestSpan;
    html += `<p class="summary-p"><strong>הציון הממוצע (<bdi>CPIav</bdi> = <span dir="ltr">${fmt(b.method_norm.cpiAv)}</span>)</strong>
      מחושב כממוצע משוקלל של ציוני המצב של כל הרכיבים שנסקרו, לפי מקדמי החשיבות (טבלה 13)${
      single ? "" : " ולפי שטח המפתחים (משוואה 6.2)"}. עיקר הפחתת הציון נובע מהרכיבים: ${top.join(", ")}.${
      weak ? ` המפתח בעל הציון הנמוך ביותר: מפתח ${esc(weak.id)} (<bdi>CPIav</bdi> = <span dir="ltr">${fmt(weak.cpiAv)}</span>).` : ""}${notSurveyedTxt}</p>`;
  } else if (notSurveyedTxt) {
    html += `<p class="summary-p">${notSurveyedTxt.trim()}</p>`;
  }

  const ties = summary.criticalTies || [];
  if (ties.length) {
    // שורה אחת לכל רכיב (גם אם הוא במצב הקריטי בכמה מפתחים); כל פגם מציין
    // את המפתחים שבהם הוא נמצא, כשאלה לא כל המפתחים של הרכיב באותה שורה
    const groups = new Map();
    for (const c of ties) {
      if (!groups.has(c.name)) groups.set(c.name, { comp: c, spans: [], defs: new Map(), notes: new Set(), sMax: c.sMax });
      const g = groups.get(c.name);
      g.spans.push(c.spanId);
      for (const d of c.defects || []) {
        if (d.s !== c.sMax) continue;
        if (d.def) {
          if (!g.defs.has(d.def)) g.defs.set(d.def, new Set());
          g.defs.get(d.def).add(c.spanId);
        }
        if ((d.note || "").trim()) g.notes.add(d.note.trim());
      }
    }
    const rows = [...groups.values()].map((g) => {
      const allSpans = new Set(g.spans);
      const defs = [...g.defs.entries()].sort((a, c) => c[1].size - a[1].size).map(([code, sp]) =>
        summaryDefectLabel(code) + (!single && sp.size < allSpans.size ? ` <span class="summary-sub-inline">(${esc(spansTxt([...sp]))})</span>` : ""));
      return `<tr>
        <td>${summaryCompLabel(g.comp, catalogIds)}</td>
        <td>${esc(spansTxt(g.spans))}</td>
        <td>${defs.length ? defs.join("<br>") : "—"}${
          g.notes.size ? `<div class="summary-sub">הערת הסוקר: ${[...g.notes].map((n) => `"${esc(n)}"`).join("; ")}</div>` : ""}</td>
        <td class="summary-num">${g.sMax}</td>
      </tr>`;
    }).join("");
    const nComp = groups.size;
    html += `<p class="summary-p summary-keep"><strong>הציון הקריטי (<bdi>CPIcrit</bdi> = <span dir="ltr">${fmt(b.cpiCrit)}</span>)</strong>
      נקבע לפי ציון המצב המרבי מבין הרכיבים בדרגת חשיבות "גבוהה מאוד" (<bdi>Eci = ${fmt(b.scsCrit)}</bdi>).${
      ties.length > 1 ? ` ציון זה מתקבל ${nComp > 1 ? `ב-${nComp} רכיבים` : "ברכיב אחד"}${ties.length > nComp ? ` וב-${ties.length} מיקומים במבנה` : ""}; לפיכך, שיקום של חלקם בלבד לא ישפר את הציון הקריטי, ונדרש טיפול בכל המיקומים.` : ""}
      הרכיבים והפגמים הקובעים את הציון הקריטי:</p>
      <table class="gov-table summary-table summary-crit">
        <thead><tr><th>רכיב</th><th>מיקום</th><th>פגם (קוד ותיאור)</th><th class="summary-num">דרגת חומרה (<bdi>S</bdi>)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // [3] טיפולים נדרשים — הפגמים שתיקונם נדרש לשיפור הציון (Calc.improvementPlan),
  // בתוספת ליקויי בטיחות ופגמים חמורים. הסדר: תשומת לב מיידית ← בטיחות
  // משתמשי הדרך ← חומרה ← השפעה על הציון. עמודת הציון מצטברת: הציון לאחר
  // תיקון השורה וכל השורות שמעליה
  html += sectionTitle(3, "טיפולים נדרשים והשפעתם הצפויה על ציון המבנה");
  const groups3 = plan ? plan.groups : [];
  if (!plan) {
    html += `<p class="hint">תוכנית הטיפול מחושבת בעת פתיחת לשונית התקציר או ייצוא ה-PDF.</p>`;
  } else if (groups3.length || hasIA) {
    const rows = [];
    if (hasIA) {
      rows.push(`<tr class="summary-prio-urgent">
        <td>מיידית</td>
        <td>⚠ תשומת לב מיידית</td>
        <td>${esc(iaText || "—")}${iaPhoto ? `<div class="summary-sub">קוד תמונה: <bdi>${esc(iaPhoto)}</bdi></div>` : ""}</td>
        <td>התרעה מיידית בכתב, תוך 12 שעות מסיום הסקירה, למנהל תחום אחזקת גשרים.</td>
        <td class="summary-num">—</td>
      </tr>`);
    }
    let prev = plan.current;
    for (const g of groups3) {
      const guide = DEFECT_GUIDANCE[g.def];
      const byComp = new Map();
      for (const it of g.items) {
        if (!byComp.has(it.comp.name)) byComp.set(it.comp.name, { comp: it.comp, spans: [] });
        byComp.get(it.comp.name).spans.push(it.spanId);
      }
      const where = [...byComp.values()].map(({ comp, spans }) =>
        `${summaryCompLabel(comp, catalogIds)}${single ? "" : ` <span class="summary-sub-inline">(${esc(spansTxt(spans))})</span>`}`).join("<br>");
      const prio = g.s >= 5 ? "מיידית" : (g.s === 4 || g.isSafety) ? "גבוהה" : g.s === 3 ? "רגילה" : "שוטפת";
      const urgent = g.s >= 5 || g.isSafety;
      rows.push(`<tr${urgent ? ' class="summary-prio-urgent"' : ""}>
        <td>${prio}${g.isSafety ? `<div class="summary-safety-tag">⚠ בטיחות משתמשי הדרך</div>` : ""}</td>
        <td>${summaryDefectLabel(g.def)}<div class="summary-sub">חומרה ${g.sMin < g.s ? `<span dir="ltr">${g.sMin}–${g.s}</span>` : `${g.s}${SUMMARY_SEVERITY_NAME[g.s] ? " — " + esc(SUMMARY_SEVERITY_NAME[g.s]) : ""}`}</div></td>
        <td>${where}</td>
        <td>${guide ? esc(guide.remedy) : "בהתאם להנחיית מהנדס."}</td>
        <td>${summaryScoreChange("CPIcrit", prev.cpiCrit, g.after.cpiCrit)}${summaryScoreChange("CPIav", prev.cpiAv, g.after.cpiAv)}</td>
      </tr>`);
      prev = g.after;
    }
    html += `<p class="summary-p summary-keep">הטיפולים הנדרשים מדורגים בטבלה לפי סדר עדיפות: ממצאים הדורשים תשומת לב
      מיידית, ליקויים המהווים סיכון בטיחותי למשתמשי הדרך, ולאחריהם לפי דרגת החומרה והשפעת הפגם על ציון המבנה.
      בעמודה האחרונה מוצג הציון הצפוי במצטבר, בהנחה שבוצעו הטיפולים בשורה זו ובכל השורות שמעליה. האומדן נערך
      בהתאם לסעיף 2.6.6 ב"הנחיות לביצוע סקירת גשרים, מנהרות ומבני דרך": הפגם נחשב משוקם במלואו, ודירוג הרכיב
      מחושב מחדש על בסיס יתר הפגמים שתועדו בו.</p>
      <table class="gov-table summary-table summary-treat">
        <thead><tr><th class="st-prio">דרגת עדיפות</th><th class="st-def">סוג הפגם</th><th class="st-where">רכיב ומיקום</th><th>אופן הטיפול המומלץ</th><th class="st-after">ציון צפוי מצטבר לאחר הטיפול</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>`;
    const all = plan.allFix;
    if (all) {
      const row = (label, cur, mCur, aft, mAft) => `<tr>
        <td>${label}</td>
        <td class="summary-num"><span dir="ltr">${fmt(cur)}</span>${mCur ? ` — ${esc(mCur.name)}` : ""}</td>
        <td class="summary-num"><strong dir="ltr">${fmt(aft)}</strong>${mAft ? ` — <strong>${esc(mAft.name)}</strong>` : ""}</td>
      </tr>`;
      html += `<p class="summary-p summary-keep"><strong>ציון המבנה הצפוי לאחר ביצוע מלוא הטיפולים:</strong></p>
        <table class="gov-table summary-table summary-result">
          <thead><tr><th>מדד</th><th class="summary-num">ציון נוכחי</th><th class="summary-num">ציון צפוי לאחר ביצוע הטיפולים</th></tr></thead>
          <tbody>
            ${row("ציון קריטי (<bdi>CPIcrit</bdi>)", plan.current.cpiCrit, plan.current.meaningCrit, all.cpiCrit, all.meaningCrit)}
            ${row("ציון ממוצע (<bdi>CPIav</bdi>)", plan.current.cpiAv, plan.current.meaningAv, all.cpiAv, all.meaningAv)}
          </tbody>
        </table>`;
    }
    if (plan.otherCount) {
      html += `<p class="summary-p">בנוסף תועדו ${plan.otherCount} פגמים בעלי השפעה זניחה על ציון המבנה; הטיפול בהם יבוצע במסגרת האחזקה השוטפת.</p>`;
    }
  } else {
    html += `<p class="summary-p">לא נדרשים טיפולים לשיפור ציון המבנה.${plan.otherCount ? ` ${plan.otherCount} פגמים קלים שתועדו יטופלו במסגרת האחזקה השוטפת.` : ""}</p>`;
  }

  // בייצוא ה-PDF הפסקה הזו מוסרת מהזרימה ומודפסת כשורת תחתית בכל עמוד
  html += `<p class="hint summary-disclaimer">${esc(SUMMARY_DISCLAIMER)}</p>`;
  html += "</div>";
  return html;
}

// ============================================================================
// PDF "חישוב ציון — במבנה קובץ ה-Excel": אותה טבלת רכיבים/פגמים/ציון כמו
// ב-XlsxExport (עמודות, סדר, כותרות), כערכים סטטיים לצורך תצוגת PDF — לא
// נוסחאות (אלו רק בקובץ ה-Excel החי). מאפשר להפיק את אותו מבנה ישירות מהמערכת
// בלי תלות בקובץ Excel/תוכנה מקומית.
// ============================================================================
function xlsxPdfNaturalCodeCompare(a, b) {
  const A = a == null || a === "" ? null : String(a);
  const B = b == null || b === "" ? null : String(b);
  if (A == null && B == null) return 0;
  if (A == null) return 1;
  if (B == null) return -1;
  const pa = A.split("."), pb = B.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = parseFloat(pa[i]) || 0, vb = parseFloat(pb[i]) || 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}
// זהה ל-winningDefectInfo ב-xlsx-export.js — לתצוגה בלבד (הערכים המספריים
// תמיד נלקחים מ-Calc); ראו שם את ההסבר המלא על מקרה השקלול הרב-תתי-רכיבי
function xlsxPdfWinningDefectInfo(comp, res) {
  if (!res.surveyed || res.aux) return { code: "", ex: "" };
  if (!comp.defects.length || res.defaulted) return { code: "", ex: "A" };
  const atMax = comp.defects.filter((d) => d.s === res.sMax);
  const codes = [...new Set(atMax.map((d) => d.def).filter(Boolean))].join(", ");
  if ((comp.subs ? comp.subs.length : 1) > 1) return { code: codes, ex: "משוקלל" };
  const exVal = Math.max(...atMax.map((d) => (EXTENT[d.ex] ? EXTENT[d.ex].value : 0)));
  const letter = exVal === 0 ? (res.sMax === 1 ? "A" : "B") : exVal === 0.1 ? "C" : exVal === 0.3 ? "D" : exVal === 0.7 ? "E" : "";
  return { code: codes, ex: letter };
}
// מחזיר חלקים (לא HTML שלם) כדי ש-pdf.js יוכל למדוד ולפצל לעמודים אמיתיים
// לפי גובה שורות בפועל — בדיוק כמו טבלת "תיעוד סקירת רכיבים" בדוח הרגיל,
// כדי שאף שורה לא תיחתך במעבר בין עמודים
function xlsxPdfComponentsTableParts(state) {
  const rows = [];
  for (const span of state.spans) {
    const comps = [...span.components].sort((a, b) => xlsxPdfNaturalCodeCompare(a.catalogId, b.catalogId));
    for (const c of comps) {
      const subs = c.subs || [];
      const detail = subs.map((s) => `${s.id}: ${fmt(s.size, 2)}${s.size2 ? " / " + fmt(s.size2, 2) : ""}${s.note ? " (" + s.note + ")" : ""}`).join(" | ");
      rows.push(`<tr>
        <td>${esc(span.id)}</td><td>${esc(c.catalogId || "")}</td><td class="xr">${esc(c.name || "")}</td>
        <td>${esc(c.importance && IMPORTANCE[c.importance] ? IMPORTANCE[c.importance].label : "—")}</td>
        <td>${esc(c.unit || "")}</td><td>${subs.length}</td>
        <td class="xr">${esc(detail)}</td><td>${c.surveyed === false ? "✗" : "✓"}</td>
      </tr>`);
    }
  }
  const thead = `<thead><tr>
      <th>מפתח</th><th>קוד קטלוג</th><th>שם הרכיב</th><th>סיווג חשיבות</th>
      <th>יחידת מידה</th><th>כמות תת-רכיבים</th><th>פירוט מידות</th><th>נסקר</th>
    </tr></thead>`;
  return { thead, rows };
}
// --- פאנל תוצאה (רגל הגיליון): כותרת אפורה+טקסט אדום, פאנל ציאן, תווית
// אדומה מודגשת בתיבה לבנה, ערך שחור מודגש בתיבה לבנה — כמו בקובץ המקור ---
function xlsxPdfResultPanel(bannerText, rowsSpec) {
  const rows = rowsSpec.map(([label, formulaText, value, numFmt]) => `
    <div class="xlsx-pdf-panel-row">
      <span class="xlsx-pdf-box xlsx-pdf-label" dir="ltr">${esc(label)}</span>
      <span class="xlsx-pdf-formula">${esc(formulaText)}</span>
      <span class="xlsx-pdf-box xlsx-pdf-value">${fmt(value, numFmt)}</span>
    </div>`).join("");
  return `<div class="xlsx-pdf-banner">${esc(bannerText)}</div>
    <div class="xlsx-pdf-panel">${rows}</div>`;
}
function xlsxPdfScoreTableParts(pairs, showSpanCol) {
  const rows = pairs.map(({ comp, res, spanId }) => {
    const win = xlsxPdfWinningDefectInfo(comp, res);
    const notExist = !res.surveyed;
    const impLabel = res.aux ? "" : (IMPORTANCE[comp.importance] ? IMPORTANCE[comp.importance].label : "");
    return `<tr>
      <td>${esc(comp.catalogId || "")}</td><td class="xr">${esc(comp.name || "")}</td>
      ${showSpanCol ? `<td>${esc(spanId)}</td>` : ""}
      <td class="xinfo">${esc(impLabel)}</td>
      <td class="xin">${esc(win.code)}</td>
      <td class="xin">${notExist ? "" : fmt(res.sMax, 0)}</td>
      <td class="xin">${notExist ? "" : esc(win.ex)}</td>
      <td class="xinfo">${notExist ? "0" : fmt(res.ecs)}</td>
      <td class="xinfo">${notExist ? "0" : fmt(res.ecf)}</td>
      <td class="xinfo"><strong>${notExist ? "0" : fmt(res.eci)}</strong></td>
      <td class="xinfo">${fmt(res.eif)}</td>
      <td class="xr">${notExist ? "הרכיב אינו קיים" : ""}</td>
    </tr>`;
  });
  const thead = `<thead><tr>
      <th>קוד רכיב</th><th>שם הרכיב</th>${showSpanCol ? "<th>מפתח</th>" : ""}
      <th>סיווג חשיבות</th><th>קוד פגם</th><th>חומרה</th><th>היקף</th>
      <th>Ecs</th><th>Ecf</th><th>Eci</th><th>Eif</th><th>הערות</th>
    </tr></thead>`;
  return { thead, rows };
}
function xlsxPdfScoreFooterHtml(footer) {
  return xlsxPdfResultPanel("ערך דירוג מצב המבנה", [
      ["SCSAV=", "sum(Eci·Eif)/sum(Eif) =", footer.scsAv, 3],
      ["SCSCRIT=", "max{Eci בדרגת חשיבות גבוהה מאוד} =", footer.scsCrit, 3],
    ]) + xlsxPdfResultPanel("ערך סמן דירוג מצב המבנה", [
      ["Condition PIAV=", "100-2{(SCSAV)²+(6.5·SCSAV)-7.5} =", footer.cpiAv, 2],
      ["Condition PICrit=", "100-2{(SCSCrit)²+(6.5·SCSCrit)-7.5} =", footer.cpiCrit, 2],
    ]);
}
// --- רשימת "מקטעים" (לא HTML שלם) — כל מקטע הוא טבלה אחת עם כותרת ו-thead
// משלה, ואולי פאנל-תוצאה בסוף. pdf.js ממדד ומפצל כל מקטע לעמודים אמיתיים
// לפי גובה שורות (בדיוק כמו מקטעי דוח הסקירה הרגיל) — כך שאף שורה לא
// נחתכת באמצע במעבר בין עמודים, בניגוד לגרסה הקודמת שחתכה קנבס ארוך לפי
// גובה קבוע בלי להתחשב בגבולות השורות ---
function buildXlsxStyleSections(state, result) {
  const sections = [];
  const compParts = xlsxPdfComponentsTableParts(state);
  sections.push({ title: `חלוקה לרכיבים — ${esc(state.name || state.number || "ללא שם")}`, thead: compParts.thead, rows: compParts.rows, footerHtml: "" });

  if (result.singleUnit) {
    let idx = 0;
    const pairs = [];
    state.spans.forEach((span) => {
      span.components.forEach((comp) => pairs.push({ comp, res: result.unit.components[idx++], spanId: span.id }));
    });
    pairs.sort((a, b) => xlsxPdfNaturalCodeCompare(a.comp.catalogId, b.comp.catalogId));
    const parts = xlsxPdfScoreTableParts(pairs, state.spans.length > 1);
    sections.push({
      title: "גיליון לחישוב ציון המבנה", thead: parts.thead, rows: parts.rows,
      footerHtml: xlsxPdfScoreFooterHtml({ scsAv: result.unit.scsAv, scsCrit: result.unit.scsCrit, cpiAv: result.unit.cpiAv, cpiCrit: result.unit.cpiCrit }),
    });
  } else {
    result.spans.forEach((spanResult, i) => {
      const span = state.spans[i];
      const pairs = span.components.map((comp, j) => ({ comp, res: spanResult.comps[j] }));
      pairs.sort((a, b) => xlsxPdfNaturalCodeCompare(a.comp.catalogId, b.comp.catalogId));
      const parts = xlsxPdfScoreTableParts(pairs, false);
      sections.push({
        title: `גיליון לחישוב ציון המבנה — מפתח ${esc(span.id)} מתוך ${state.spans.length}`, thead: parts.thead, rows: parts.rows,
        footerHtml: xlsxPdfScoreFooterHtml({ scsAv: spanResult.unit.scsAv, scsCrit: spanResult.unit.scsCrit, cpiAv: spanResult.unit.cpiAv, cpiCrit: spanResult.unit.cpiCrit }),
      });
    });
    const dims = state.spans.map((s) => +s.dim || 0);
    const maxCrit = Math.max(...result.spans.map((s) => s.unit.scsCrit));
    const aggRows = result.spans.map((spanResult, i) => `<tr><td>${esc(state.spans[i].id)}</td><td>${fmt(dims[i])}</td>
        <td class="xin">${fmt(spanResult.unit.scsAv, 3)}</td>
        <td class="${spanResult.unit.scsCrit === maxCrit ? "xmax" : "xin"}">${fmt(spanResult.unit.scsCrit, 3)}</td></tr>`);
    const aggThead = `<thead><tr><th>מס' מפתח</th><th>Deck Area</th><th>SCS av</th><th>SCS crit</th></tr></thead>`;
    // אותו פאנל תוצאה (כותרת אפורה+פאנל ציאן+תיבות) כמו בכל גיליון מפתח,
    // כדי שיתאים חזותית ולא ייפול לבאג-פריסה של טבלה ad-hoc נפרדת
    const aggFooter = xlsxPdfScoreFooterHtml({
      scsAv: result.bridge.method_norm.scsAv, scsCrit: result.bridge.scsCrit,
      cpiAv: result.bridge.method_norm.cpiAv, cpiCrit: result.bridge.cpiCrit,
    });
    sections.push({ title: "חישוב דירוג מצב המבני לקבוצה — סיכום כל המפתחים", thead: aggThead, rows: aggRows, footerHtml: aggFooter });
  }
  return sections;
}
