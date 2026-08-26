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

    return {
      criticalComp,
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

  return { cpi, meaning, validateDefect, computeComponent, computeUnit, computeStructure, executiveSummary };
});
