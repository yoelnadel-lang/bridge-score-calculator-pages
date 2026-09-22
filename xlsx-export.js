// ============================================================================
// xlsx-export.js — ייצוא Excel שממלא את התבנית האמיתית (לא בונה קובץ חדש
// שמחקה אותה). התבנית עצמה ("חישוב ציון גשר - מפתח 1", מקור: קובץ .xls
// שהעביר המשתמש, הומר פעם אחת ל-.xlsx דרך LibreOffice ונוקה מ-3299 בקרות
// checkbox ישנות שגרמו לטעינה של 40+ שניות — ראו site/templates/README
// אם יתווסף) יושבת ב-site/templates/xlsx-template.xlsx.
//
// גילוי מרכזי מהבדיקה בפועל של התבנית (לפני כתיבת הקובץ הזה): שורות
// הרכיבים (13–48) בגיליון "מפתח 1" **אינן טופס ריק** — הן מולאות מראש
// ב-36 רכיבים ספציפיים שמתאימים לסוג-על אחד בלבד ("קורות וטבלה", סוג
// המבנה של הגשר המקורי). מכיוון שהמערכת שלנו תומכת בעשרות סוגי-על/מנהרה
// עם קטלוגים שונים לגמרי, אי אפשר לשמר את 36 השורות הספציפיות האלה בכל
// סקירה — הן מנוקות ונכתבות מחדש בכל ייצוא לפי הרכיבים האמיתיים. מה
// שכן משוחזר במלואו מהתבנית האמיתית (לא משוחזר-ביד): **הנוסחאות** של כל
// שורה (Ecs/Ecf/Eci/Eif — עמודות K/L/M/P/Q/R/T/U/V, ראו fillComponentRow)
// ו**העיצוב/המיזוגים/הכותרות העשירות** (rich-text עם כתב-עילי, כמו
// במקור) — כל אלה נשארים כפי שהם בתבנית, לא נכתבים מחדש.
//
// כלל 1–2/3+ מפתחים זהה למה שהיה: מבנה בעל 1–2 מפתחים ⇐ גיליון "חישוב
// הציון" בודד (בלי גיליון סיכום), 3+ ⇐ גיליון לכל מפתח + גיליון סיכום.
// ============================================================================
"use strict";

const XlsxExport = (() => {
  const TEMPLATE_URL = "templates/xlsx-template.xlsx";
  const TPL_SCORE_SHEET = "חישוב הציון - מפתח 1";
  const TPL_AGG_SHEET = "חישוב דירוג מצב המבני לקבוצה מב";
  const TPL_FIRST_DATA_ROW = 13;
  const TPL_LAST_DATA_ROW = 48;           // 36 שורות רכיב בתבנית
  const TPL_AGG_FIRST_ROW = 24;
  const TPL_AGG_LAST_ROW = 29;            // 6 שורות מפתח בתבנית הסיכום
  // גיליון הסיכום קיים פעם אחת בלבד (לא כמו 6 גיליונות ה"מפתח") — אין
  // סיכון לחוסר-עקביות כמו למעלה, אז מיקום קבוע בטוח כאן
  const TPL_AGG_FOOTER = { scsAv: 31, scsCrit: 31, cpiAv: 40, cpiCrit: 42 };
  // היסטים קבועים מתוך שורת הבאנר "ערך דירוג מצב המבנה" — אומתו זהים
  // בכל 6 גיליונות ה"מפתח" בתבנית, למרות ששורת העוגן עצמה **לא** קבועה:
  // בגיליונות 1/2/3/5 הבאנר בשורה 50, אבל בגיליונות 4/6 דווקא בשורה 51
  // (חוסר עקביות אמיתי בקובץ המקור עצמו — התגלה בבדיקה, לא בגדר תכנון).
  // לכן לא סומכים על מספר שורה קבוע — מוצאים את הבאנר בפועל בכל גיליון
  // (findFooterAnchor) ומחשבים ממנו יחסית. ---
  const FOOTER_OFFSET = { banner: 0, scsAv: 2, scsCrit: 5, cpiAv: 10, cpiCrit: 13 };
  function findFooterAnchor(ws, searchFrom) {
    for (let r = searchFrom; r <= searchFrom + 6; r++) {
      if (ws.getCell(`F${r}`).value === "ערך דירוג מצב המבנה") return r;
    }
    throw new Error("לא נמצא באנר 'ערך דירוג מצב המבנה' בגיליון — מבנה תבנית לא צפוי.");
  }

  let templateBufferPromise = null;
  function loadTemplateBuffer() {
    if (!templateBufferPromise) {
      templateBufferPromise = fetch(TEMPLATE_URL).then((r) => {
        if (!r.ok) throw new Error(`טעינת תבנית ה-Excel נכשלה (${r.status})`);
        return r.arrayBuffer();
      });
    }
    return templateBufferPromise;
  }
  async function freshWorkbook() {
    const buf = await loadTemplateBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    // מכריח חישוב מחדש מלא בפתיחה — חלק מתאי-הנוסחה בתבנית המקורית (K–V
    // בטבלת הרכיבים) הגיעו בלי תוצאה שמורה (cached), ותוכנות מסוימות לא
    // תמיד מחשבות אותם מחדש אוטומטית בפתיחה/המרה אם לא מסומן כך במפורש
    wb.calcProperties.fullCalcOnLoad = true;
    return wb;
  }

  // --- מיון זהה לשאר הקבצים (מספור קטלוג היררכי, לא טקסטואלי) ---
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

  // --- זיהוי הפגם/היקף "המנצח" לתצוגה (עמודות H/I/J) — הערכים הנומריים
  // עצמם (Eci/Eif וכו') תמיד מגיעים מנוסחאות התבנית, לא מחושבים כאן.
  // ברכיב עם תת-רכיב יחיד אין שקלול אפשרי (האות תמיד "נקייה"). ברכיב עם
  // כמה תתי-רכיבים — גם תת-רכיב "לא-מנצח" מדלל את המכנה ב-computeComponent
  // (ראו calc.js), אז אי-אפשר לדעת אם התוצאה "נקייה" רק לפי הערכים
  // המנצחים; לכן תמיד מסומן "משוקלל" וה-e (K) נכתב כערך קבוע (לא נוסחה)
  // — היחיד בכל השורה שסוטה מנוסחת התבנית המקורית. ---
  function letterForValue(val, sMax) {
    if (val === 0) return sMax === 1 ? "A" : "B";
    if (val === 0.1) return "C";
    if (val === 0.3) return "D";
    if (val === 0.7) return "E";
    return null;
  }
  function winningDefectInfo(comp, res) {
    if (!res.surveyed || res.aux) return { code: "", ex: "", weighted: false };
    if (!comp.defects.length || res.defaulted) return { code: "", ex: "A", weighted: false };
    const atMax = comp.defects.filter((d) => d.s === res.sMax);
    const codes = [...new Set(atMax.map((d) => d.def).filter(Boolean))].join(", ");
    if ((comp.subs ? comp.subs.length : 1) > 1) return { code: codes, ex: "", weighted: true };
    const exVal = Math.max(...atMax.map((d) => (EXTENT[d.ex] ? EXTENT[d.ex].value : 0)));
    return { code: codes, ex: letterForValue(exVal, res.sMax), weighted: false };
  }

  const THIN = { style: "thin" }, MEDIUM = { style: "medium" };
  // גבול-סגירה של הטבלה (כמו שורה 48 המקורית) — מוחל על השורה האחרונה
  // בפועל אחרי כיווץ/הרחבה, כדי שהטבלה תיראה שלמה ולא "נגדעת"
  function applyClosingBorder(ws, row, firstCol, lastCol) {
    for (let c = firstCol; c <= lastCol; c++) {
      const cell = ws.getRow(row).getCell(c);
      const b = { ...(cell.border || {}) };
      b.bottom = MEDIUM;
      cell.border = b;
    }
  }

  // --- שורת רכיב יחידה: כותב רק את תאי הקלט (B/C/E/F/H/I/J/S/Y) — כל
  // שאר העמודות (K/L/M/N/P/Q/R/T/U/V) הן הנוסחאות המקוריות של התבנית,
  // ולא נוגעים בהן כלל, מלבד K במקרה החריג של שקלול (ראו למעלה) ---
  function fillComponentRow(ws, row, comp, res) {
    const win = winningDefectInfo(comp, res);
    const notExist = res.surveyed ? "" : "הרכיב אינו קיים";
    const impDef = res.aux ? null : IMPORTANCE[comp.importance];
    const set = (col, v) => { ws.getCell(`${col}${row}`).value = v ?? null; };
    set("B", comp.catalogId || null);
    set("C", comp.name || "");
    set("E", impDef ? impDef.label : null);
    set("F", comp.subs && comp.subs.length > 1 ? "." : null);
    set("H", res.surveyed && !res.aux ? win.code || null : null);
    set("I", res.surveyed && !res.aux ? res.sMax : null);
    set("J", res.surveyed && !res.aux ? (win.weighted ? "משוקלל" : win.ex) : null);
    set("S", impDef ? impDef.eif : 0);
    set("Y", notExist || null);
    if (win.weighted) {
      set("K", +res.extent || 0); // עוקף את נוסחת ה-e המקורית — אין נוסחת-תא לשקלול רב-תתי-רכיבי (ראו הערה למעלה)
    }
  }

  // --- מתאים את מספר שורות הרכיבים בגיליון-ניקוד (13..48 בתבנית) למספר
  // הרכיבים האמיתי — בלי למחוק/להזיז אף שורה (ראו הערה למעלה על spliceRows):
  // התבנית מלאה במיזוגים (כל שורה: C:D, F:G, N:O), ומחיקת/הזזת שורות
  // דרך spliceRows על גיליון כזה יצרה שורות-רגל כפולות/מוזחות (התגלה
  // בבדיקה בפועל — ראו commit history). במקום זה: שורות עודפות (מעבר
  // למספר הרכיבים האמיתי) פשוט **מוסתרות** (hidden) והתוכן שלהן מנוקה;
  // הרגל נשארת תמיד באותם מספרי שורה קבועים בתבנית (52/55/60/63), ורק
  // טווח הנוסחה עצמו (SUM/MAX) נכתב מחדש לגודל האמיתי. תומך עד 36
  // רכיבים בגיליון בודד (קיבולת התבנית) — זה בהחלט מספיק ביחס לקטלוגים
  // הקיימים (הדוגמה הגדולה ביותר שנבדקה: 13 רכיבים במפתח). ---
  function adjustDataRows(ws, actualCount) {
    const templateCount = TPL_LAST_DATA_ROW - TPL_FIRST_DATA_ROW + 1;
    if (actualCount > templateCount) {
      throw new Error(`יותר מדי רכיבים במפתח אחד (${actualCount}) — התבנית תומכת עד ${templateCount}.`);
    }
    const lastDataRow = TPL_FIRST_DATA_ROW + actualCount - 1;
    for (let r = TPL_FIRST_DATA_ROW + actualCount; r <= TPL_LAST_DATA_ROW; r++) {
      const row = ws.getRow(r);
      row.hidden = true;
      for (let c = 2; c <= 25; c++) row.getCell(c).value = null; // B..Y
    }
    if (actualCount > 0) applyClosingBorder(ws, lastDataRow, 2, 25);
    return lastDataRow;
  }

  // --- כותב מחדש את 4 נוסחאות הרגל (SCSav/SCScrit/Condition PI) בגיליון
  // ניקוד — התוויות/העיצוב (rich text עם כתב-עילי) נשארים בדיוק במקומם
  // המקורי בתבנית (מאותרים דינמית לכל גיליון, ראו findFooterAnchor); רק
  // תוכן הנוסחה עצמו נכתב מחדש (טווח הנתונים האמיתי, לא הטווח הקבוע של
  // 36 השורות המקוריות) ---
  function rewriteScoreFooter(ws, lastDataRow) {
    const banner = findFooterAnchor(ws, TPL_LAST_DATA_ROW + 1);
    const scsAvRow = banner + FOOTER_OFFSET.scsAv, scsCritRow = banner + FOOTER_OFFSET.scsCrit;
    const cpiAvRow = banner + FOOTER_OFFSET.cpiAv, cpiCritRow = banner + FOOTER_OFFSET.cpiCrit;
    ws.getCell(`C${scsAvRow}`).value = { formula: `SUM(U${TPL_FIRST_DATA_ROW}:U${lastDataRow})/SUM(T${TPL_FIRST_DATA_ROW}:T${lastDataRow})` };
    ws.getCell(`C${scsCritRow}`).value = { formula: `MAX(V${TPL_FIRST_DATA_ROW}:V${lastDataRow})` };
    ws.getCell(`C${cpiAvRow}`).value = { formula: `100-(2*((C${scsAvRow}*C${scsAvRow})+(6.5*C${scsAvRow})-7.5))` };
    ws.getCell(`C${cpiCritRow}`).value = { formula: `100-(2*((C${scsCritRow}*C${scsCritRow})+(6.5*C${scsCritRow})-7.5))` };
    return { scsAv: `C${scsAvRow}`, scsCrit: `C${scsCritRow}`, cpiAv: `C${cpiAvRow}`, cpiCrit: `C${cpiCritRow}` };
  }

  // --- כותרת עליונה חוזרת (זהה בכל גיליון) — רק תאי המידע נכתבים; שאר
  // הכותרת (טקסט ההנחיה, עיצוב) נשארת כמו בתבנית ---
  function fillHeaderBlock(ws, state) {
    ws.getCell("D3").value = state.number || null;
    ws.getCell("H3").value = state.name || null;
    ws.getCell("D4").value = state.companyName || null;
    ws.getCell("H4").value = state.surveyorName || null;
    if (state.inspDate) {
      ws.getCell("R4").value = new Date(state.inspDate);
      ws.getCell("R4").numFmt = "dd/mm/yyyy";
    } else {
      ws.getCell("R4").value = null;
    }
  }

  function safeSheetName(name) {
    return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
  }

  // --- ממלא גיליון-ניקוד קיים בתבנית (אחד מ"מפתח 1"–"6") בנתוני מפתח
  // אמיתי, ומחזיר את כתובות תאי-התוצאה (לרפרנס בין-גיליוני מגיליון הסיכום) ---
  function fillScoreSheet(wb, ws, state, headerInfo, pairs) {
    fillHeaderBlock(ws, state);
    ws.getCell("I5").value = headerInfo.count;
    ws.getCell("M5").value = headerInfo.detail;
    ws.getCell("E7").value = headerInfo.spanNo;
    ws.getCell("Y7").value = headerInfo.dim;

    const lastDataRow = adjustDataRows(ws, pairs.length);
    pairs.forEach(({ comp, res }, i) => fillComponentRow(ws, TPL_FIRST_DATA_ROW + i, comp, res));
    return rewriteScoreFooter(ws, lastDataRow);
  }

  // --- משכפל את גיליון-הניקוד (ערכים+עיצוב+מיזוגים+רוחבי-עמודה) — נחוץ
  // רק כשיש יותר מ-6 מפתחים (מעבר לכמות הגיליונות המוכנים בתבנית).
  // ExcelJS לא כולל שכפול-גיליון מובנה. ---
  function cloneSheet(wb, source, newName) {
    const ws = wb.addWorksheet(safeSheetName(newName), { views: source.views });
    source.columns?.forEach((col, i) => { if (col?.width) ws.getColumn(i + 1).width = col.width; });
    source.eachRow({ includeEmpty: true }, (row, rowNum) => {
      const dstRow = ws.getRow(rowNum);
      dstRow.height = row.height;
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const dst = dstRow.getCell(colNum);
        dst.value = cell.value;
        dst.style = cell.style;
      });
    });
    for (const m of source.model.merges || []) ws.mergeCells(m);
    return ws;
  }

  // --- גיליון סיכום (רק ל-3+ מפתחים) — אותה שיטת התאמת-שורות/נוסחאות
  // כמו גיליון ניקוד יחיד, על טבלת 6 שורות המפתחים ---
  function fillAggregateSheet(wb, ws, state, spanCount, spanEntries) {
    fillHeaderBlock(ws, state);
    ws.getCell("B1").value = `גיליון לחישוב דירוג מצב Condition PI לגשר רכב בעל ${spanCount} מפתחים`;
    ws.getCell("I5").value = spanCount;
    ws.getCell("M5").value = `חישוב דירוג בעבור גשר בעל ${spanCount} מפתחים`;

    // כמו adjustDataRows בגיליון הניקוד: לא מוחקים/מזיזים שורות (ראו שם
    // למה) — שורות עודפות מוסתרות; אם יש יותר מ-6 מפתחים (מעבר לקיבולת
    // התבנית) משכפלים את השורה האחרונה עם duplicateRow (טבלה פשוטה בלי
    // מיזוגים מורכבים כמו בטבלת הרכיבים, נבדק בנפרד)
    const templateCount = TPL_AGG_LAST_ROW - TPL_AGG_FIRST_ROW + 1;
    if (spanCount < templateCount) {
      for (let r = TPL_AGG_FIRST_ROW + spanCount; r <= TPL_AGG_LAST_ROW; r++) {
        ws.getRow(r).hidden = true;
        for (const col of ["B", "C", "D", "F"]) ws.getCell(`${col}${r}`).value = null;
      }
    } else if (spanCount > templateCount) {
      ws.duplicateRow(TPL_AGG_LAST_ROW, spanCount - templateCount, true);
    }
    const lastRow = TPL_AGG_FIRST_ROW + spanCount - 1;

    const maxCrit = Math.max(...spanEntries.map((e) => e.scsCritValue));
    spanEntries.forEach((entry, i) => {
      const r = TPL_AGG_FIRST_ROW + i;
      ws.getCell(`B${r}`).value = entry.spanId;
      ws.getCell(`C${r}`).value = entry.dim;
      ws.getCell(`D${r}`).value = { formula: `'${entry.sheetName}'!${entry.footer.scsAv}` };
      const fCell = ws.getCell(`F${r}`);
      fCell.value = { formula: `'${entry.sheetName}'!${entry.footer.scsCrit}` };
      if (entry.scsCritValue === maxCrit) {
        fCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8DB4E2" } };
      }
    });

    // ללא כיווץ (הסתרה בלבד) הרגל נשארת במקומה המקורי בתבנית; רק כשהוכנסו
    // שורות (spanCount>6) היא זזה בפועל למטה, ויש לתקן את מיקום הנוסחאות
    const footerShift = spanCount > templateCount ? templateCount - spanCount : 0;
    const rr = (orig) => orig - footerShift;
    const scsAvRow = rr(TPL_AGG_FOOTER.scsAv), scsCritRow = rr(TPL_AGG_FOOTER.scsCrit);
    const cpiAvRow = rr(TPL_AGG_FOOTER.cpiAv), cpiCritRow = rr(TPL_AGG_FOOTER.cpiCrit);
    ws.getCell(`D${scsAvRow}`).value = { formula: `SUMPRODUCT(D${TPL_AGG_FIRST_ROW}:D${lastRow},C${TPL_AGG_FIRST_ROW}:C${lastRow})/SUM(C${TPL_AGG_FIRST_ROW}:C${lastRow})` };
    ws.getCell(`F${scsCritRow}`).value = { formula: `MAX(F${TPL_AGG_FIRST_ROW}:F${lastRow})` };
    ws.getCell(`D${cpiAvRow}`).value = { formula: `100-(2*((D${scsAvRow}*D${scsAvRow})+(6.5*D${scsAvRow})-7.5))` };
    ws.getCell(`F${cpiCritRow}`).value = { formula: `100-(2*((F${scsCritRow}*F${scsCritRow})+(6.5*F${scsCritRow})-7.5))` };
  }

  // --- נקודת הכניסה ---
  async function exportCalculation() {
    if (!hasAnyComponents()) { alert("אין נתונים לייצוא — הוסף רכיבים תחילה."); return; }
    const input = buildEngineInput();
    const result = Calc.computeStructure(input);
    const wb = await freshWorkbook();

    const spanCount = state.spans.length;
    const structureLabel = STRUCTURE_CLASSES[state.structureClass] ? STRUCTURE_CLASSES[state.structureClass].label : "";
    const templateScoreSheets = [1, 2, 3, 4, 5, 6].map((n) => `חישוב הציון - מפתח ${n}`);

    if (result.singleUnit) {
      let idx = 0;
      const pairs = [];
      state.spans.forEach((span) => {
        span.components.forEach((comp) => pairs.push({ comp, res: result.unit.components[idx++], spanId: span.id }));
      });
      pairs.sort((a, b) => naturalCodeCompare(a.comp.catalogId, b.comp.catalogId));
      const totalDim = state.spans.reduce((a, s) => a + (+s.dim || 0), 0);
      const ws = wb.getWorksheet(TPL_SCORE_SHEET);
      ws.name = safeSheetName("חישוב הציון");
      fillScoreSheet(wb, ws, state, {
        count: spanCount, detail: `${structureLabel} בעל ${spanCount} מפתח${spanCount > 1 ? "ים" : ""}`,
        spanNo: spanCount > 1 ? state.spans.map((s) => s.id).join("+") : (state.spans[0] ? state.spans[0].id : 1),
        dim: totalDim,
      }, pairs);
      for (const name of templateScoreSheets.slice(1)) wb.getWorksheet(name) && wb.removeWorksheet(wb.getWorksheet(name).id);
      wb.getWorksheet(TPL_AGG_SHEET) && wb.removeWorksheet(wb.getWorksheet(TPL_AGG_SHEET).id);
    } else {
      // אם יש יותר מ-6 מפתחים, משכפלים את הגיליונות הנוספים **לפני** שממלאים
      // אף גיליון — שכפול חייב לצאת מהתבנית הטהורה, לא מגיליון שכבר מולא
      // בנתוני מפתח אחר (אחרת ה"שכפול" יעתיק בטעות נתונים ממפתח קודם)
      const extraSheets = [];
      for (let i = 6; i < spanCount; i++) {
        extraSheets.push(cloneSheet(wb, wb.getWorksheet(TPL_SCORE_SHEET), `חישוב הציון - מפתח ${state.spans[i].id}`));
      }
      const spanEntries = [];
      result.spans.forEach((spanResult, i) => {
        const span = state.spans[i];
        const pairs = span.components.map((comp, j) => ({ comp, res: spanResult.comps[j] }));
        pairs.sort((a, b) => naturalCodeCompare(a.comp.catalogId, b.comp.catalogId));
        const sheetName = `חישוב הציון - מפתח ${span.id}`;
        let ws = i < 6 ? wb.getWorksheet(templateScoreSheets[i]) : extraSheets[i - 6];
        if (i < 6 && sheetName !== templateScoreSheets[i]) ws.name = safeSheetName(sheetName);
        const footer = fillScoreSheet(wb, ws, state, {
          count: 1, detail: `${structureLabel} בעל ${spanCount} מפתחים`, spanNo: span.id, dim: +span.dim || 0,
        }, pairs);
        spanEntries.push({ spanId: span.id, dim: +span.dim || 0, sheetName: ws.name, footer, scsCritValue: spanResult.unit.scsCrit });
      });
      for (const name of templateScoreSheets.slice(spanCount, 6)) wb.getWorksheet(name) && wb.removeWorksheet(wb.getWorksheet(name).id);
      fillAggregateSheet(wb, wb.getWorksheet(TPL_AGG_SHEET), state, spanCount, spanEntries);
    }
    const sheet1 = wb.getWorksheet("Sheet1");
    if (sheet1) wb.removeWorksheet(sheet1.id);

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `חישוב ציון - ${state.name || state.number || "ללא שם"}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return { exportCalculation };
})();
