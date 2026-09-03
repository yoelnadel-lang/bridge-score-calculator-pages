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

  function makeScratch() {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;top:0;left:-20000px;background:#fff;";
    document.body.appendChild(el);
    return el;
  }

  // --- כותרת חוזרת בראש כל עמוד (שם/מספר מבנה, סוקר, חברה, דף N מתוך M) ---
  function govHeaderHTML(state, pageNum, totalPages) {
    return `<table class="gov-head">
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
  function govSectionTitle(n, title) {
    return `<div class="gov-section-title">[${n}] ${esc(title)}</div>`;
  }

  // --- מדידת גובה שורות אמיתי (רינדור בפועל, לא הערכה) לפיצול טבלה ארוכה
  // לעמודים — כותרת הטבלה חוזרת על כל עמוד ---
  function measureRowHeights(theadHtml, rowsHtml, contentWidthPx, scratch) {
    const table = document.createElement("table");
    table.className = "gov-table";
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

  // ============================================================================
  // מקטע 1: נתונים כלליים (עמוד אחד קבוע)
  // ============================================================================
  function buildGeneralDataPage(state, result) {
    const insp = computeNextInspection(state);
    const fmtDate = (d) => (d ? d.toLocaleDateString("he-IL") : "—");
    const rows = [
      ["מספר המבנה", `<span dir="ltr">${esc(state.number || "—")}</span>`, "שם המבנה", esc(state.name || "—")],
      ["שם המזמין", esc(state.client || "—"), "מתכנן המבנה", esc(state.designer || "—")],
      ["כביש מס'", `<span dir="ltr">${esc(state.roadNumber || "—")}</span>`, "קואורדינטות", `<span dir="ltr">${esc(state.coordinates || "—")}</span>`],
      ["סיווג ראשי", esc(STRUCTURE_CLASSES[state.structureClass].label), "מספר מפתחים / יחידות", String(state.spanCount)],
      ["שם הסוקר", esc(state.surveyorName || "—"), "שם החברה", esc(state.companyName || "—")],
      ["סוג הסקירה", esc(state.surveyType || "—"), "", ""],
      ["תאריך הסקירה הנוכחית", esc(state.inspDate || "—"), "תאריך הסקירה הבאה (מומלץ)", insp ? fmtDate(insp.effective) : "—"],
      ["CPI Average", fmt(result.bridge.method_norm.cpiAv), "CPI Critical", fmt(result.bridge.cpiCrit)],
    ];
    const trs = rows.map(([l1, v1, l2, v2]) => `<tr><th>${l1}</th><td>${v1}</td><th>${l2}</th><td>${v2}</td></tr>`).join("");
    return [`${govSectionTitle(1, "נתונים כלליים")}<table class="gov-kv">${trs}</table>${immediateAttentionBlock(state)}`];
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
  function buildFindingsPages(state, budgetInfo, scratch, photoStore) {
    if (!state.findingPhotos.length) return [];
    const rows = state.findingPhotos.map((f, i) => `<tr>
      <td>${i + 1}</td><td>${esc(f.desc || "")}</td><td>${photoCodesCell(photoStore, f.photo)}</td>
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
      for (const c of span.components) {
        if (!c.surveyed) continue;
        for (const d of c.defects) {
          if (d.note === "רכיב תקין") continue;
          const cat = DEFECT_CATALOG.defects.find((x) => x.code === d.def);
          rows.push(`<tr>
            <td>${span.id}</td>
            <td>${esc((c.catalogId != null ? c.catalogId + ". " : "") + c.name)}</td>
            <td>${d.sub}</td>
            <td>${esc(d.def || "—")}${cat ? " " + esc(cat.name_he) : ""}</td>
            <td>${d.s}</td><td>${esc(d.ex)}</td>
            <td>${esc(d.note || "")}</td>
            <td dir="ltr">${esc(d.photo || "")}</td>
          </tr>`);
        }
      }
    }
    const thead = `<thead><tr><th>מפתח</th><th>רכיב</th><th>מס' משנה</th><th>פגם</th><th>S</th><th>Ex</th><th>הערות</th><th>קוד תמונה</th></tr></thead>`;
    if (!rows.length) {
      return [`${govSectionTitle(3, "תיעוד סקירת רכיבים")}<table class="gov-table">${thead}<tbody><tr><td colspan="8" class="gov-empty">לא נרשמו פגמים</td></tr></tbody></table>`];
    }
    const { theadH, heights } = measureRowHeights(thead, rows, budgetInfo.contentW, scratch);
    const chunks = paginateRows(rows, heights, budgetInfo.bodyHeight - theadH);
    return chunks.map((chunk) => `${govSectionTitle(3, "תיעוד סקירת רכיבים")}<table class="gov-table">${thead}<tbody>${chunk.join("")}</tbody></table>`);
  }

  // ============================================================================
  // מקטע 4: סיכום כמויות וציוני ECS לכל רכיב מדורג + שורת סיכום SCS/CPI
  // ============================================================================
  function buildQuantitySummaryPages(state, budgetInfo, scratch, result) {
    const rows = [];
    for (const span of state.spans) {
      for (const c of span.components) {
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
  // מקטע 5: הערות הסוקר — פרשנות אוטומטית של CPI Av/Crit לפי טבלה 15
  // (התקציר האינטראקטיבי עצמו — מדי המהירות — עבר למסמך נפרד, ר' exportSummary)
  // ============================================================================
  function buildSurveyorNotesPage(result) {
    const av = Calc.meaning(result.bridge.method_norm.cpiAv, MEANING_AV);
    const crit = Calc.meaning(result.bridge.cpiCrit, MEANING_CRIT);
    const items = [];
    if (av) items.push(`ציון CPI Average = ${fmt(result.bridge.method_norm.cpiAv)} מגדיר את מצבו הכללי של המבנה כ"${esc(av.name)}". ${esc(av.text)}`);
    if (crit) items.push(`ציון CPI Critical = ${fmt(result.bridge.cpiCrit)} מגדיר את מצבו הכללי של המבנה כ"${esc(crit.name)}". ${esc(crit.text)}`);
    items.push("הכלי הוא עזר חישובי בלבד; האחריות המקצועית על הסוקר והמהנדס.");
    const rows = items.map((t, i) => `<tr><td>${i + 1}</td><td>${t}</td></tr>`).join("");
    return [`${govSectionTitle(5, "הערות הסוקר")}<table class="gov-table gov-notes"><thead><tr><th>מספר</th><th>תיאור</th></tr></thead><tbody>${rows}</tbody></table>`];
  }

  // ============================================================================
  // מקטע 6: תמונות — רשת 2×2, כיתוב מעל + שם קובץ מתחת
  // ============================================================================
  function collectPhotoItems(state, photoStore) {
    const items = [];
    // תמונת "תשומת לב מיידית" ראשונה בנספח — היא הדחופה ביותר
    for (const code of parsePhotoCodes((state.immediateAttention || {}).photo)) {
      const entry = photoStore.get(code);
      if (entry && entry.kind === "photo") {
        items.push({ dataUrl: entry.dataUrl, filename: entry.filename, caption: "תשומת לב מיידית" });
      }
    }
    for (const span of state.spans) {
      for (const c of span.components) {
        for (const d of c.defects) {
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
    for (const f of state.findingPhotos) {
      for (const code of parsePhotoCodes(f.photo)) {
        const entry = photoStore.get(code);
        if (entry && entry.kind === "photo") items.push({ dataUrl: entry.dataUrl, filename: entry.filename, caption: f.desc || "" });
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
    return items.map((it) => `
      ${govSectionTitle(7, "תרשימים")}
      <div class="gov-sketch-caption">${esc(it.caption || it.code)}</div>
      <div class="gov-sketch-wrap"><img src="${it.entry.dataUrl}" class="gov-sketch-img"></div>`);
  }

  // ============================================================================
  // נספח: קוד/י שחזור (QR) — מקודד רק את מה שהמשתמש הזין (ר' recovery.js),
  // לא תמונות. סוקר שחוזר לגשר הזה סורק ומקבל את הטופס בחזרה במקום להתחיל
  // מאפס. מבנה קטן ייצא קוד אחד; מבנה גדול מתפצל אוטומטית לכמה קודים.
  // ============================================================================
  // שני קודים לעמוד ולא ארבעה: ברשת 2×2 גובה התא הגביל את הקוד לכ-85 מ"מ
  // (0.64 מ"מ למודול) — נסרק מהמסך אך גבולי מדף מודפס. שניים לעמוד מגדילים
  // אותו לכ-145 מ"מ (1.06 מ"מ למודול) במחיר עמוד נוסף רק במבנים גדולים מאוד.
  const QR_PER_PAGE = 2;
  function buildQrAppendixPages(state) {
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
    const groups = [];
    for (let i = 0; i < images.length; i += QR_PER_PAGE) groups.push(images.slice(i, i + QR_PER_PAGE));
    return groups.map((group, gi) => {
      const cells = group.map((dataUrl, j) => `
        <div class="gov-qr-cell">
          <div class="gov-photo-caption">קוד שחזור ${gi * QR_PER_PAGE + j + 1} מתוך ${images.length}</div>
          <img src="${dataUrl}" class="gov-qr-img">
        </div>`).join("");
      return `${govSectionTitle(8, "נספח — קוד שחזור (לא כולל תמונות)")}
        <p class="gov-qr-hint">סריקת הקודים בכלי "שחזור מ-QR" מחזירה את תוכן הדוח לטופס. יש לסרוק את כל ${images.length} הקודים. התמונות אינן נכללות ויש לצרפן מחדש.</p>
        <div class="gov-qr-grid">${cells}</div>`;
    });
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

  // בונה את מופע ה-jsPDF של "דוח סקירה" בלי לשמור אותו — קרוא גם מ-exportReport
  // (הורדה ישירה) וגם מ-exportZip (חבילת ZIP עם קובץ הטעינה)
  async function buildReportPdf(scratch, container) {
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

    const pageBodies = [
      ...buildGeneralDataPage(state, result),
      ...buildFindingsPages(state, budgetInfo, scratch, photoStore),
      ...buildComponentReviewPages(state, budgetInfo, scratch),
      ...buildQuantitySummaryPages(state, budgetInfo, scratch, result),
      ...buildSurveyorNotesPage(result),
      ...buildPhotoPages(collectPhotoItems(state, photoStore)),
      ...buildSketchPages(state, photoStore),
      ...buildQrAppendixPages(state),
    ];

    const total = pageBodies.length;
    const pdf = new jspdf.jsPDF("l", "mm", "a4");
    for (let i = 0; i < total; i++) {
      const pageEl = document.createElement("div");
      pageEl.className = "gov-page";
      pageEl.innerHTML = govHeaderHTML(state, i + 1, total) + pageBodies[i];
      container.appendChild(pageEl);
      await decodeImages(pageEl);
      const canvas = await html2canvas(pageEl, { scale: SCALE, backgroundColor: "#ffffff" });
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", 0, 0, PAGE_W_MM, PAGE_H_MM);
      pageEl.remove();
    }
    return pdf;
  }

  // --- ייצוא "דוח סקירה": פורמט רשמי, לרוחב, כותרת+מספור עמוד חוזרים ---
  async function exportReport() {
    if (!hasAnyComponents()) { alert("אין נתונים לייצוא — הוסף רכיבים תחילה."); return; }
    const scratch = makeScratch();
    const container = document.createElement("div");
    container.id = "gov-report";
    document.body.appendChild(container);
    try {
      const pdf = await buildReportPdf(scratch, container);
      pdf.save(`דוח סקירה - ${state.name || state.number || "ללא שם"}.pdf`);
    } finally {
      scratch.remove();
      container.remove();
    }
  }

  // --- ייצוא חבילת ZIP: דוח הסקירה (PDF) + קובץ טעינה (JSON, כל מה שהוזן —
  // בלי תמונות, כמו ה-state עצמו) — להעברה/שיתוף/גיבוי כקובץ אחד. קובץ
  // הטעינה נטען בחזרה דרך "📂 טען מקובץ" בסרגל הכלים ---
  async function exportZip() {
    if (!hasAnyComponents()) { alert("אין נתונים לייצוא — הוסף רכיבים תחילה."); return; }
    const scratch = makeScratch();
    const container = document.createElement("div");
    container.id = "gov-report";
    document.body.appendChild(container);
    const baseName = state.name || state.number || "ללא שם";
    try {
      const pdf = await buildReportPdf(scratch, container);
      const zip = new JSZip();
      zip.file(`דוח סקירה - ${baseName}.pdf`, pdf.output("blob"));
      zip.file(`קובץ טעינה - ${baseName}.json`, JSON.stringify(state, null, 2));
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

  // --- ייצוא "תקציר מנהלים": מסמך נפרד, לאורך — מדי מהירות + רכיב קריטי ---
  async function exportSummary() {
    if (!hasAnyComponents()) { alert("אין נתונים לייצוא — הוסף רכיבים תחילה."); return; }
    const input = buildEngineInput();
    const result = Calc.computeStructure(input);
    const summary = Calc.executiveSummary(input, result);
    const el = document.createElement("div");
    el.id = "pdf-summary";
    el.innerHTML = `
      <h1>תקציר מנהלים — Condition PI</h1>
      <p class="pdf-sub">${esc(state.name || "ללא שם")}${state.number ? ` · <span dir="ltr">${esc(state.number)}</span>` : ""}
        · הופק בתאריך ${new Date().toLocaleDateString("he-IL")}</p>
      ${renderSummary(state, result, summary)}`;
    document.body.appendChild(el);
    try {
      await decodeImages(el);
      const canvas = await html2canvas(el, { scale: SCALE, backgroundColor: "#ffffff" });
      const pdf = new jspdf.jsPDF("p", "mm", "a4");
      const pageHc = PORTRAIT_H_PX * SCALE;
      const pages = Math.max(1, Math.ceil(canvas.height / pageHc));
      for (let p = 0; p < pages; p++) {
        const sliceH = Math.min(pageHc, canvas.height - p * pageHc);
        const slice = document.createElement("canvas");
        slice.width = canvas.width; slice.height = pageHc;
        const ctx = slice.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, p * pageHc, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        if (p) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", 0, 0, PORTRAIT_W_MM, PORTRAIT_H_MM);
      }
      pdf.save(`תקציר מנהלים - ${state.name || state.number || "ללא שם"}.pdf`);
    } finally {
      el.remove();
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
    const scratch = makeScratch();
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
        for (const c of span.components) {
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

  return { exportReport, exportSummary, exportIdCard, exportZip };
})();
