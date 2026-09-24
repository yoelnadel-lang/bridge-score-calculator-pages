// ============================================================================
// pdf.js — שני ייצואים נפרדים:
//   exportReport()  — "דוח סקירה", בפורמט הרשמי (7 מקטעים, לרוחב, כותרת+
//                      מספור עמוד חוזרים בכל עמוד — לפי Bridge Inspections.pdf)
//   exportSummary() — "תקציר מנהלים", מסמך נפרד קטן (מדי מהירות + רכיב קריטי)
// שניהם html2canvas + jsPDF, מבוססי-תמונה — עברית RTL מלאה.
// ============================================================================
"use strict";

const PdfExport = (() => {
  // --- דוח סקירה: A4 לרוחב, כל עמוד div נפרד (לא קנבס ארוך שנחתך) —
  // כך שכותרת המבנה ומספור העמוד יכולים לחזור אמיתית על כל עמוד ---
  const PAGE_W_MM = 297, PAGE_H_MM = 210;
  const PAGE_W_PX = Math.round((PAGE_W_MM / 25.4) * 96);   // 1122
  const PAGE_H_PX = Math.round((PAGE_H_MM / 25.4) * 96);   //  794
  const GOV_PAD = 14;

  // --- תקציר מנהלים: A4 לאורך, קנבס ארוך אחד שנחתך (כמו קודם) ---
  const PORTRAIT_W_PX = 794;
  const PORTRAIT_H_PX = Math.round((PORTRAIT_W_PX * 297) / 210);
  const PORTRAIT_W_MM = 210, PORTRAIT_H_MM = 297;

  const SCALE = 2;
  const JPEG_QUALITY = 0.92;

  // cls: המחלקה שבתוכה בפועל יירונדר התוכן שנמדד כאן (gov-page/idcard-page) —
  // קריטי כי font-size שונה בין המחלקות (13.3px מול 11px), ומדידת גובה שורה
  // בלי המחלקה הנכונה (ברירת המחדל של body, 16px) מגדילה את האומדן ב-15%+
  // ומובילה את paginateRows לעצור מוקדם מדי ולהשאיר שטח עמוד לא מנוצל
  function makeScratch(cls) {
    const el = document.createElement("div");
    if (cls) el.className = cls;
    el.style.cssText = "position:absolute;top:0;left:-20000px;background:#fff;";
    document.body.appendChild(el);
    return el;
  }

  // --- כותרת חוזרת בראש כל עמוד (שם/מספר מבנה, סוקר, חברה, דף N מתוך M) ---
  // "דו"ח סקירה" מופיע רק בעמוד הראשון, מעל הטבלה החוזרת — כך גם במקור
  // reportTitle: הכותרת שבשורת הלוגואים — "דו"ח סקירה" כברירת מחדל, "תקציר
  // מנהלים" בתקציר (אותה כותרת בדיוק, כדי ששני המסמכים ייראו מאותו הבית)
  function govHeaderHTML(state, pageNum, totalPages, reportTitle) {
    // לוגו החברה (קבוע, logo.jpeg) בפינה הימנית, לוגואי מזמין העבודה
    // (state.clientLogos, אחד או כמה) בפינה השמאלית — עמוד 1 בלבד. תיבה
    // ריקה בצד שמאל גם כשאין לוגו למזמין, כדי שהכותרת תישאר ממורכזת
    const clientLogos = (state.clientLogos || []).map((url) =>
      `<div class="gov-logo-box"><img src="${esc(url)}"></div>`).join("");
    const title = pageNum === 1 ? `<div class="gov-title-row">
      <div class="gov-logo-box gov-logo-ours"><img src="logo.jpeg"></div>
      <div class="gov-report-title">${esc(reportTitle || 'דו"ח סקירה')}</div>
      <div class="gov-logo-group">${clientLogos || '<div class="gov-logo-box"></div>'}</div>
    </div>` : "";
    return `${title}<table class="gov-head">
      <tr>
        <td class="gov-head-label">שם המבנה:</td><td>${esc(state.name || "—")}</td>
        <td class="gov-head-label">מספר המבנה:</td><td dir="ltr">${esc(state.number || "—")}</td>
        <td class="gov-head-pageno">דף ${pageNum} מתוך ${totalPages}</td>
      </tr>
      <tr>
        <td class="gov-head-label">שם הסוקר:</td><td>${esc(state.surveyorName || "—")}</td>
        <td class="gov-head-label">שם החברה:</td><td colspan="2">${esc(state.companyName || "—")}</td>
      </tr>
    </table>`;
  }
  // סעיף 1 ("נתונים כלליים") מוצג במקור בלי מספר סוגריים, עם נקודתיים בסוף;
  // שאר הסעיפים מוצגים "[n] כותרת" — כך גם ב-Bridge Inspections.pdf
  function govSectionTitle(n, title) {
    return n === 1
      ? `<div class="gov-section-title">${esc(title)}:</div>`
      : `<div class="gov-section-title">[${n}] ${esc(title)}</div>`;
  }

  // --- מדידת גובה שורות אמיתי (רינדור בפועל, לא הערכה) לפיצול טבלה ארוכה
  // לעמודים — כותרת הטבלה חוזרת על כל עמוד ---
  function measureRowHeights(theadHtml, rowsHtml, contentWidthPx, scratch, tableClass) {
    const table = document.createElement("table");
    table.className = tableClass || "gov-table";
    table.style.width = contentWidthPx + "px";
    table.innerHTML = theadHtml + `<tbody>${rowsHtml.join("")}</tbody>`;
    scratch.appendChild(table);
    const theadH = table.querySelector("thead").getBoundingClientRect().height;
    const heights = [...table.querySelectorAll("tbody > tr")].map((tr) => tr.getBoundingClientRect().height);
    table.remove();
    return { theadH, heights };
  }
  function paginateRows(rowsHtml, heights, availableBodyHeight) {
    const pages = [];
    let cur = [], curH = 0;
    for (let i = 0; i < rowsHtml.length; i++) {
      const h = heights[i] || 0;
      if (cur.length && curH + h > availableBodyHeight) { pages.push(cur); cur = []; curH = 0; }
      cur.push(rowsHtml[i]); curH += h;
    }
    if (cur.length) pages.push(cur);
    return pages;
  }

  // --- מיון היררכי-מספרי למספרי רכיב/פגם ("1.4", "9", "12", "02.07"...) —
  // לא מיון טקסטואלי (ש"12" > "9" אבל "12" < "9" לקסיקוגרפית), אלא השוואת
  // כל מקטע בין הנקודות כמספר בנפרד. קודים חסרים נדחים לסוף. ---
  function naturalCodeCompare(a, b) {
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
  // רכיבי מפתח ממוינים לפי מספר הקטלוג — הסדר בדוח תמיד לפי המספור, גם אם
  // הרכיבים הוזנו למערכת בסדר אחר
  function sortedComponents(span) {
    return [...span.components].sort((a, b) => naturalCodeCompare(a.catalogId, b.catalogId));
  }
  // פגמים בתוך רכיב ממוינים לפי קוד הפגם (FF.DD)
  function sortedDefects(comp) {
    return [...comp.defects].sort((a, b) => naturalCodeCompare(a.def, b.def));
  }

  // ============================================================================
  // מקטע 1: נתונים כלליים (עמוד אחד קבוע)
  // ============================================================================
  function buildGeneralDataPage(state, result, photoStore) {
    const insp = computeNextInspection(state);
    // שורה אחת לכל שדה, כמו בעמוד המקביל ב-Bridge Inspections.pdf (לא שני
    // שדות זה-לצד-זה) — קודי הסעיפים שכבר קיימים ב-ID_CARD_GROUPS חוזרים כאן
    // לעקביות עם לשונית ת.ז
    const rows = [
      ["01.01", "מספר המבנה", `<span dir="ltr">${esc(state.number || "—")}</span>`],
      ["01.02", "שם המבנה", esc(state.name || "—")],
      [null, "שם המזמין", esc(state.client || "—")],
      [null, "מתכנן המבנה", esc(state.designer || "—")],
      ["01.06", "כביש מס'", `<span dir="ltr">${esc(state.roadNumber || "—")}</span>`],
      ["01.11", "קואורדינטה X", `<span dir="ltr">${esc(state.coordX || "—")}</span>`],
      ["01.10", "קואורדינטה Y", `<span dir="ltr">${esc(state.coordY || "—")}</span>`],
      [null, "סוג הסקירה", esc(state.surveyType || "—")],
      ["02.01", "סיווג ראשי", esc(STRUCTURE_CLASSES[state.structureClass].label)],
      ["04.01", "מספר מפתחים / יחידות", String(state.spanCount)],
      [null, "שם הסוקר", esc(state.surveyorName || "—")],
      [null, "שם החברה", esc(state.companyName || "—")],
      [null, "תאריך הסקירה הנוכחית", esc(fmtIsoDate(state.inspDate))],
      [null, "תאריך הסקירה הבאה (מומלץ)", esc(insp ? fmtDateDMY(insp.effective) : "—")],
      [null, "CPI Average", `<span class="gov-kv-cpi">${fmt(result.bridge.method_norm.cpiAv)}</span>`],
      [null, "CPI Critical", `<span class="gov-kv-cpi">${fmt(result.bridge.cpiCrit)}</span>`],
    ];
    const trs = rows.map(([code, label, val]) =>
      `<tr><th>${code ? esc(code) + " " : ""}${esc(label)}</th><td>${val}</td></tr>`).join("");
    const photoCode = (state.idCardMainPhoto || "").trim();
    const photoEntry = photoCode ? photoStore.get(photoCode) : null;
    const photoBox = photoEntry
      ? `<div class="gov-general-photo"><img src="${photoEntry.dataUrl}"></div>`
      : "";
    return [`${govSectionTitle(1, "נתונים כלליים")}
      <div class="gov-general-wrap">
        <table class="gov-kv">${trs}</table>
        ${photoBox}
      </div>
      ${immediateAttentionBlock(state)}`];
  }

  // תשומת לב מיידית — מוצג מודגש בעמוד הראשון, מיד מתחת לנתונים הכלליים,
  // ורק אם מולא. זהו ליקוי דחוף ולכן הוא לא נדחק לסוף הדוח.
  function immediateAttentionBlock(state) {
    const ia = state.immediateAttention || { text: "", photo: "" };
    const text = (ia.text || "").trim(), photo = (ia.photo || "").trim();
    if (!text && !photo) return "";
    return `<div class="gov-attention">
      <div class="gov-attention-title">⚠ תשומת לב מיידית</div>
      ${text ? `<div class="gov-attention-text">${esc(text)}</div>` : ""}
      ${photo ? `<div class="gov-attention-codes">קוד תמונה: <span dir="ltr">${esc(photo)}</span></div>` : ""}
    </div>`;
  }

  // ============================================================================
  // מקטע 2: תיעוד ממצאים (תמונות תיעוד כלליות, לא קשורות לרכיב ספציפי)
  // ============================================================================
  function buildFindingsPages(state, budgetInfo, scratch) {
    if (!state.findingPhotos.length) return [];
    const rows = state.findingPhotos.map((f, i) => `<tr>
      <td>${i + 1}</td><td>${esc(f.desc || "")}</td>
      <td><span dir="ltr">${esc(parsePhotoCodes(f.photo).join("; "))}</span></td>
    </tr>`);
    const thead = `<thead><tr><th>מס"ד</th><th>תיאור הממצאים</th><th>שם התמונה</th></tr></thead>`;
    const { theadH, heights } = measureRowHeights(thead, rows, budgetInfo.contentW, scratch);
    const chunks = paginateRows(rows, heights, budgetInfo.bodyHeight - theadH);
    return chunks.map((chunk) => `${govSectionTitle(2, "תיעוד ממצאים")}<table class="gov-table">${thead}<tbody>${chunk.join("")}</tbody></table>`);
  }

  // ============================================================================
  // מקטע 3: תיעוד סקירת רכיבים — שורה לכל פגם (רכיבים "לא נסקרו" ורשומות
  // "רכיב תקין" לא מופיעים כאן, בדיוק כמו בדוח הרשמי)
  // ============================================================================
  function buildComponentReviewPages(state, budgetInfo, scratch) {
    const rows = [];
    for (const span of state.spans) {
      for (const c of sortedComponents(span)) {
        if (!c.surveyed) continue;
        for (const d of sortedDefects(c)) {
          if (d.note === "רכיב תקין") continue;
          const cat = DEFECT_CATALOG.defects.find((x) => x.code === d.def);
          rows.push(`<tr>
            <td>${span.id}</td>
            <td>${esc((c.catalogId != null ? c.catalogId + ". " : "") + c.name)}</td>
            <td>${d.sub}</td>
            <td>${esc(d.def || "—")}${cat ? " " + esc(cat.name_he) : ""}</td>
            <td class="gov-col-s">${d.s}</td><td class="gov-col-ex">${esc(d.ex)}</td>
            <td>${esc(d.note || "")}</td>
            <td dir="ltr">${esc(d.photo || "")}</td>
          </tr>`);
        }
      }
    }
    const thead = `<thead><tr><th>מפתח</th><th>רכיב</th><th>מס' משנה</th><th>פגם</th><th class="gov-col-s">S</th><th class="gov-col-ex">Ex</th><th>הערות</th><th>קוד תמונה</th></tr></thead>`;
    if (!rows.length) {
      return [`${govSectionTitle(3, "תיעוד סקירת רכיבים")}<table class="gov-table">${thead}<tbody><tr><td colspan="8" class="gov-empty">לא נרשמו פגמים</td></tr></tbody></table>`];
    }
    // מקרא S/Ex/Def — כמו ב-Bridge Inspections.pdf, בעמוד האחרון של המקטע בלבד.
    // <bdi> מבודד כל מילה באנגלית מהטקסט העברי שסביבה — בלי זה, אלגוריתם
    // ה-bidi (השורה כולה RTL) עלול לערבב את סדר התצוגה של עברית/אנגלית
    // סמוכות ולהפוך את המקרא לבלתי קריא
    const legend = `<div class="gov-legend">S = דרגת חומרה <bdi>severity</bdi> &nbsp;&nbsp; Ex = היקף <bdi>extent</bdi> &nbsp;&nbsp; Def. = סוג פגם <bdi>defect type</bdi></div>`;
    const legendH = measureLegendHeight(legend, scratch);
    const { theadH, heights } = measureRowHeights(thead, rows, budgetInfo.contentW, scratch);
    const chunks = paginateRows(rows, heights, budgetInfo.bodyHeight - theadH);
    // רק העמוד האחרון צריך מקום למקרא — אם השורה האחרונה לא נכנסת יחד איתו,
    // מעבירים אותה בלבד לעמוד חדש כדי שהמקרא לא ייחתך מתחת לעמוד. מדדים לפי
    // אינדקס (לא לפי תוכן ה-HTML) — שורות פגם זהות חוזרות על עצמן בקלות
    // (אותו קוד/חומרה בכמה תתי-רכיבים), ו-indexOf על מחרוזת היה מוצא תמיד
    // את המופע הראשון ומחזיר גובה שגוי
    const lastPageRoom = budgetInfo.bodyHeight - theadH - legendH;
    if (chunks.length) {
      const last = chunks[chunks.length - 1];
      const startIdx = rows.length - last.length;
      const lastH = heights.slice(startIdx).reduce((a, b) => a + b, 0);
      if (lastH > lastPageRoom && last.length > 1) chunks.push([last.pop()]);
    }
    return chunks.map((chunk, i) =>
      `${govSectionTitle(3, "תיעוד סקירת רכיבים")}<table class="gov-table">${thead}<tbody>${chunk.join("")}</tbody></table>${i === chunks.length - 1 ? legend : ""}`);
  }
  function measureLegendHeight(html, scratch) {
    const el = document.createElement("div");
    el.innerHTML = html;
    scratch.appendChild(el);
    const h = el.getBoundingClientRect().height;
    el.remove();
    return h;
  }

  // ============================================================================
  // מקטע 4: סיכום כמויות וציוני ECS לכל רכיב מדורג + שורת סיכום SCS/CPI
  // ============================================================================
  function buildQuantitySummaryPages(state, budgetInfo, scratch, result) {
    const rows = [];
    for (const span of state.spans) {
      for (const c of sortedComponents(span)) {
        if (!c.surveyed || c.importance == null) continue;   // עזר/לא-נסקר לא נכלל בציון
        const defects = c.defects.map((d) => ({ sub: d.sub, s: d.s, ex: d.ex, def: d.def }));
        const calcComp = Calc.computeComponent(
          { key: c.uid, name: c.name, importance: c.importance, surveyed: c.surveyed, subs: c.subs }, defects
        );
        const qty = c.subs.reduce((a, s) => a + (+s.size || 0), 0);
        rows.push(`<tr>
          <td>${span.id}</td>
          <td>${esc((c.catalogId != null ? c.catalogId + ". " : "") + c.name)}</td>
          <td>${fmt(qty, 2)}</td><td>${esc(c.unit || "")}</td><td>${fmt(calcComp.ecs, 2)}</td>
        </tr>`);
      }
    }
    const thead = `<thead><tr><th>מפתח</th><th>רכיב</th><th>כמות</th><th>יחידת מידה</th><th>ECS</th></tr></thead>`;
    const summaryLine = `<div class="gov-summary-line">
      <strong>SCS Critical</strong> = ${fmt(result.bridge.scsCrit, 2)} &nbsp;&nbsp;
      <strong>SCS Average</strong> = ${fmt(result.bridge.method_norm.scsAv, 3)}<br>
      <strong>CPI Critical</strong> = ${fmt(result.bridge.cpiCrit, 2)} &nbsp;&nbsp;
      <strong>CPI Average</strong> = ${fmt(result.bridge.method_norm.cpiAv, 2)}
    </div>`;
    if (!rows.length) {
      return [`${govSectionTitle(4, "סיכום כמויות וציוני ECS")}<table class="gov-table">${thead}<tbody><tr><td colspan="5" class="gov-empty">אין רכיבים מדורגים</td></tr></tbody></table>${summaryLine}`];
    }
    const { theadH, heights } = measureRowHeights(thead, rows, budgetInfo.contentW, scratch);
    const chunks = paginateRows(rows, heights, budgetInfo.bodyHeight - theadH);
    return chunks.map((chunk, i) => `${govSectionTitle(4, "סיכום כמויות וציוני ECS")}<table class="gov-table">${thead}<tbody>${chunk.join("")}</tbody></table>${i === chunks.length - 1 ? summaryLine : ""}`);
  }

  // ============================================================================
  // מקטע 5: הערות הסוקר — אך ורק ההערות החופשיות שהוזנו בפועל בלשונית
  // "הערות הסוקר" (state.surveyorNotes). בעבר המקטע כלל גם פרשנות אוטומטית
  // של ציוני CPI Av/Crit וסייג אחריות קבוע — לפי בקשה מפורשת, אין יותר שום
  // תוכן אוטומטי/ברירת מחדל כאן: אם לא הוזנו הערות, מוצגת שורת "לא הוזנו
  // הערות" בלבד, בדיוק כמו "לא נרשמו פגמים" במקטע 3.
  // ============================================================================
  function buildSurveyorNotesPage(state, budgetInfo, scratch) {
    const items = state.surveyorNotes
      .filter((n) => n.text && n.text.trim())
      .map((n) => esc(n.text));
    const thead = `<thead><tr><th>מספר</th><th>תיאור</th></tr></thead>`;
    if (!items.length) {
      return [`${govSectionTitle(5, "הערות הסוקר")}<table class="gov-table">${thead}<tbody><tr><td colspan="2" class="gov-empty">לא הוזנו הערות סוקר</td></tr></tbody></table>`];
    }
    const rows = items.map((t, i) => `<tr><td>${i + 1}</td><td>${t}</td></tr>`);
    const { theadH, heights } = measureRowHeights(thead, rows, budgetInfo.contentW, scratch);
    const chunks = paginateRows(rows, heights, budgetInfo.bodyHeight - theadH);
    return chunks.map((chunk) =>
      `${govSectionTitle(5, "הערות הסוקר")}<table class="gov-table gov-notes">${thead}<tbody>${chunk.join("")}</tbody></table>`);
  }

  // ============================================================================
  // מקטע 6: תמונות — רשת 2×2, כיתוב מעל + שם קובץ מתחת
  // ============================================================================
  function collectPhotoItems(state, photoStore) {
    const items = [];
    // הסדר כאן חייב לשקף בדיוק את סדר הופעת המקטעים בדוח עצמו (1←2←3←...)
    // כדי שגלריית התמונות בסוף תהיה "עותק" של סדר הופעתן לאורך הדוח —
    // תשומת לב מיידית → ממצאים (מקטע 2) → רכיבים ממוינים ← פגמים ממוינים
    // בתוכם (מקטע 3) → ת.ז (לא חלק מ"דוח סקירה" עצמו, לכן בסוף)
    for (const code of parsePhotoCodes((state.immediateAttention || {}).photo)) {
      const entry = photoStore.get(code);
      if (entry && entry.kind === "photo") {
        items.push({ dataUrl: entry.dataUrl, filename: entry.filename, caption: "תשומת לב מיידית" });
      }
    }
    for (const f of state.findingPhotos) {
      for (const code of parsePhotoCodes(f.photo)) {
        const entry = photoStore.get(code);
        if (entry && entry.kind === "photo") items.push({ dataUrl: entry.dataUrl, filename: entry.filename, caption: f.desc || "" });
      }
    }
    for (const span of state.spans) {
      for (const c of sortedComponents(span)) {
        for (const d of sortedDefects(c)) {
          const cat = DEFECT_CATALOG.defects.find((x) => x.code === d.def);
          for (const code of parsePhotoCodes(d.photo)) {
            const entry = photoStore.get(code);
            if (entry && entry.kind === "photo") {
              items.push({ dataUrl: entry.dataUrl, filename: entry.filename,
                caption: `${c.name}${cat ? " — " + cat.name_he : d.note ? " — " + d.note : ""}` });
            }
          }
        }
      }
    }
    for (const group of ID_CARD_GROUPS) {
      for (const f of group.fields) {
        if (f.type !== "photo") continue;
        for (const code of parsePhotoCodes((state.idCard || {})[f.code])) {
          const entry = photoStore.get(code);
          if (entry && entry.kind === "photo") items.push({ dataUrl: entry.dataUrl, filename: entry.filename, caption: f.label });
        }
      }
    }
    return items;
  }
  function buildPhotoPages(items) {
    if (!items.length) return [];
    const groups = [];
    for (let i = 0; i < items.length; i += 4) groups.push(items.slice(i, i + 4));
    return groups.map((group) => {
      const cells = group.map((it) => `
        <div class="gov-photo-cell">
          <div class="gov-photo-caption">${esc(it.caption || "")}</div>
          <img src="${it.dataUrl}" class="gov-photo-img">
          <div class="gov-photo-filename">${esc(it.filename)}</div>
        </div>`).join("");
      const pad = '<div class="gov-photo-cell empty"></div>'.repeat(4 - group.length);
      return `${govSectionTitle(6, "תמונות")}<div class="gov-photo-grid">${cells}${pad}</div>`;
    });
  }

  // ============================================================================
  // מקטע 7: תרשימים — סקיצה אחת בעמוד, כותרת שהוגדרה ידנית מעל
  // ============================================================================
  function buildSketchPages(state, photoStore) {
    const items = state.sketches
      .map((s) => ({ ...s, entry: photoStore.get((s.code || "").trim()) }))
      .filter((s) => s.entry);
    // nativeImage: התרשים לא עובר דרך הרסטר של html2canvas אלא מוטמע ישירות
    // ב-PDF (ר' buildReportPdf) — כך הוא נשמר ברזולוציה המקורית שלו במקום
    // להיחתך לרזולוציית העמוד, ונדחס פעם אחת במקום פעמיים.
    return items.map((it) => ({
      nativeImage: true,
      html: `
        ${govSectionTitle(7, "תרשימים")}
        <div class="gov-sketch-caption">${esc(it.caption || it.code)}</div>
        <div class="gov-sketch-wrap"><img src="${it.entry.dataUrl}" class="gov-sketch-img"></div>`,
    }));
  }

  // ============================================================================
  // נספח: קוד/י שחזור (QR) — מקודד רק את מה שהמשתמש הזין (ר' recovery.js),
  // לא תמונות. סוקר שחוזר לגשר הזה סורק ומקבל את הטופס בחזרה במקום להתחיל
  // מאפס. מבנה קטן ייצא קוד אחד; מבנה גדול מתפצל אוטומטית לכמה קודים,
  // וכולם מרוכזים יחד בעמוד אחד (ר' buildQrAppendixPages).
  // ============================================================================
  // נספחי הערות פנימיות (שינויים/מהנדס/תקשורת) — לא חלק משבעת המקטעים
  // הרשמיים של Bridge Inspections.pdf, ולכן מודפסים כנספח בסוף הדוח, ורק
  // אם יש בהם תוכן בפועל (לפחות הערה אחת לא ריקה) — כדי לא להוסיף עמודים
  // ריקים לדוח כשהצוות לא משתמש בלשונית הזו כלל
  function buildFreeNotesAppendix(sectionNum, title, notes, budgetInfo, scratch) {
    const filled = notes.filter((n) => n.text && n.text.trim());
    if (!filled.length) return [];
    const rows = filled.map((n) => `<tr><td>${esc(fmtIsoDate(n.date))}</td><td>${esc(n.text)}</td></tr>`);
    const thead = `<thead><tr><th>תאריך</th><th>הערה</th></tr></thead>`;
    const { theadH, heights } = measureRowHeights(thead, rows, budgetInfo.contentW, scratch);
    const chunks = paginateRows(rows, heights, budgetInfo.bodyHeight - theadH);
    return chunks.map((chunk) =>
      `${govSectionTitle(sectionNum, `נספח — ${title}`)}<table class="gov-table gov-notes">${thead}<tbody>${chunk.join("")}</tbody></table>`);
  }

  // כל קודי ה-QR מרוכזים בעמוד אחד (לא מפוצלים ל-2-per-page כמו קודם) —
  // מספר העמודות ברשת מתאים את עצמו למספר הקודים בפועל, כך שסקירה רגילה
  // (2-4 קודים) עדיין מקבלת קודים גדולים וקריאים, וגם סקירה גדולה יוצאת
  // בעמוד אחד בלבד. כל קוד מקבל כותרת ברורה על מה שהוא נותן ("חלק N מתוך
  // M... ללא תמונות") — לא רק "קוד שחזור N" יבש.
  function buildQrAppendixPages(state, sectionNum) {
    let images;
    try {
      images = encodeStateToQrChunks(state).map((text) => {
        const qr = qrcode(0, "M");
        qr.addData(text);
        qr.make();
        return qr.createDataURL(8, 4);
      });
    } catch (e) {
      // הנספח הוא תוספת רשות — כישלון בהפקתו לא יפיל את הדוח כולו
      console.warn("נספח קוד השחזור דולג:", e);
      return [];
    }
    if (!images.length) return [];
    const cols = Math.min(images.length, 4);
    const cells = images.map((dataUrl, i) => `
      <div class="gov-qr-cell">
        <div class="gov-qr-caption">
          <strong>קוד שחזור ${i + 1} מתוך ${images.length}</strong>
          <span>נתוני הסקירה (טקסט בלבד — ללא תמונות)</span>
        </div>
        <img src="${dataUrl}" class="gov-qr-img">
      </div>`).join("");
    return [`${govSectionTitle(sectionNum, "נספח — קוד שחזור (לא כולל תמונות)")}
      <p class="gov-qr-hint">סריקת הקודים בכלי "שחזור מ-QR" מחזירה את תוכן הדוח לטופס. השחזור מלא רק לאחר סריקת כל ${images.length} הקודים יחד; התמונות אינן נכללות ויש לצרפן מחדש (למשל מקובץ ה-ZIP).</p>
      <div class="gov-qr-grid" style="grid-template-columns: repeat(${cols}, 1fr);">${cells}</div>`];
  }

  // ממתין לטעינת תמונה, עם timeout הגנתי — decode()/load עלולים לא להסתיים
  // לעולם אם הכרטיסייה עוברת לרקע באמצע הייצוא (למשל טאב אחר נפתח)
  function waitForImage(img, timeoutMs = 4000) {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { clearTimeout(t); img.removeEventListener("load", done); img.removeEventListener("error", done); resolve(); };
      const t = setTimeout(done, timeoutMs);
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
  }
  async function decodeImages(root) {
    await Promise.all([...root.querySelectorAll("img")].map((img) => waitForImage(img)));
  }

  // html2canvas מצייר כל <img> לתוך תיבת האלמנט ומתעלם מ-object-fit, ולכן
  // תמונה שהתיבה שלה ביחס צדדים אחר יוצאת מתוחה ("מרוחה") בקובץ ה-PDF — גם
  // כשעל המסך היא נראית תקין. הפתרון: אחרי שהפריסה חושבה, מודדים את התיבה
  // שהוקצתה ומקבעים על התמונה עצמה רוחב/גובה ששומרים על היחס בתוכה, כך
  // שהתיבה והתמונה זהות ואין מה למתוח. חייב לרוץ אחרי decodeImages —
  // לפני שהתמונה נטענת אין naturalWidth.
  function fitImages(root) {
    for (const img of root.querySelectorAll("img")) {
      const natW = img.naturalWidth, natH = img.naturalHeight;
      if (!natW || !natH) continue;
      const box = img.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const scale = Math.min(box.width / natW, box.height / natH);
      img.style.width = Math.floor(natW * scale) + "px";
      img.style.height = Math.floor(natH * scale) + "px";
      img.style.objectFit = "fill";   // התיבה כבר ביחס הנכון — אין מה להתאים
      img.style.flex = "0 0 auto";    // לא לתת ל-flex למתוח אותה בחזרה
      img.style.margin = "auto";      // ממורכזת במקום שנותר בתא
    }
  }

  // בונה את מופע ה-jsPDF של "דוח סקירה" בלי לשמור אותו — קרוא גם מ-exportReport
  // (הורדה ישירה) וגם מ-exportZip (חבילת ZIP עם קובץ הטעינה).
  // watermark=true: מוסיף "טיוטה להגשה" באלכסון לכל עמוד — משפיע רק על
  // הקובץ המיוצא, לא על state/נתוני הסקירה (ר' checkbox בסרגל הכלים)
  async function buildReportPdf(scratch, container, watermark) {
    const input = buildEngineInput();
    const result = Calc.computeStructure(input);

    // מדידת השטח הפנוי לתוכן בעמוד — כותרת + סרגל כותרת מקטע חוזרים על כל עמוד
    const probe = document.createElement("div");
    probe.className = "gov-page";
    probe.innerHTML = govHeaderHTML(state, 1, 99) + govSectionTitle(1, "מדידה");
    scratch.appendChild(probe);
    const headerH = probe.querySelector(".gov-head").getBoundingClientRect().height;
    const titleH = probe.querySelector(".gov-section-title").getBoundingClientRect().height;
    probe.remove();
    const contentW = PAGE_W_PX - GOV_PAD * 2;
    const bodyHeight = PAGE_H_PX - GOV_PAD * 2 - headerH - titleH - 10;
    const budgetInfo = { bodyHeight, contentW };

    // נספחי ההערות החופשיות (שינויים/מהנדס/תקשורת) מודפסים רק אם מולאו —
    // המספור שלהם וכן של נספח ה-QR שאחריהם רץ ברצף לפי מי שבאמת מודפס,
    // כדי לא להשאיר "חורים" במספור (למשל [8]‏ ואז [11] כי 9,10 היו ריקים)
    let apNum = 8;
    const changeAppendix = buildFreeNotesAppendix(apNum, "שינויים", state.changeNotes, budgetInfo, scratch);
    if (changeAppendix.length) apNum++;
    const engineerAppendix = buildFreeNotesAppendix(apNum, "הערות מהנדס בוחן", state.engineerNotes, budgetInfo, scratch);
    if (engineerAppendix.length) apNum++;
    const communicationAppendix = buildFreeNotesAppendix(apNum, "תקשורת", state.communicationNotes, budgetInfo, scratch);
    if (communicationAppendix.length) apNum++;

    const pageBodies = [
      ...buildGeneralDataPage(state, result, photoStore),
      ...buildFindingsPages(state, budgetInfo, scratch),
      ...buildComponentReviewPages(state, budgetInfo, scratch),
      ...buildQuantitySummaryPages(state, budgetInfo, scratch, result),
      ...buildSurveyorNotesPage(state, budgetInfo, scratch),
      ...buildPhotoPages(collectPhotoItems(state, photoStore)),
      ...buildSketchPages(state, photoStore),
      ...changeAppendix,
      ...engineerAppendix,
      ...communicationAppendix,
      ...buildQrAppendixPages(state, apNum),
    ];

    const total = pageBodies.length;
    const pdf = new jspdf.jsPDF("l", "mm", "a4");
    for (let i = 0; i < total; i++) {
      const spec = pageBodies[i];
      const isNative = typeof spec === "object" && spec.nativeImage;
      const pageEl = document.createElement("div");
      pageEl.className = "gov-page";
      pageEl.innerHTML = govHeaderHTML(state, i + 1, total) + (isNative ? spec.html : spec)
        + (watermark ? '<div class="gov-watermark">טיוטה להגשה</div>' : "");
      container.appendChild(pageEl);
      await decodeImages(pageEl);
      fitImages(pageEl);

      // התרשים מוסתר מהרסטר (visibility שומר על הפריסה, ולכן על המלבן שחושב
      // ב-fitImages) ומוטמע אחר כך ישירות ב-PDF באותו מלבן בדיוק
      const native = isNative ? pageEl.querySelector("img.gov-sketch-img") : null;
      let nativeRect = null;
      if (native) {
        const pr = pageEl.getBoundingClientRect(), ir = native.getBoundingClientRect();
        const k = PAGE_W_MM / PAGE_W_PX;
        nativeRect = [(ir.left - pr.left) * k, (ir.top - pr.top) * k, ir.width * k, ir.height * k];
        native.style.visibility = "hidden";
      }

      const canvas = await html2canvas(pageEl, { scale: SCALE, backgroundColor: "#ffffff" });
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", 0, 0, PAGE_W_MM, PAGE_H_MM);
      if (native) pdf.addImage(native.src, "JPEG", ...nativeRect);
      pageEl.remove();
    }
    return pdf;
  }

  // --- ייצוא "דוח סקירה": פורמט רשמי, לרוחב, כותרת+מספור עמוד חוזרים ---
  async function exportReport(watermark) {
    if (!hasAnyComponents()) { alert("אין נתונים לייצוא — הוסף רכיבים תחילה."); return; }
    const scratch = makeScratch("gov-page");
    const container = document.createElement("div");
    container.id = "gov-report";
    document.body.appendChild(container);
    try {
      const pdf = await buildReportPdf(scratch, container, watermark);
      pdf.save(`${watermark ? "טיוטה - " : ""}דוח סקירה - ${state.name || state.number || "ללא שם"}.pdf`);
    } finally {
      scratch.remove();
      container.remove();
    }
  }

  // --- התמונות בתוך ה-ZIP: נשמרות כקבצים בינאריים ולא כ-base64 בתוך ה-JSON,
  // כי base64 מנפח את הנתונים ב-33% והדחיסה לא מחזירה את זה (JPEG כבר דחוס).
  // מניפסט קטן שומר את הקישור קוד⇄קובץ, כדי שטעינה חוזרת של ה-ZIP תשחזר את
  // כל התמונות למקומן ולא רק את הטקסט ---
  const ZIP_PHOTO_DIR = "תמונות";
  const ZIP_MANIFEST = `${ZIP_PHOTO_DIR}/רשימת-תמונות.json`;
  function addPhotosToZip(zip) {
    const manifest = [];
    let i = 0;
    for (const [code, entry] of photoStore) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(entry.dataUrl || "");
      if (!m) continue;
      const ext = (entry.filename || "").split(".").pop() || "jpg";
      const path = `${ZIP_PHOTO_DIR}/${String(++i).padStart(4, "0")}.${ext}`;
      zip.file(path, m[2], { base64: true });
      manifest.push({ code, path, mime: m[1], filename: entry.filename, kind: entry.kind });
    }
    if (manifest.length) zip.file(ZIP_MANIFEST, JSON.stringify(manifest, null, 2));
    return manifest.length;
  }

  // --- קובץ התרשימים (DWG): נוסף ל-ZIP רק אם נבחר בפועל דרך הכפתור (יש
  // Blob אמיתי בזיכרון) — לא כשהשם הוקלד ידנית בלי קובץ מאחוריו. כך מנהל
  // האחזקה מקבל את השרטוט עצמו יחד עם הדוח, במקום רק שם קובץ שצריך לחפש
  // בנפרד במערכת אחרת ---
  const ZIP_DRAWINGS_DIR = "קובץ תרשימים";
  function addDrawingsFileToZip(zip) {
    if (!drawingsFileAttached || !drawingsFileBlob) return false;
    zip.file(`${ZIP_DRAWINGS_DIR}/${state.drawingsFile || "תרשים.dwg"}`, drawingsFileBlob);
    return true;
  }

  // --- ייצוא חבילת ZIP: דוח הסקירה (PDF) + קובץ טעינה (JSON, כל מה שהוזן —
  // בלי תמונות, כמו ה-state עצמו) + תיקיית התמונות + קובץ התרשימים אם צורף.
  // טעינה חוזרת של ה-ZIP כולו משחזרת את הכול; טעינת ה-JSON לבדו — רק טקסט ---
  async function exportZip(watermark) {
    if (!hasAnyComponents()) { alert("אין נתונים לייצוא — הוסף רכיבים תחילה."); return; }
    const scratch = makeScratch("gov-page");
    const container = document.createElement("div");
    container.id = "gov-report";
    document.body.appendChild(container);
    const baseName = state.name || state.number || "ללא שם";
    try {
      const pdf = await buildReportPdf(scratch, container, watermark);
      const zip = new JSZip();
      zip.file(`${watermark ? "טיוטה - " : ""}דוח סקירה - ${baseName}.pdf`, pdf.output("blob"));
      zip.file(`קובץ טעינה - ${baseName}.json`, JSON.stringify(state, null, 2));
      addPhotosToZip(zip);
      addDrawingsFileToZip(zip);
      const zipBlob = await zip.generateAsync({ type: "blob" });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url; a.download = `סקירה - ${baseName}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } finally {
      scratch.remove();
      container.remove();
    }
  }

  // --- תקציר מנהלים: פריסת העמוד (בפיקסלים של עמוד A4 לאורך) ---
  // SUM_PAD_X = שוליים לצדדים, SUM_PAD_TOP = מעל כותרת העמוד, SUM_GAP = בין
  // הכותרת לתוכן, SUM_FOOTER = שורת התחתית (קו + הסתייגות) בתחתית כל עמוד
  const SUM_PAD_X = 28, SUM_PAD_TOP = 22, SUM_GAP = 10, SUM_FOOTER = 44;
  const SUM_CONTENT_W = PORTRAIT_W_PX - SUM_PAD_X * 2;

  // שורת תחתית לעמוד בתקציר המנהלים: קו מפריד, ההסתייגות (SUMMARY_DISCLAIMER)
  // מימין ו"דף N מתוך M" משמאל, באותו גופן כמו שאר הדוח. נכתבת ישירות על קנבס
  // העמוד, כך שהיא בתחתית כל עמוד בדיוק, ובגודל קבוע גם כשהתוכן הוקטן
  function drawSummaryFooter(ctx, pageNo, total) {
    const S = SCALE, x0 = SUM_PAD_X * S, x1 = (PORTRAIT_W_PX - SUM_PAD_X) * S, y = (PORTRAIT_H_PX - 20) * S;
    ctx.save();
    ctx.strokeStyle = "#000"; ctx.lineWidth = S;
    ctx.beginPath(); ctx.moveTo(x0, y - 15 * S); ctx.lineTo(x1, y - 15 * S); ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.font = `${11 * S}px Arial, "Segoe UI", "Noto Sans Hebrew", sans-serif`;
    ctx.direction = "rtl"; ctx.textAlign = "right";
    ctx.fillText(SUMMARY_DISCLAIMER, x1, y);
    ctx.textAlign = "left";
    ctx.fillText(`דף ${pageNo} מתוך ${total}`, x0, y);
    ctx.restore();
  }

  // התקציר בנוי כמכתב: בעמוד 1 נייר מכתבים (לוגו החברה מימין, לוגואי המזמין
  // ותאריך ההפקה משמאל, קו מתחת), אחריו "לכבוד" (כשהוזן מזמין), שורת "הנדון"
  // ופרטי המבנה העיקריים — ורק אז המקטעים. בשאר העמודים: כותרת רצה מצומצמת
  function summaryLetterheadHTML() {
    const today = fmtDateDMY(new Date());
    const clientLogos = (state.clientLogos || []).map((url) =>
      `<div class="gov-logo-box"><img src="${esc(url)}"></div>`).join("");
    const kv = (label, val) => `<th>${esc(label)}:</th><td>${val}</td>`;
    const ltr = (v) => `<span dir="ltr">${esc(v)}</span>`;
    const survey = (state.surveyType || "").trim();
    const surveyTxt = survey ? (survey.startsWith("סקירה") ? survey : "סקירה " + survey) : "סקירה";
    const pairs = [
      ["שם המבנה", esc(state.name || "—")], ["מספר המבנה", ltr(state.number || "—")],
      ["סיווג ראשי", esc(STRUCTURE_CLASSES[state.structureClass].label)], ["מספר מפתחים", String(state.spans.length)],
      ["סוג הסקירה", esc(state.surveyType || "—")], ["תאריך הסקירה", esc(fmtIsoDate(state.inspDate) || "—")],
      ["שם הסוקר", esc(state.surveyorName || "—")], ["שם החברה", esc(state.companyName || "—")],
    ];
    if ((state.roadNumber || "").trim()) pairs.push(["כביש מס'", ltr(state.roadNumber)]);
    let rows = "";
    for (let i = 0; i < pairs.length; i += 2) {
      rows += `<tr>${kv(...pairs[i])}${pairs[i + 1] ? kv(...pairs[i + 1]) : "<th></th><td></td>"}</tr>`;
    }
    return `<div class="sl-top">
        <div class="gov-logo-box sl-logo"><img src="logo.jpeg"></div>
        <div class="sl-top-left">
          ${clientLogos ? `<div class="gov-logo-group">${clientLogos}</div>` : ""}
          <div class="sl-date">תאריך: <span dir="ltr">${today}</span></div>
        </div>
      </div>
      <div class="sl-rule"></div>
      ${(state.client || "").trim() ? `<div class="sl-to">לכבוד<br><strong>${esc(state.client)}</strong></div>` : ""}
      <div class="sl-subject">הנדון: <u>תקציר מנהלים — ${esc(state.name || "ללא שם")}</u></div>
      <div class="sl-subtitle">דוח ${esc(surveyTxt)} · מבנה מספר <span dir="ltr">${esc(state.number || "—")}</span></div>
      <table class="sl-details">${rows}</table>`;
  }
  function summaryRunningHeadHTML() {
    return `<div class="sl-running">
        <span>תקציר מנהלים — ${esc(state.name || "ללא שם")}${state.number ? ` (<span dir="ltr">${esc(state.number)}</span>)` : ""}</span>
        <span dir="ltr">${fmtDateDMY(new Date())}</span>
      </div>`;
  }
  function summaryHeadEl(pageNum) {
    const el = document.createElement("div");
    el.className = "summary-pdf-head";
    el.style.width = SUM_CONTENT_W + "px";
    el.innerHTML = pageNum === 1 ? summaryLetterheadHTML() : summaryRunningHeadHTML();
    document.body.appendChild(el);
    return el;
  }

  // --- ייצוא "תקציר מנהלים": מסמך נפרד, לאורך, עד 2 עמודים ---
  async function exportSummary() {
    if (!hasAnyComponents()) { alert("אין נתונים לייצוא — הוסף רכיבים תחילה."); return; }
    const input = buildEngineInput();
    const result = Calc.computeStructure(input);
    const summary = Calc.executiveSummary(input, result);
    const plan = summary.totalScored ? Calc.improvementPlan(input, result, summary, { safetyKeys: safetyComponentKeys(state) }) : null;
    const el = document.createElement("div");
    el.id = "pdf-summary";
    el.style.width = SUM_CONTENT_W + "px";
    el.innerHTML = renderSummary(state, result, summary, plan);
    // ההסתייגות מודפסת כשורת תחתית בכל עמוד (ר' drawSummaryFooter) ולא בסוף הזרימה
    const inlineDisclaimer = el.querySelector(".summary-disclaimer");
    if (inlineDisclaimer) inlineDisclaimer.remove();
    document.body.appendChild(el);
    const heads = [];
    try {
      await decodeImages(el);
      fitImages(el);
      // גובה הכותרת: בעמוד 1 (עם שורת הלוגואים) ובשאר העמודים
      const probe1 = summaryHeadEl(1), probeN = summaryHeadEl(2);
      await decodeImages(probe1);
      const headH = [probe1.getBoundingClientRect().height, probeN.getBoundingClientRect().height];
      probe1.remove(); probeN.remove();

      // נקודות חיתוך מותרות: תחתית כל בלוק ברמה העליונה וכל שורת טבלה — כך
      // שמעבר עמוד לעולם לא חוצה שורה/פסקה/מד. לא נקודת חיתוך: כותרת מקטע,
      // שורת כותרת של טבלה, ופסקת פתיחה של טבלה (.summary-keep) — כדי שאף
      // אחת מהן לא תישאר לבד בתחתית עמוד, מנותקת ממה שהיא מציגה.
      // טבלה שנחתכה ממשיכה בעמוד הבא עם שורת הכותרת שלה, כמו בדוח הסקירה.
      // f = מקדם הקטנה: התקציר מוגבל ל-2 עמודים; אם התוכן ארוך יותר, מרחיבים
      // את המיכל (התוכן זורם לרוחב ומתקצר) ומקטינים את התמונה בחזרה לרוחב
      // העמוד — הקטנה אחידה של התוכן, עד 60% לכל היותר. הכותרת והתחתית לא
      // מוקטנות
      const MAX_PAGES = 2;
      const layout = (f) => {
        const top = el.getBoundingClientRect().top;
        const breaks = [...el.querySelectorAll(".summary-block > *, tr")]
          .filter((n) => !n.classList.contains("gov-section-title") && !n.classList.contains("summary-keep")
            && !(n.tagName === "TR" && n.querySelector("th"))
            // טבלה קצרה (עד 4 שורות) לא נחתכת — עוברת לעמוד הבא בשלמותה
            && !(n.tagName === "TR" && n.closest("table").querySelectorAll("tbody > tr").length <= 4))
          .map((n) => n.getBoundingClientRect().bottom - top)
          .sort((x, y) => x - y);
        const tables = [...el.querySelectorAll("table")].map((t) => {
          const th = t.querySelector("thead");
          if (!th) return null;
          const r = t.getBoundingClientRect();
          return { top: r.top - top, head: th.getBoundingClientRect().bottom - top, bottom: r.bottom - top };
        }).filter(Boolean);
        // ראש כל בלוק — עמוד חדש מתחיל בראש הבלוק הבא ולא ברווח שמעליו
        // (אחרת מרווח העליון של כותרת מקטע נוסף לריווח שמתחת לכותרת העמוד)
        const tops = [...el.querySelectorAll(".summary-block > *")].map((n) => n.getBoundingClientRect().top - top);
        const totalH = breaks.length ? breaks[breaks.length - 1] : el.getBoundingClientRect().height;
        const slices = [];
        for (let start = 0; start < totalH - 1;) {
          if (slices.length && !tables.some((t) => t.top < start - 1 && start < t.bottom - 1)) {
            const next = tops.filter((t) => t >= start && t - start < 40).sort((a, c) => a - c)[0];
            if (next != null) start = next;
          }
          const hh = headH[slices.length ? 1 : 0];
          const avail = (PORTRAIT_H_PX - SUM_PAD_TOP - hh - SUM_GAP - SUM_FOOTER) / f;
          const tbl = tables.find((t) => t.top < start - 1 && start < t.bottom - 1);
          const rep = tbl ? [tbl.top, tbl.head] : null;
          const room = avail - (rep ? rep[1] - rep[0] : 0);
          const fits = breaks.filter((y) => y > start + 1 && y <= start + room);
          const end = Math.min(totalH, fits.length ? fits[fits.length - 1] : start + room);
          slices.push({ start, end, rep });
          start = end;
        }
        return slices;
      };
      let f = 1;
      let slices = layout(f);
      while (slices.length > MAX_PAGES && f > 0.605) {
        f = Math.round((f - 0.05) * 100) / 100;
        el.style.width = Math.round(SUM_CONTENT_W / f) + "px";
        slices = layout(f);
      }

      const canvas = await html2canvas(el, { scale: SCALE, backgroundColor: "#ffffff" });
      const pdf = new jspdf.jsPDF("p", "mm", "a4");
      const S = SCALE, x = SUM_PAD_X * S, w = SUM_CONTENT_W * S;
      // מעתיק רצועה [y0,y1] מקנבס הזרימה לעמוד בגובה destY; מחזיר את הגובה שצויר
      const strip = (ctx, y0, y1, destY) => {
        const sy = Math.round(y0 * S), sh = Math.round((y1 - y0) * S), dh = Math.round(sh * f);
        ctx.drawImage(canvas, 0, sy, canvas.width, sh, x, destY, w, dh);
        return dh;
      };
      for (let p = 0; p < slices.length; p++) {
        const page = document.createElement("canvas");
        page.width = PORTRAIT_W_PX * S; page.height = PORTRAIT_H_PX * S;
        const ctx = page.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, page.width, page.height);
        const head = summaryHeadEl(p + 1);
        heads.push(head);
        await decodeImages(head);
        fitImages(head);
        const headCanvas = await html2canvas(head, { scale: S, backgroundColor: "#ffffff" });
        ctx.drawImage(headCanvas, x, SUM_PAD_TOP * S);
        let y = (SUM_PAD_TOP + headH[p ? 1 : 0] + SUM_GAP) * S;
        const { start, end, rep } = slices[p];
        if (rep) y += strip(ctx, rep[0], rep[1], y);
        strip(ctx, start, end, y);
        drawSummaryFooter(ctx, p + 1, slices.length);
        if (p) pdf.addPage();
        pdf.addImage(page.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", 0, 0, PORTRAIT_W_MM, PORTRAIT_H_MM);
      }
      pdf.save(`תקציר מנהלים - ${state.name || state.number || "ללא שם"}.pdf`);
    } finally {
      el.remove();
      heads.forEach((h) => h.remove());
    }
  }

  // --- ייצוא "חישוב ציון": מסמך נפרד, לרוחב (טבלאות רחבות) — פירוט מלא של
  // כל הנוסחאות וההצבות לפי הנוהל, לכל רכיב/מפתח/מבנה. מרכיב מחדש בדיוק
  // את תוכן לשונית "בקרה" (renderControlAudit) עם forPdf=true, כך שאין
  // כפילות לוגיקה בין המסך החי לבין הקובץ המיוצא ---
  async function exportCalculation() {
    if (!hasAnyComponents()) { alert("אין נתונים לייצוא — הוסף רכיבים תחילה."); return; }
    const input = buildEngineInput();
    const result = Calc.computeStructure(input);
    const el = document.createElement("div");
    el.id = "pdf-calc";
    el.innerHTML = `
      <h1>חישוב הציון — פירוט מלא לפי הנוהל</h1>
      <p class="pdf-sub">${esc(state.name || "ללא שם")}${state.number ? ` · <span dir="ltr">${esc(state.number)}</span>` : ""}
        · הופק בתאריך ${fmtDateDMY(new Date())}</p>
      ${renderControlAudit(state, result, true)}`;
    document.body.appendChild(el);
    try {
      await decodeImages(el);
      fitImages(el);
      const canvas = await html2canvas(el, { scale: SCALE, backgroundColor: "#ffffff" });
      const pdf = new jspdf.jsPDF("l", "mm", "a4");
      const pageHc = PAGE_H_PX * SCALE;
      const pages = Math.max(1, Math.ceil(canvas.height / pageHc));
      for (let p = 0; p < pages; p++) {
        const sliceH = Math.min(pageHc, canvas.height - p * pageHc);
        const slice = document.createElement("canvas");
        slice.width = canvas.width; slice.height = pageHc;
        const ctx = slice.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, p * pageHc, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        if (p) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", 0, 0, PAGE_W_MM, PAGE_H_MM);
      }
      pdf.save(`חישוב ציון - ${state.name || state.number || "ללא שם"}.pdf`);
    } finally {
      el.remove();
    }
  }

  // --- ייצוא "חישוב ציון — במבנה קובץ ה-Excel": אותו מבנה טבלאות/עמודות
  // כמו XlsxExport.exportCalculation() (buildXlsxStyleSections), כ-PDF
  // מופק ישירות מהמערכת. כל עמוד div נפרד (לא קנבס ארוך שנחתך) — בדיוק
  // כמו "דוח סקירה" הרגיל — כך ששום שורה בטבלה לא נחתכת באמצע במעבר בין
  // עמודים, וכותרת המבנה/הלוגואים/מספור העמוד חוזרים אמיתית על כל עמוד ---
  function paginateXlsxSection(section, budgetInfo, scratch) {
    const { title, thead, rows, footerHtml } = section;
    const titleHtml = `<div class="gov-section-title">${esc(title)}</div>`;
    if (!rows.length) {
      return [`${titleHtml}<table class="xlsx-pdf-table">${thead}<tbody><tr><td class="gov-empty">אין נתונים</td></tr></tbody></table>${footerHtml}`];
    }
    const { theadH, heights } = measureRowHeights(thead, rows, budgetInfo.contentW, scratch, "xlsx-pdf-table");
    const chunks = paginateRows(rows, heights, budgetInfo.bodyHeight - theadH);
    if (footerHtml && chunks.length) {
      // אם השורה האחרונה בעמוד האחרון לא נכנסת יחד עם פאנל התוצאה, מעבירים
      // רק אותה (ואת מה שאחריה) לעמוד חדש — כמו המקרא ב"תיעוד סקירת רכיבים"
      const footerH = measureLegendHeight(footerHtml, scratch);
      const lastPageRoom = budgetInfo.bodyHeight - theadH - footerH;
      const last = chunks[chunks.length - 1];
      const startIdx = rows.length - last.length;
      let acc = 0, splitAt = last.length;
      for (let i = 0; i < last.length; i++) {
        acc += heights[startIdx + i];
        if (acc > lastPageRoom) { splitAt = i; break; }
      }
      if (splitAt < last.length) chunks.push(last.splice(splitAt));
    }
    return chunks.map((chunk, i) =>
      `${titleHtml}<table class="xlsx-pdf-table">${thead}<tbody>${chunk.join("")}</tbody></table>${i === chunks.length - 1 ? footerHtml : ""}`);
  }
  async function buildXlsxStylePdf(scratch, container) {
    const input = buildEngineInput();
    const result = Calc.computeStructure(input);
    const sections = buildXlsxStyleSections(state, result);

    const probe = document.createElement("div");
    probe.className = "gov-page xlsx-calc-page";
    probe.innerHTML = govHeaderHTML(state, 1, 99) + '<div class="gov-section-title">מדידה</div>';
    scratch.appendChild(probe);
    const headerH = probe.querySelector(".gov-head").getBoundingClientRect().height;
    const titleH = probe.querySelector(".gov-section-title").getBoundingClientRect().height;
    probe.remove();
    const contentW = PAGE_W_PX - GOV_PAD * 2;
    const bodyHeight = PAGE_H_PX - GOV_PAD * 2 - headerH - titleH - 10;
    const budgetInfo = { bodyHeight, contentW };

    const pageBodies = sections.flatMap((s) => paginateXlsxSection(s, budgetInfo, scratch));

    const total = pageBodies.length;
    const pdf = new jspdf.jsPDF("l", "mm", "a4");
    for (let i = 0; i < total; i++) {
      const pageEl = document.createElement("div");
      pageEl.className = "gov-page xlsx-calc-page";
      pageEl.innerHTML = govHeaderHTML(state, i + 1, total) + pageBodies[i];
      container.appendChild(pageEl);
      await decodeImages(pageEl);
      fitImages(pageEl);
      const canvas = await html2canvas(pageEl, { scale: SCALE, backgroundColor: "#ffffff" });
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", 0, 0, PAGE_W_MM, PAGE_H_MM);
      pageEl.remove();
    }
    return pdf;
  }
  async function exportCalculationXlsxStyle() {
    if (!hasAnyComponents()) { alert("אין נתונים לייצוא — הוסף רכיבים תחילה."); return; }
    const scratch = makeScratch("gov-page");
    const container = document.createElement("div");
    container.id = "gov-report";
    document.body.appendChild(container);
    try {
      const pdf = await buildXlsxStylePdf(scratch, container);
      pdf.save(`חישוב ציון (מבנה Excel) - ${state.name || state.number || "ללא שם"}.pdf`);
    } finally {
      scratch.remove();
      container.remove();
    }
  }

  // --- ת.ז: כותרת פשוטה (עמוד N מתוך M + כותרת הטופס), A4 לאורך ---
  function idCardHeaderHTML(pageNum, totalPages) {
    return `<div class="idcard-head">
      <span>עמוד ${pageNum} מתוך ${totalPages}</span>
      <strong>תעודת זהות לגשר ומובל — מהדורה 6-2008</strong>
    </div>`;
  }
  function idCardMainPhotoBlock(state, photoStore) {
    const entry = photoStore.get((state.idCardMainPhoto || "").trim());
    if (!entry) return "";
    return `<div class="gov-photo-cell" style="height:260px;margin-top:8px">
      <img src="${entry.dataUrl}" class="gov-photo-img">
      <div class="gov-photo-filename">${esc(entry.filename)}</div>
    </div>`;
  }

  // --- ייצוא "ת.ז": תעודת זהות לגשר ומובל, A4 לאורך, לפי Bridge ID Cards.pdf —
  // שימוש חוזר מלא במנגנון המדידה/פיצול/עמוד-לעמוד שנבנה עבור "דוח סקירה" ---
  async function exportIdCard() {
    const scratch = makeScratch("idcard-page");
    const container = document.createElement("div");
    container.id = "gov-report";
    document.body.appendChild(container);
    try {
      const input = buildEngineInput();
      const result = hasAnyComponents() ? Calc.computeStructure(input) : null;

      const probe = document.createElement("div");
      probe.className = "idcard-page";
      probe.innerHTML = idCardHeaderHTML(1, 99) + `<div class="gov-section-title">מדידה</div>`;
      scratch.appendChild(probe);
      const headerH = probe.querySelector(".idcard-head").getBoundingClientRect().height;
      const titleH = probe.querySelector(".gov-section-title").getBoundingClientRect().height;
      probe.remove();
      const contentW = PORTRAIT_W_PX - GOV_PAD * 2;
      const bodyHeight = PORTRAIT_H_PX - GOV_PAD * 2 - headerH - titleH - 10;
      const thead = `<thead><tr><th>מספר</th><th>סוג נתון</th><th>ערך</th></tr></thead>`;

      const pageBodies = [];
      // 6 קבוצות השדות (= 13 הסעיפים הרשמיים, מקובצים כמו במסכי ה-BMS) —
      // כל שורה: קוד הסעיף, תווית, וערך (נמשך אוטומטית או שהוזן ב"ת.ז").
      for (const group of ID_CARD_GROUPS) {
        const rows = [
          ...idCardAutoFields(group.id, state, result).map((f) =>
            `<tr><td>${esc(f.code)}</td><td>${esc(f.label)}</td><td dir="ltr">${esc(f.value)}</td></tr>`),
          ...group.fields.map((f) =>
            `<tr><td>${esc(f.displayCode || f.code)}</td><td>${esc(f.label)}</td><td dir="ltr">${esc(state.idCard[f.code] || f.placeholder || "—")}</td></tr>`),
        ];
        const { theadH, heights } = measureRowHeights(thead, rows, contentW, scratch);
        const chunks = paginateRows(rows, heights, bodyHeight - theadH);
        const photoBlock = group.id === "general" ? idCardMainPhotoBlock(state, photoStore) : "";
        chunks.forEach((chunk, i) => pageBodies.push(
          `<div class="gov-section-title">${esc(group.label)}</div><table class="gov-table">${thead}<tbody>${chunk.join("")}</tbody></table>${i === chunks.length - 1 ? photoBlock : ""}`
        ));
      }

      // סיכום כמויות רכיבים (רכיב | יחידת מידה בסיסית | כמות) — לפי עמ' 5 בייחוס
      const qtyRows = [];
      for (const span of state.spans) {
        for (const c of sortedComponents(span)) {
          if (!c.surveyed || c.importance == null) continue;
          const qty = c.subs.reduce((a, s) => a + (+s.size || 0), 0);
          qtyRows.push(`<tr><td>${esc((c.catalogId != null ? c.catalogId + ". " : "") + c.name)}</td><td>${esc(c.unit || "")}</td><td>${fmt(qty, 2)}</td></tr>`);
        }
      }
      if (qtyRows.length) {
        const qtyThead = `<thead><tr><th>רכיב</th><th>יחידת מידה בסיסית</th><th>כמות</th></tr></thead>`;
        const { theadH, heights } = measureRowHeights(qtyThead, qtyRows, contentW, scratch);
        const chunks = paginateRows(qtyRows, heights, bodyHeight - theadH);
        chunks.forEach((chunk) => pageBodies.push(
          `<div class="gov-section-title">סיכום כמויות רכיבים</div><table class="gov-table">${qtyThead}<tbody>${chunk.join("")}</tbody></table>`
        ));
      }

      // נספח תמונות — רשת 2×2, אותה תמונה יכולה לחזור גם כאן וגם ב"דוח סקירה"
      const photoItems = collectPhotoItems(state, photoStore);
      for (let i = 0; i < photoItems.length; i += 4) {
        const group = photoItems.slice(i, i + 4);
        const cells = group.map((it) => `
          <div class="gov-photo-cell">
            <div class="gov-photo-caption">${esc(it.caption || "")}</div>
            <img src="${it.dataUrl}" class="gov-photo-img">
            <div class="gov-photo-filename">${esc(it.filename)}</div>
          </div>`).join("");
        const pad = '<div class="gov-photo-cell empty"></div>'.repeat(4 - group.length);
        pageBodies.push(`<div class="gov-section-title">תמונות</div><div class="gov-photo-grid">${cells}${pad}</div>`);
      }

      const total = pageBodies.length;
      const pdf = new jspdf.jsPDF("p", "mm", "a4");
      for (let i = 0; i < total; i++) {
        const pageEl = document.createElement("div");
        pageEl.className = "idcard-page";
        pageEl.innerHTML = idCardHeaderHTML(i + 1, total) + pageBodies[i];
        container.appendChild(pageEl);
        await decodeImages(pageEl);
        fitImages(pageEl);
        const canvas = await html2canvas(pageEl, { scale: SCALE, backgroundColor: "#ffffff" });
        if (i) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", 0, 0, PORTRAIT_W_MM, PORTRAIT_H_MM);
        pageEl.remove();
      }
      pdf.save(`תעודת זהות - ${state.name || state.number || "ללא שם"}.pdf`);
    } finally {
      scratch.remove();
      container.remove();
    }
  }

  return { exportReport, exportSummary, exportCalculation, exportCalculationXlsxStyle, exportIdCard, exportZip };
})();
