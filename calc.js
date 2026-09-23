// ============================================================================
// מנוע חישוב Condition PI — לפי "הנחיות להערכת המצב המבני של גשרים, מנהרות
// ומבני דרך", נתיבי ישראל, מהדורה 9-2019 (פרק 03) + פנקס לסוקר (סעיפים 02.6–02.8)
// מודול טהור — ללא תלות ב-DOM. נטען גם ב-node (בדיקות) וגם בדפדפן.
// ============================================================================
(function (root, factory) {
  if (typeof module !== "undefined") {
    const data = require("./data.js");
    module.exports = factory(data);
  } else {
    // בדפדפן: הקבועים של data.js הם global lexical bindings (const) —
    // נגישים כשמות ישירים אך לא כ-window.X, לכן אורזים אותם מפורשות
    root.Calc = factory({ EXTENT, IMPORTANCE, MEANING_AV, MEANING_CRIT });
  }
})(typeof self !== "undefined" ? self : this, function (D) {
  const EXTENT = D.EXTENT;
  const IMPORTANCE = D.IMPORTANCE;
  const MEANING_AV = D.MEANING_AV;
  const MEANING_CRIT = D.MEANING_CRIT;

  const EPS = 1e-9;

  // --- משוואות 8.1/8.2: תרגום SCS ל-Condition PI ---
  function cpi(scs) {
    if (scs == null) return null;
    const v = 100 - 2 * (scs * scs + 6.5 * scs - 7.5);
    return Math.min(100, Math.max(0, v));
  }

  function meaning(value, table) {
    if (value == null) return null;
    for (const row of table) if (value >= row.min) return row;
    return table[table.length - 1];
  }

  // --- ולידציית שילוב חומרה-היקף (טבלאות 7–9 + כלל יחידת "יח'") ---
  function validateDefect(s, ex, unit) {
    const errors = [];
    if (!(s >= 1 && s <= 5)) errors.push("חומרה חייבת להיות 1–5");
    if (!EXTENT[ex]) errors.push("היקף חייב להיות A–E");
    if (ex === "A" && s !== 1) errors.push("היקף A אפשרי רק עם חומרה 1 (טבלה 9)");
    if (unit === "יח'" && s > 1 && ex !== "B")
      errors.push('רכיב שיחידת המידה שלו "יח\'" מדורג תמיד בהיקף B');
    return errors;
  }

  // --- חישוב רכיב בודד (סעיף 02.8: הערכה מפורטת) ---
  // comp: { key, name, importance, unit, surveyed, subs: [{id, size}] }
  // defects: רשומות S&Ex של הרכיב: [{ sub, s, ex, def, note }]
  function computeComponent(comp, defects) {
    const out = {
      key: comp.key, name: comp.name, importance: comp.importance,
      surveyed: comp.surveyed !== false, aux: comp.importance == null,
      defects: defects, defaulted: false,
      ecs: null, ecf: null, eci: null, eif: null, sMax: null, extent: null,
    };
    if (!out.surveyed) return out;             // לא נסקר — מחוץ לחישוב
    const subs = (comp.subs && comp.subs.length) ? comp.subs : [{ id: 1, size: 1 }];
    const maxSize = Math.max(...subs.map((s) => +s.size || 0), EPS);
    const wse = new Map(subs.map((s) => [String(s.id), (+s.size || 0) / maxSize]));
    const sumWse = subs.reduce((a, s) => a + ((+s.size || 0) / maxSize), 0) || 1;

    let sMax, extent;
    if (!defects.length) {                     // ברירת מחדל מנ"ג: 1A
      sMax = 1; extent = 0; out.defaulted = true;
    } else {
      // סעיף 02.7.4: פגמים מרובים על אותו תת-רכיב מצטמצמים תחילה לזוג (S,Ex)
      // אחד לתת-רכיב — S הוא החומרה הגרועה ביותר; כשכמה פגמים שווים בחומרה
      // המרבית (מצב ב', "פגמים משולבים") ההיקף הוא ההיקף הגרוע מביניהם, לא
      // סכומם — סכימה עלולה לחרוג מהתקרה 0.7 (טבלה 8) ולהפיק ECS שאינו קיים
      // בטבלה 11. תת-רכיב שאין לו בכלל הגדרה (sub שהוסר) אינו נספר.
      const bySub = new Map();
      for (const d of defects) {
        const key = String(d.sub);
        if (!wse.has(key)) continue;
        const exVal = EXTENT[d.ex] ? EXTENT[d.ex].value : 0;
        const cur = bySub.get(key);
        if (!cur || d.s > cur.s || (d.s === cur.s && exVal > cur.exVal)) bySub.set(key, { s: d.s, exVal });
      }
      const subRatings = [...bySub.values()];
      sMax = subRatings.length ? Math.max(...subRatings.map((v) => v.s)) : 1;
      let num = 0;
      for (const [subId, v] of bySub) {
        if (v.s !== sMax) continue;
        num += v.exVal * wse.get(subId);
      }
      extent = num / sumWse;
    }
    out.sMax = sMax;
    out.extent = extent;
    out.ecs = sMax === 5 ? 5.0 : sMax + extent;   // טבלה 11: S=5 ⇒ 5.0 קבוע
    if (out.aux) return out;                       // רכיב עזר — אין ציון
    const impDef = IMPORTANCE[comp.importance];
    const base = impDef.ecfBase;
    out.ecf = base - ((out.ecs - 1) * base) / 4;   // טבלה 12
    out.eci = Math.max(1.0, out.ecs - out.ecf);    // משוואה 5
    out.eif = impDef.eif;                          // טבלה 13
    return out;
  }

  // --- חישוב יחידה (מפתח בודד, או מבנה שלם עם 1–2 מפתחים) — משוואות 6.1, 7 ---
  function computeUnit(comps) {
    const scored = comps.filter((c) => c.surveyed && !c.aux && c.eci != null);
    const sumEif = scored.reduce((a, c) => a + c.eif, 0);
    const scsAv = sumEif ? scored.reduce((a, c) => a + c.eci * c.eif, 0) / sumEif : null;
    const critical = scored.filter((c) => c.importance === "veryHigh");
    const scsCrit = critical.length ? Math.max(...critical.map((c) => c.eci)) : null;
    return {
      components: comps, scored,
      notSurveyed: comps.filter((c) => !c.surveyed),
      scsAv, scsCrit,
      cpiAv: cpi(scsAv), cpiCrit: cpi(scsCrit),
    };
  }

  // ============================================================================
  // חישוב מבנה שלם
  // input = { structureClass, spans: [{ id, dim, components: [...], defects: [...] }] }
  //   component: { key, name, importance, unit, surveyed, subs }
  //   defect:    { compKey, sub, s, ex, def, note }
  // כלל 1–2 מפתחים: נסקרים ומחושבים כיחידה אחת (משוואה 6.1)
  // 3 מפתחים ומעלה: SCSav פר מפתח → שקלול לפי מימד (משוואה 6.2)
  // ============================================================================
  function computeStructure(input) {
    const spans = input.spans || [];
    const perSpanComps = spans.map((span) =>
      (span.components || []).map((c) =>
        computeComponent(c, (span.defects || []).filter((d) => d.compKey === c.key))
      )
    );

    const result = { structureClass: input.structureClass, spans: [], singleUnit: spans.length <= 2 };

    if (result.singleUnit) {
      const all = perSpanComps.flat();
      const unit = computeUnit(all);
      result.unit = unit;
      result.spans = spans.map((s, i) => ({ id: s.id, dim: s.dim, unit: null, comps: perSpanComps[i] }));
      result.bridge = {
        method_norm:  { scsAv: unit.scsAv, cpiAv: unit.cpiAv },
        method_files: { cpiAv: unit.cpiAv },
        scsCrit: unit.scsCrit, cpiCrit: unit.cpiCrit,
      };
    } else {
      const units = perSpanComps.map((comps) => computeUnit(comps));
      result.spans = spans.map((s, i) => ({ id: s.id, dim: +s.dim || 0, unit: units[i], comps: perSpanComps[i] }));
      const withScore = result.spans.filter((s) => s.unit.scsAv != null && s.dim > 0);
      const sumDim = withScore.reduce((a, s) => a + s.dim, 0);
      // שיטת הנוהל (משוואה 6.2): שקלול SCS ואז המרה ל-CPI
      const scsAvW = sumDim ? withScore.reduce((a, s) => a + s.unit.scsAv * s.dim, 0) / sumDim : null;
      // שיטת הקבצים הקיימים: שקלול ערכי ה-CPI ישירות
      const cpiAvW = sumDim ? withScore.reduce((a, s) => a + s.unit.cpiAv * s.dim, 0) / sumDim : null;
      const crits = result.spans.map((s) => s.unit.scsCrit).filter((v) => v != null);
      const scsCrit = crits.length ? Math.max(...crits) : null;
      result.bridge = {
        method_norm:  { scsAv: scsAvW, cpiAv: cpi(scsAvW) },
        method_files: { cpiAv: cpiAvW },
        scsCrit, cpiCrit: cpi(scsCrit),
      };
    }

    result.bridge.meaningAv = meaning(result.bridge.method_norm.cpiAv, MEANING_AV);
    result.bridge.meaningAvFiles = meaning(result.bridge.method_files.cpiAv, MEANING_AV);
    result.bridge.meaningCrit = meaning(result.bridge.cpiCrit, MEANING_CRIT);
    return result;
  }

  // ============================================================================
  // תקציר מנהלים — נתונים מובנים (הרינדור לעברית נעשה בשכבת ה-UI)
  // ============================================================================
  function executiveSummary(input, result) {
    const allComps = result.spans.flatMap((s, i) =>
      s.comps.map((c) => ({ ...c, spanId: input.spans[i].id }))
    );
    const scored = allComps.filter((c) => c.surveyed && !c.aux && c.eci != null);
    const sorted = [...scored].sort((a, b) => b.eci - a.eci);
    const worst = sorted.slice(0, 5).filter((c) => c.eci > 1 + EPS);
    const criticalComp = scored
      .filter((c) => c.importance === "veryHigh")
      .sort((a, b) => b.eci - a.eci)[0] || null;

    const dist = { intact: 0, light: 0, medium: 0, severe: 0 };
    for (const c of scored) {
      if (c.sMax <= 1) dist.intact++;
      else if (c.sMax === 2) dist.light++;
      else if (c.sMax === 3) dist.medium++;
      else dist.severe++;
    }

    let weakestSpan = null;
    if (!result.singleUnit) {
      const ranked = result.spans.filter((s) => s.unit.cpiAv != null)
        .sort((a, b) => a.unit.cpiAv - b.unit.cpiAv);
      if (ranked.length) weakestSpan = { id: ranked[0].id, cpiAv: ranked[0].unit.cpiAv };
    }

    // כל הרכיבים שקובעים בפועל את SCScrit — לרוב כמה רכיבים (ובכמה מפתחים)
    // חולקים את אותו Eci מרבי, ו-criticalComp לבדו מציג רק את הראשון מהם
    const scsCrit = result.bridge.scsCrit;
    const criticalTies = scsCrit == null ? [] : scored.filter((c) =>
      c.importance === "veryHigh" && Math.abs(c.eci - scsCrit) < EPS);

    // תרומת כל רכיב להורדת SCSav מ-1 (משוואות 6.1/6.2): w·(Eci−1)·Eif/ΣEif,
    // כש-w הוא משקל המפתח (מימד/Σמימד) במבנה של 3+ מפתחים, או 1 ביחידה
    // אחת. סכום כל התרומות שווה בדיוק ל-SCSav−1
    const avContributions = [];
    const addUnit = (comps, spanId, w) => {
      const sc = comps.filter((c) => c.surveyed && !c.aux && c.eci != null);
      const sumEif = sc.reduce((a, c) => a + c.eif, 0);
      if (!sumEif) return;
      for (const c of sc) {
        const contribution = (w * (c.eci - 1) * c.eif) / sumEif;
        if (contribution > EPS) avContributions.push({ comp: c, spanId: spanId(c), contribution });
      }
    };
    if (result.singleUnit) {
      addUnit(allComps, (c) => c.spanId, 1);
    } else {
      const withScore = result.spans.filter((s) => s.unit.scsAv != null && s.dim > 0);
      const sumDim = withScore.reduce((a, s) => a + s.dim, 0);
      for (const s of withScore) {
        addUnit(allComps.filter((c) => c.spanId === s.id), () => s.id, s.dim / sumDim);
      }
    }

    // פגמים לטיפול: כל פגם בחומרה 3 ומעלה ברכיב שנסקר (כולל רכיבי עזר —
    // אינם משפיעים על הציון אך עדיין דורשים טיפול)
    const treatments = allComps.filter((c) => c.surveyed).flatMap((c) =>
      (c.defects || []).filter((d) => d.s >= 3).map((d) => ({ comp: c, defect: d })));
    const minorCount = allComps.filter((c) => c.surveyed &&
      (c.defects || []).some((d) => d.s === 2) && !(c.defects || []).some((d) => d.s >= 3)).length;

    return {
      criticalComp,
      criticalTies,
      avContributions,
      treatments,
      minorCount,
      worstComponents: worst,
      distribution: dist,
      totalScored: scored.length,
      notSurveyed: allComps.filter((c) => !c.surveyed),
      defaulted: scored.filter((c) => c.defaulted),
      failed: scored.filter((c) => c.sMax === 5),
      severeDefects: allComps.flatMap((c) =>
        (c.defects || []).filter((d) => d.s >= 4).map((d) => ({ comp: c, defect: d }))
      ),
      weakestSpan,
    };
  }

  // ============================================================================
  // "מה אם" — ציון המבנה לאחר תיקון פגמים (הנחיות לביצוע סקירה, סעיף 2.6.6:
  // אומדן CPI העתידי הצפוי לאחר ביצוע הטיפולים המומלצים). פגם שתוקן מוסר,
  // והרכיב מחושב מחדש לפי שאר הפגמים שלו (או 1A אם לא נותרו) — אותו מנוע
  // בדיוק, בלי נוסחה נפרדת. removeSet מזהה פגמים לפי הפניית אובייקט: ה-
  // defects בתוצאת computeComponent הם אותם אובייקטים שב-input.
  // ============================================================================
  function scoreAfter(input, removeSet) {
    const r = computeStructure({
      ...input,
      spans: input.spans.map((s) => ({ ...s, defects: (s.defects || []).filter((d) => !removeSet.has(d)) })),
    });
    return {
      cpiAv: r.bridge.method_norm.cpiAv, cpiCrit: r.bridge.cpiCrit,
      meaningAv: r.bridge.meaningAv, meaningCrit: r.bridge.meaningCrit,
    };
  }

  // ציון היעד שכל מבנה אמור להגיע אליו — כלל עבודה פנימי של המשתמש, לא
  // מופיע בנוהל ולא מודפס בתקציר; קובע אילו פגמים חייבים להיכלל בו
  const TARGETS = { cpiAv: 92, cpiCrit: 81 };
  // היפוך משוואת ה-CPI: SCS שבו CPI שווה בדיוק ליעד (81 → 2.0, 92 → 1.447)
  function scsForCpi(target) {
    const c = (100 - target) / 2 + 7.5;              // SCS² + 6.5·SCS = c
    return (-6.5 + Math.sqrt(42.25 + 4 * c)) / 2;
  }

  // הפגמים שחייבים לתקן כדי שהמבנה יגיע ליעד. שני שלבים:
  // (1) קריטי: כל רכיב בחשיבות "גבוהה מאוד" עם Eci מעל ה-SCS של היעד —
  //     מסירים ממנו פגם אחד בכל פעם (החומרה המרבית, ההיקף הגדול ביותר)
  //     עד שהוא יורד אל היעד. ב-81 זה Eci ≤ 2.0, כך שגם חומרה 2 בהיקף C
  //     ומעלה (Eci 2.1) נכללת.
  // (2) ממוצע: SCSav הוא ממוצע משוקלל, ולכן אין רכיב יחיד ש"מונע" את היעד;
  //     בוחרים בכל צעד את הרכיב שתיקון החומרה המרבית שלו מוריד את SCSav הכי
  //     הרבה (w·ΔEci·Eif/ΣEif — אנליטי, בלי חישוב מבנה מלא), עד שמגיעים ליעד.
  // המנוע עובד ברמת רכיב בודד (computeComponent); הציון הסופי מאומת בחישוב מלא.
  function targetPlan(input, result, targets) {
    const T = targets || TARGETS;
    const tCrit = scsForCpi(T.cpiCrit), tAv = scsForCpi(T.cpiAv);
    const removed = new Set();
    const reasons = new Map();                        // defect → "crit" | "av"
    const units = [];
    const entries = [];
    const addUnit = (spanIdxs, w) => {
      const unit = { w, sumEif: 0 };
      for (const i of spanIdxs) {
        const span = input.spans[i];
        for (const comp of span.components || []) {
          const defects = (span.defects || []).filter((d) => d.compKey === comp.key);
          const e = { comp, defects, unit, res: computeComponent(comp, defects) };
          entries.push(e);
          if (e.res.surveyed && !e.res.aux && e.res.eci != null) unit.sumEif += e.res.eif;
        }
      }
      units.push(unit);
    };
    if (result.singleUnit) {
      addUnit(input.spans.map((_, i) => i), 1);
    } else {
      const counted = result.spans.map((s, i) => ({ s, i })).filter(({ s }) => s.unit.scsAv != null && s.dim > 0);
      const sumDim = counted.reduce((a, { s }) => a + s.dim, 0);
      const countedIdx = new Set(counted.map(({ i }) => i));
      input.spans.forEach((_, i) => addUnit([i], countedIdx.has(i) && sumDim ? result.spans[i].dim / sumDim : 0));
    }
    const scored = (e) => e.res.surveyed && !e.res.aux && e.res.eci != null;
    const live = (e) => e.defects.filter((d) => !removed.has(d));
    const recompute = (e) => { e.res = computeComponent(e.comp, live(e)); };
    const exVal = (d) => (EXTENT[d.ex] ? EXTENT[d.ex].value : 0);

    for (const e of entries) {
      if (!scored(e) || e.comp.importance !== "veryHigh") continue;
      for (let guard = 0; e.res.eci > tCrit + EPS && guard < 200; guard++) {
        const top = live(e).filter((d) => d.s === e.res.sMax).sort((a, b) => exVal(b) - exVal(a))[0];
        if (!top) break;
        removed.add(top); reasons.set(top, "crit");
        recompute(e);
      }
    }

    const scsAvNow = () => units.reduce((a, u) => a + (u.sumEif && u.w
      ? u.w * entries.filter((e) => e.unit === u && scored(e)).reduce((s, e) => s + e.res.eci * e.res.eif, 0) / u.sumEif
      : 0), 0);
    if (result.bridge.method_norm.cpiAv != null) {
      let scs = scsAvNow();
      for (let guard = 0; scs > tAv + EPS && guard < 1000; guard++) {
        let best = null;
        for (const e of entries) {
          if (!scored(e) || e.res.eci <= 1 + EPS || !e.unit.w || !e.unit.sumEif) continue;
          const drop = live(e).filter((d) => d.s === e.res.sMax);
          if (!drop.length) continue;
          const after = computeComponent(e.comp, live(e).filter((d) => !drop.includes(d)));
          const delta = (e.unit.w * (e.res.eci - after.eci) * e.res.eif) / e.unit.sumEif;
          if (delta > EPS && (!best || delta > best.delta)) best = { e, drop, delta };
        }
        if (!best) break;
        for (const d of best.drop) { removed.add(d); if (!reasons.has(d)) reasons.set(d, "av"); }
        recompute(best.e);
        scs -= best.delta;
      }
    }

    const after = scoreAfter(input, removed);
    return {
      removed, reasons, after,
      reachedCrit: after.cpiCrit == null || after.cpiCrit >= T.cpiCrit - 1e-6,
      reachedAv: after.cpiAv == null || after.cpiAv >= T.cpiAv - 1e-6,
    };
  }

  // תוכנית הטיפול לתקציר המנהלים: הפגמים שנדרשים להגעה ליעד (targetPlan),
  // ובנוסף — בלי קשר ליעד — כל פגם מהותי (S≥3) ברכיב בטיחות וכל פגם חמור
  // (S≥4). יקר יחסית, ולכן נפרד מ-executiveSummary שרץ בכל עדכון מסך.
  // safetyKeys: מפתחות "רכיבי בטיחות" (נקבע בשכבת האפליקציה לפי הקטלוג)
  function improvementPlan(input, result, summary, opts) {
    const safetyKeys = (opts && opts.safetyKeys) || new Set();
    const current = {
      cpiAv: result.bridge.method_norm.cpiAv, cpiCrit: result.bridge.cpiCrit,
      meaningAv: result.bridge.meaningAv, meaningCrit: result.bridge.meaningCrit,
    };
    const tp = targetPlan(input, result, opts && opts.targets);

    const compByKey = new Map(result.spans.flatMap((s) => s.comps.map((c) => [c.key, { ...c, spanId: s.id }])));
    const include = new Set(tp.removed);
    for (const [key, c] of compByKey) {
      if (!c.surveyed) continue;
      for (const d of c.defects || []) {
        if (d.s >= 4 || (d.s >= 3 && safetyKeys.has(key))) include.add(d);
      }
    }

    const groups = new Map();
    for (const d of include) {
      const comp = compByKey.get(d.compKey);
      if (!comp) continue;
      const isSafety = safetyKeys.has(comp.key);
      // שורה אחת לכל סוג פגם (כיוון הטיפול תלוי בסוג הפגם בלבד); s = החומרה
      // המרבית בשורה, sMin — לתצוגת טווח. רכיבי בטיחות בשורה נפרדת כדי
      // שיוקדמו בסדר העדיפויות
      const key = `${d.def || ""}|${isSafety}`;
      if (!groups.has(key)) groups.set(key, { def: d.def, s: d.s, sMin: d.s, isSafety, items: [], defects: new Set() });
      const g = groups.get(key);
      g.s = Math.max(g.s, d.s); g.sMin = Math.min(g.sMin, d.s);
      g.items.push({ comp, spanId: comp.spanId, ex: d.ex });
      g.defects.add(d);
    }
    const gain = (after, k) => (after[k] != null && current[k] != null ? after[k] - current[k] : 0);
    const list = [...groups.values()].map((g) => {
      const alone = scoreAfter(input, g.defects);
      return { ...g, gainAv: gain(alone, "cpiAv"), gainCrit: gain(alone, "cpiCrit") };
    });
    list.sort((a, b) => (b.isSafety - a.isSafety) || (b.s - a.s) ||
      (b.gainCrit - a.gainCrit) || (b.gainAv - a.gainAv));
    // ציון מצטבר: לאחר תיקון השורה הזו וכל השורות שמעליה
    const cumulative = new Set();
    for (const g of list) {
      for (const d of g.defects) cumulative.add(d);
      g.after = scoreAfter(input, cumulative);
    }

    const allDefects = [...compByKey.values()].filter((c) => c.surveyed).flatMap((c) => c.defects || []);
    const otherCount = allDefects.filter((d) => d.s >= 2 && !include.has(d)).length;

    return {
      current, groups: list, allFix: list.length ? list[list.length - 1].after : null,
      reachedCrit: tp.reachedCrit, reachedAv: tp.reachedAv, otherCount,
    };
  }

  return { cpi, meaning, validateDefect, computeComponent, computeUnit, computeStructure, executiveSummary, scoreAfter, scsForCpi, targetPlan, improvementPlan };
});
