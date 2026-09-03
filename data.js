// ============================================================================
// קטלוגים וקבועים — לפי נוהלי נתיבי ישראל:
//  "הנחיות להערכת המצב המבני של גשרים, מנהרות ומבני דרך" מהדורה 9-2019
//  "אוגדן חלוקה ומספור רכיבים" מהדורה 1-2020
//  "הנחיות לביצוע סקירת גשרים מנהרות ומבני דרך" מהדורה 6-2019
// ============================================================================

// --- טבלה 8: דרגות היקף הנזק Ex ---
const EXTENT = {
  A: { value: 0.0, label: "ללא נזק משמעותי", pct: "0%" },
  B: { value: 0.0, label: "נזק/פגם קל", pct: "עד 5%" },
  C: { value: 0.1, label: "נזק/פגם בינוני", pct: "5%–20%" },
  D: { value: 0.3, label: "נזק/פגם נרחב", pct: "20%–50%" },
  E: { value: 0.7, label: "נזק/פגם מקיף", pct: "מעל 50%" },
};

// --- טבלאות 12–13: מקדמי חשיבות ---
const IMPORTANCE = {
  veryHigh: { label: "גבוהה מאוד", ecfBase: 0.0, eif: 2.0 },
  high:     { label: "גבוהה",      ecfBase: 0.3, eif: 1.5 },
  medium:   { label: "בינונית",    ecfBase: 0.6, eif: 1.2 },
  low:      { label: "נמוכה",      ecfBase: 1.2, eif: 1.0 },
};

// --- טבלה 7: דרגות חומרה בסיסיות ---
const SEVERITY_GENERIC = {
  1: "מצב כמו חדש או שלפגם אין השפעה על הרכיב – חזותית ותפקודית.",
  2: "סימני הידרדרות ראשוניים, נזק או פגם מזעריים, ללא ירידה בתפקוד הרכיב.",
  3: "נזק או פגם בינוניים, ניתן לצפות לירידה מסוימת בתפקוד הרכיב.",
  4: "נזק או פגם חמורים, ירידה משמעותית בתפקוד הרכיב או שהרכיב קרוב לכשל/התמוטטות.",
  5: "הרכיב כשל או שאינו מתפקד.",
};

// --- סיווגים ראשיים + מימד השקלול שלהם (סעיף 03.2.8) ---
const STRUCTURE_CLASSES = {
  BRG: { label: "גשר / מעבר תחתי / מובל גדול (מפתח ≥ 4 מ')", dimLabel: "שטח מיסעה [מ\"ר]" },
  CLV: { label: "גשרון / מעבר / מובל (מפתח 1.5–4 מ')", dimLabel: "שטח מיסעה [מ\"ר]" },
  SGR: { label: "גשר שילוט", dimLabel: "אורך [מ']" },
  WAL: { label: "קיר תומך / קיר אקוסטי / קיר תעלה בנויה", dimLabel: "שטח קיר [מ\"ר]" },
  TUN: { label: "מנהרה", dimLabel: "שטח מעטפת פנימית [מ\"ר]" },
};

// --- רשימת התמונות הנדרשות ל"תמונות כלליות לטובת התמצאות", לפי סוג המבנה —
// מהטבלה "ממצאים" בכל אחד ממסמכי "דפי עזר לסקירה..." (נתיבי ישראל). אין
// מסמך מקביל למנהרה (TUN), ולכן אין רשימת ברירת מחדל עבורה. ---
const REQUIRED_FINDINGS_BY_CLASS = {
  BRG: [
    "מבט כללי 1", "מבט כללי 2", "מעקה רכב טיפוסי", "חזית ימין", "סמך טיפוסי",
    "קיר כנף 1", "קיר כנף 3", "מבט אל הערוץ 1", "מבט על תחתית המיסעה",
    "ניצב קצה טיפוסי", "ניצב ביניים טיפוסי", "תפר טיפוסי", "מבט על המיסעה",
    "חזית שמאל", "קיר מצח 2", "קיר כנף 2", "קיר כנף 4", "מבט אל הערוץ 2",
  ],
  CLV: [
    "מבט כללי 1", "מבט כללי 2", "מעקה רכב טיפוסי", "חזית ימין", "קיר מצח 1",
    "קיר כנף 1", "קיר כנף 3", "מבט אל הערוץ 1", "תקרת המובל", "רצפת המובל",
    "ניצב קצה A", "ניצב קצה B", "תוך המובל", "חזית שמאל", "קיר מצח 2",
    "קיר כנף 2", "קיר כנף 4", "מבט אל הערוץ 2",
  ],
  SGR: [
    "חזית אחורית", "חזית קדמית", "שילוט - כל שלט בנפרד", "שלטי הגבלת גובה",
    "עמוד 1 - חזיתות 2", "יסוד 1", "מחבר תחתון טיפוסי", "סולם הגישה",
    "עמוד 2 - חזיתות 2", "יסוד 2", "מחבר עליון - חיבור עמוד למסבך",
    "מבט אל תוך המסבך", "משטח הדריכה", "מחבר מסבך טיפוסי", "הארקות",
    "מערכות חשמל ותקשורת", "מבט כללי 1", "מבט כללי 2", "מחברי שילוט",
    "מדידת הגבריט = H", "מידות השילוט",
  ],
  WAL: [
    "מסלול בראש הקיר 1", "מסלול בראש הקיר 2", "מסלול בבסיס הקיר 1",
    "מסלול בבסיס הקיר 2", "מעקה רכב טיפוסי", "הקיר - רכיב ראשי",
    "הקיר - רכיב משני", "ניקוזים", "תפר טיפוסי", "קרקעית הנחל / התעלה",
    "שטח בור בראש הקיר", "שטח בור בבסיס הקיר", "תמונה כללית - קיר",
    "תמונה כללית - קיר המשך", "גובה קיר = H", "כמות עמודי תאורה",
  ],
};

// --- טבלה 2: סוגי מבנה-על (BRG/CLV) → רכיב ראשי (01) ומשני (03) ---
const SUPERSTRUCTURE_TYPES = [
  { id: 1,  label: "קשת מלאה",                    main: { code: "1.1",  name: "גוף הקשת",    unit: "מ\"ר" }, secondary: null },
  { id: 2,  label: "קשת פתוחה",                   main: { code: "1.2",  name: "גוף הקשת",    unit: "מ\"ר" }, secondary: { code: "3.2",  name: "טבלת המיסעה", unit: "מ\"ר" } },
  { id: 3,  label: "קשת מוחזקת (מיתר)",           main: { code: "1.3",  name: "גוף הקשת",    unit: "מ\"א", unit2: "[מ\"א היקף]" }, secondary: { code: "3.3",  name: "טבלת המיסעה", unit: "מ\"ר" } },
  { id: 4,  label: "קורות וטבלה",                 main: { code: "1.4",  name: "קורה ראשית",  unit: "מ\"א", unit2: "[מ\"א היקף]" }, secondary: { code: "3.4",  name: "טבלת המיסעה", unit: "מ\"ר" } },
  { id: 5,  label: "חתך ארגזי",                   main: { code: "1.5",  name: "גוף הארגז",   unit: "מ\"א" }, secondary: { code: "3.5",  name: "טבלת המיסעה", unit: "מ\"ר" } },
  { id: 6,  label: "קורות Half through",          main: { code: "1.6",  name: "קורה ראשית",  unit: "מ\"א", unit2: "[מ\"א היקף]" }, secondary: { code: "3.6",  name: "טבלת המיסעה", unit: "מ\"ר" } },
  { id: 7,  label: "קורות ומילוי מרוכבים",        main: { code: "1.7",  name: "קורה ראשית",  unit: "מ\"א", unit2: "[מ\"א היקף]" }, secondary: { code: "3.7",  name: "חומר המילוי", unit: "מ\"ר" } },
  { id: 8,  label: "מסבך תחתון Underslung truss", main: { code: "1.8",  name: "גוף המסבך",   unit: "מ\"א" }, secondary: { code: "3.8",  name: "טבלת המיסעה", unit: "מ\"ר" } },
  { id: 9,  label: "מסבך Half through truss",     main: { code: "1.9",  name: "גוף המסבך",   unit: "מ\"א" }, secondary: { code: "3.9",  name: "טבלת המיסעה", unit: "מ\"ר" } },
  { id: 10, label: "מסבך Trough truss",           main: { code: "1.10", name: "גוף המסבך",   unit: "מ\"א" }, secondary: { code: "3.10", name: "טבלת המיסעה", unit: "מ\"ר" } },
  { id: 11, label: "טבלה מונוליטית מלאה",         main: { code: "1.11", name: "הטבלה",       unit: "מ\"ר" }, secondary: null },
  { id: 12, label: "טבלה מונוליטית עם חללים",     main: { code: "1.12", name: "הטבלה",       unit: "מ\"ר" }, secondary: null },
  { id: 13, label: "מובל/צינור/מעבר עגול או אובלי", main: { code: "1.13", name: "גוף המובל", unit: "מ\"א", unit2: "[מ\"א היקף]" }, secondary: null },
  { id: 14, label: "מובל ארגזי/מסגרתי",           main: { code: "1.14", name: "טבלת התקרה",  unit: "מ\"ר" }, secondary: null },
];

// --- טבלה 6: סוגי מנהרה → רכיב ראשי ---
const TUNNEL_TYPES = [
  { id: 1,  label: "חתך ארגזי עם תקרה מקשית יצוקה באתר",            main: { code: "01.01", name: "טבלת התקרה", unit: "מ\"ר" }, secondary: null },
  { id: 2,  label: "חתך ארגזי עם תקרת קורות וטבלה",                 main: { code: "01.02", name: "קורת התקרה", unit: "מ\"א", unit2: "[מ\"א היקף]" }, secondary: { code: "3.2", name: "טבלת התקרה", unit: "מ\"ר" } },
  { id: 3,  label: "חתך ארגזי עם תקרת קורות ומילוי מרוכבים",        main: { code: "01.03", name: "קורה ראשית", unit: "מ\"א", unit2: "[מ\"א היקף]" }, secondary: { code: "3.3", name: "חומר המילוי", unit: "מ\"ר" } },
  { id: 4,  label: "חתך ארגזי ממקטעים טרומיים",                     main: { code: "01.04", name: "טבלת תקרה", unit: "מ\"ר" }, secondary: null },
  { id: 5,  label: "חתך אחר (קשתי, מעגל, פרסה וכד') יצוק באתר",     main: { code: "01.05", name: "גוף המנהרה", unit: "מ\"א", unit2: "[מ\"א היקף]" }, secondary: null },
  { id: 6,  label: "חתך אחר (קשתי, מעגל, פרסה וכד') ממקטעים טרומיים", main: { code: "01.06", name: "גוף המנהרה", unit: "מ\"א", unit2: "[מ\"א היקף]" }, secondary: null },
  { id: 10, label: "מגלב — חתך ארגזי ממקטעים טרומיים",              main: { code: "01.10", name: "טבלת תקרה", unit: "מ\"ר" }, secondary: null },
  { id: 11, label: "מגלב — חתך אחר (מעגל, אוולי וכד') ממקטעים טרומיים", main: { code: "01.11", name: "גוף המנהרה", unit: "מ\"א", unit2: "[מ\"א היקף]" }, secondary: null },
  { id: 20, label: "מנהרה בכרייה — דיפון מבטון מזוין יצוק באתר",    main: { code: "01.20", name: "גוף המנהרה (דיפון)", unit: "מ\"ר" }, secondary: null },
  { id: 21, label: "מנהרה בכרייה — דיפון ממקטעים טרומיים (TBM)",    main: { code: "01.21", name: "גוף המנהרה (דיפון)", unit: "מ\"ר" }, secondary: null },
  { id: 22, label: "מנהרה בכרייה — דיפון ע\"י בטון מותז",           main: { code: "01.22", name: "גוף המנהרה (דיפון)", unit: "מ\"ר" }, secondary: null },
  { id: 23, label: "מנהרה ללא דיפון (סלע חשוף)",                    main: { code: "01.23", name: "גוף המנהרה", unit: "מ\"ר" }, secondary: null },
  { id: 24, label: "דיפון גוף המנהרה — אבן/לבנים",                  main: { code: "01.24", name: "גוף המנהרה (דיפון)", unit: "מ\"ר" }, secondary: null },
  { id: 25, label: "דיפון ע\"י קונסטרוקציית פלדה",                  main: { code: "01.25", name: "גוף המנהרה (דיפון)", unit: "מ\"ר" }, secondary: null },
  { id: 26, label: "דיפון ע\"י קונסטרוקציית עץ",                    main: { code: "01.26", name: "גוף המנהרה (דיפון)", unit: "מ\"ר" }, secondary: null },
  { id: 27, label: "דיפונים אחרים",                                 main: { code: "01.27", name: "גוף המנהרה (דיפון)", unit: "מ\"ר" }, secondary: null },
];

// ============================================================================
// קטלוגי רכיבים לפי סוג מבנה
// imp: veryHigh/high/medium/low/null (null = רכיב עזר, לא נכלל בציון)
// unit: יחידת מידה בסיסית ("יח'" ⇒ היקף B קבוע)  unit2: יחידת מידה משנית
// detailed: "נדרשת הערכה מפורטת" (חלוקה לתתי-רכיבים)
// ============================================================================

// --- טבלה 1: רכיבי גשרים, מעברים תחתיים ומובלי ניקוז (BRG + CLV) ---
const COMPONENTS_BRG = [
  { id: 1,  name: "רכיב ראשי (לפי סוג המבנה)",  group: "מיסעה ומבנה עליון", imp: "veryHigh", unit: "לפי סוג", unit2: null, detailed: true, dynamic: "main" },
  { id: 2,  name: "רכיב משני — קורות רוחב / דיאפרגמות", group: "מיסעה ומבנה עליון", imp: "veryHigh", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 3,  name: "רכיב משני (לפי סוג המבנה)", group: "מיסעה ומבנה עליון", imp: "veryHigh", unit: "לפי סוג", unit2: null, detailed: true, dynamic: "secondary" },
  { id: 4,  name: "חצאי פרקים",                 group: "מיסעה ומבנה עליון", imp: "veryHigh", unit: "מ\"א", unit2: null, detailed: true },
  { id: 5,  name: "קורות קשר / מוטות תליה / מתלים / הקשחות מיסעה", group: "מיסעה ומבנה עליון", imp: "veryHigh", unit: "מ\"א", unit2: null, detailed: true },
  { id: 6,  name: "זיז קצה",                    group: "מיסעה ומבנה עליון", imp: "veryHigh", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 7,  name: "מעצורי גזירה",               group: "מיסעה ומבנה עליון", imp: "high",     unit: "יח'", unit2: "[מ\"ר]", detailed: true },
  { id: 8,  name: "כלונסאות / יסודות / ראשי כלונסאות", group: "מבנה נושא ומבנה תחתון", imp: "high", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 9,  name: "נציבי קצה / בסיס קשת / קירות סוגרים", group: "מבנה נושא ומבנה תחתון", imp: "high", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 10, name: "קירות מצח",                  group: "מבנה נושא ומבנה תחתון", imp: "high",     unit: "מ\"ר", unit2: null, detailed: true },
  { id: 11, name: "עמודים / נציבי ביניים / חיזוקי קשתות", group: "מבנה נושא ומבנה תחתון", imp: "veryHigh", unit: "[מ\"ר מעטפת]", unit2: null, detailed: true },
  { id: 12, name: "קורות ראש / ראשי עמודים",    group: "מבנה נושא ומבנה תחתון", imp: "veryHigh", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 13, name: "סמכים מסוגים שונים",         group: "מבנה נושא ומבנה תחתון", imp: "high",     unit: "יח'", unit2: null, detailed: true },
  { id: 14, name: "משטחי השענה לסמכים",         group: "מבנה נושא ומבנה תחתון", imp: "medium",   unit: "מ\"ר", unit2: null, detailed: true },
  { id: 15, name: "ניקוז מבנה עליון",           group: "רכיבי קיים והגנות", imp: "medium", unit: "יח'", unit2: null, detailed: false },
  { id: 16, name: "ניקוז מבנה תחתון / תעלות",   group: "רכיבי קיים והגנות", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 17, name: "איטומים שונים (מבנה עליון ותחתון)", group: "רכיבי קיים והגנות", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 18, name: "תפרי התפשטות במיסעות הגשרים", group: "רכיבי קיים והגנות", imp: "high", unit: "מ\"א", unit2: null, detailed: true },
  { id: 19, name: "צביעה וציפויי הגנה: רכיבי מבנה עליון", group: "רכיבי קיים והגנות", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 20, name: "חיפוי/צביעה/ציפויי הגנה: רכיבי מבנה תחתון", group: "רכיבי קיים והגנות", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 21, name: "חיפוי/צביעה/ציפויי הגנה: כרכובים ומעקות", group: "רכיבי קיים והגנות", imp: "medium", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 22, name: "סולמות / מעברים / מדרגות / שבילי גישה", group: "רכיבי בטיחות", imp: "medium", unit: "מ\"א", unit2: "[מטר רוחב]", detailed: true },
  { id: 23, name: "מעקות בטיחות / מעקות לה\"ר", group: "רכיבי בטיחות", imp: "high",   unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 24, name: "ציפוי מיסעה (אספלט וכד')",   group: "רכיבי בטיחות", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 25, name: "ציפוי פני מדרכות / הגבהות / שוליים / ציפוי פני גשרי ה\"ר", group: "רכיבי בטיחות", imp: "low", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 26, name: "קרקעית הנחל / תחתית השטח שמתחת לגשר", group: "רכיבי גשר אחרים", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 27, name: "סינורים / קורות שפה / כרכובים", group: "רכיבי גשר אחרים", imp: "medium", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: false },
  { id: 28, name: "הגנת נציבים / הגנת התנגשות / הגנה מזרימה", group: "רכיבי גשר אחרים", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 29, name: "רכיבי הסדרת ערוץ",           group: "רכיבי גשר אחרים", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 30, name: "דיפונים / מדרונות משופעים מצופים", group: "רכיבי גשר אחרים", imp: "low", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 31, name: "קירות כנף",                  group: "רכיבי גשר אחרים", imp: "high",   unit: "מ\"ר", unit2: null, detailed: true },
  { id: 32, name: "קירות תומכים",               group: "רכיבי גשר אחרים", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 33, name: "פני דופן סוללות",            group: "רכיבי גשר אחרים", imp: "low",    unit: "מ\"ר", unit2: null, detailed: true },
  { id: 34, name: "תפרי התפשטות בקירות גשר ומובלים", group: "רכיבי גשר אחרים", imp: "medium", unit: "יח'", unit2: null, detailed: true },
  { id: 35, name: "קירות ברמפות הגישה לגשר",    group: "רכיבי עזר", imp: null, unit: "מ\"ר", unit2: null, detailed: true },
  { id: 36, name: "שילוט",                      group: "רכיבי עזר", imp: null, unit: "יח'", unit2: null, detailed: false },
  { id: 37, name: "תאורה",                      group: "רכיבי עזר", imp: null, unit: "יח'", unit2: null, detailed: false },
  { id: 38, name: "מערכות / שירותים",           group: "רכיבי עזר", imp: null, unit: "מ\"א", unit2: null, detailed: true },
  { id: 39, name: "טבלות גישה",                 group: "רכיבי עזר", imp: null, unit: "מ\"ר", unit2: null, detailed: true },
  { id: 40, name: "תעלות ניקוז ברמפות הגישה",   group: "רכיבי עזר", imp: null, unit: "מ\"ר", unit2: null, detailed: true },
  { id: 41, name: "אבני שפה",                   group: "רכיבי עזר", imp: null, unit: "מ\"א", unit2: null, detailed: false },
  { id: 42, name: "מעקות ברמפות הגישה לגשר",    group: "רכיבי עזר", imp: null, unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 43, name: "רכיבים מכניים שונים (שערים, סופגי אנרגיה, מרסנים)", group: "רכיבי עזר", imp: null, unit: "יח'", unit2: null, detailed: true },
  { id: 46, name: "מקבעי עוגנים (blisters) / עוגנים / אוכפים (saddle)", group: "גשרים תלויים ודרוכים", imp: "veryHigh", unit: "יח'", unit2: "[מ\"ר]", detailed: true },
];

// --- טבלה 3: רכיבי גשר שילוט (SGR) ---
const COMPONENTS_SGR = [
  { id: 1,  name: "יסודות",                     group: "רכיבים נושאי עומס", imp: "high",     unit: "יח'", unit2: "[מ\"ר]", detailed: true },
  { id: 2,  name: "מסבך / קורה / זיז",          group: "רכיבים נושאי עומס", imp: "veryHigh", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 3,  name: "רכיבים ניצבים / רוחביים",    group: "רכיבים נושאי עומס", imp: "veryHigh", unit: "מ\"א", unit2: null, detailed: true },
  { id: 4,  name: "עמודים / תמיכות / רגליים",   group: "רכיבים נושאי עומס", imp: "veryHigh", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 5,  name: "צביעה וציפויי הגנה: מסבך/קורה/זיז", group: "רכיבי קיים והגנות", imp: "medium", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 6,  name: "צביעה וציפויי הגנה: עמודים/תמיכות/רגליים", group: "רכיבי קיים והגנות", imp: "medium", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 7,  name: "צביעה וציפויי הגנה: אלמנטים אחרים", group: "רכיבי קיים והגנות", imp: "low", unit: "מ\"א", unit2: null, detailed: true },
  { id: 8,  name: "מדרך גישה / סיפון",          group: "רכיבי גישה", imp: "high", unit: "מ\"א", unit2: null, detailed: true },
  { id: 9,  name: "סולם גישה",                  group: "רכיבי גישה", imp: "high", unit: "מ\"א", unit2: "[מ\"א]", detailed: true },
  { id: 10, name: "מעקות / מאחזי יד",           group: "רכיבי גישה", imp: "high", unit: "מ\"א", unit2: null, detailed: true },
  { id: 11, name: "מחברי בסיס",                 group: "מחברים", imp: "veryHigh", unit: "יח'", unit2: null, detailed: true },
  { id: 12, name: "מחברי מסבך / קורה / זיז",    group: "מחברים", imp: "veryHigh", unit: "יח'", unit2: null, detailed: true },
  { id: 13, name: "מחברי השילוט והסימון",       group: "מחברים", imp: "high",     unit: "יח'", unit2: null, detailed: true },
  { id: 14, name: "שילוט / סימון",              group: "רכיבי עזר", imp: null, unit: "יח'", unit2: "[מ\"ר]", detailed: false },
  { id: 15, name: "תאורה",                      group: "רכיבי עזר", imp: null, unit: "יח'", unit2: null, detailed: false },
  { id: 16, name: "מערכות ושירותים",            group: "רכיבי עזר", imp: null, unit: "מ\"א", unit2: null, detailed: true },
  { id: 17, name: "הגנת יסודות",                group: "רכיבי עזר", imp: null, unit: "מ\"ר", unit2: null, detailed: true },
];

// --- טבלה 4: רכיבי קירות תומכים, אקוסטיים וקיר תעלה בנויה (WAL) ---
const COMPONENTS_WAL = [
  { id: 1,    name: "יסודות (כולל תחתית תעלות בטון/נקז)", group: "רכיבים ראשיים", imp: "high",     unit: "מ\"א", unit2: "[מטר רוחב]", detailed: true },
  { id: 2.1,  name: "הקיר — רכיב ראשי (קיר תומך / דופן תעלה)", group: "רכיבים ראשיים", imp: "veryHigh", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 2.2,  name: "הקיר — רכיב ראשי (עמוד בקיר אקוסטי)", group: "רכיבים ראשיים", imp: "veryHigh", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 3,    name: "הקיר — רכיב משני (לוח אקוסטי / דופן תעלה שנייה)", group: "רכיבים ראשיים", imp: "veryHigh", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 4,    name: "קורות ראש / קורה מאספת", group: "רכיבים ראשיים", imp: "high",     unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 5,    name: "מחברי בסיס / מחברים",    group: "רכיבים ראשיים", imp: "veryHigh", unit: "יח'", unit2: null, detailed: true },
  { id: 6,    name: "נקזים (חורי ניקוז, פילטרים, ניקוז בגב הקיר)", group: "רכיבי קיים והגנות", imp: "medium", unit: "יח'", unit2: null, detailed: false },
  { id: 7,    name: "תפרים",                  group: "רכיבי קיים והגנות", imp: "medium", unit: "מ\"א", unit2: null, detailed: true },
  { id: 8,    name: "חיפוי/צביעה/ציפויי הגנה: קיר", group: "רכיבי קיים והגנות", imp: "medium", unit: "מ\"ר", unit2: null, detailed: false },
  { id: 9,    name: "חיפוי/צביעה/ציפויי הגנה: כרכובים ומעקות", group: "רכיבי קיים והגנות", imp: "medium", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: false },
  { id: 10,   name: "מעקות בטיחות / מעקות לה\"ר / כרכוב", group: "רכיבי בטיחות", imp: "high", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: false },
  { id: 11,   name: "מסלול — ראש הקיר",       group: "רכיבי בטיחות", imp: "low", unit: "מ\"ר", unit2: null, detailed: false },
  { id: 12,   name: "מסלול — בסיס הקיר",      group: "רכיבי בטיחות", imp: "low", unit: "מ\"ר", unit2: null, detailed: false },
  { id: 13,   name: "מדרכה/שוליים — ראש הקיר", group: "רכיבי בטיחות", imp: "low", unit: "מ\"ר", unit2: null, detailed: false },
  { id: 14,   name: "מדרכה/שוליים — בסיס הקיר", group: "רכיבי בטיחות", imp: "low", unit: "מ\"ר", unit2: null, detailed: false },
  { id: 15,   name: "סוללה/שטח בור — ראש הקיר", group: "רכיבים אחרים", imp: "low", unit: "מ\"ר", unit2: null, detailed: false },
  { id: 16,   name: "סוללה/שטח בור — בסיס הקיר", group: "רכיבים אחרים", imp: "low", unit: "מ\"ר", unit2: null, detailed: false },
  { id: 17,   name: "קרקעית הנחל / תחתית התעלה", group: "רכיבים אחרים", imp: "medium", unit: "מ\"ר", unit2: null, detailed: false },
  { id: 18,   name: "סינר הגנה / ריצוף הגנה / קיר תעלה נמוך", group: "רכיבים אחרים", imp: "medium", unit: "מ\"ר", unit2: null, detailed: false },
  { id: 19,   name: "מערכת עוגנים (עוגני קרקע/סלע, בורגי סלע)", group: "רכיבים ראשיים", imp: "veryHigh", unit: "יח'", unit2: null, detailed: true },
  { id: 20,   name: "שילוט",   group: "רכיבי עזר", imp: null, unit: "יח'", unit2: null, detailed: false },
  { id: 21,   name: "תאורה",   group: "רכיבי עזר", imp: null, unit: "יח'", unit2: null, detailed: false },
  { id: 22,   name: "מערכות שירותים המחוברות לקיר", group: "רכיבי עזר", imp: null, unit: "מ\"א", unit2: null, detailed: true },
];

// --- טבלה 5: רכיבי מנהרות (TUN) ---
const COMPONENTS_TUN = [
  { id: 1,  name: "רכיב ראשי (לפי סוג המנהרה)", group: "מבנה נושא", imp: "veryHigh", unit: "לפי סוג", unit2: null, detailed: true, dynamic: "main" },
  { id: 2,  name: "רכיבי משנה — תמיכות/מסגרות/קורות רוחביות (Invert/Ceiling Girder)", group: "מבנה נושא", imp: "veryHigh", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 3,  name: "רכיב משני (לפי סוג המנהרה)", group: "מבנה נושא", imp: "veryHigh", unit: "לפי סוג", unit2: null, detailed: true, dynamic: "secondary" },
  { id: 4,  name: "טבלת מיסעה תלויה (Slab invert / Structural Slab)", group: "מבנה נושא", imp: "veryHigh", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 5,  name: "מחברים / מתלים (מחוץ לגוף המנהרה)", group: "מבנה נושא", imp: "veryHigh", unit: "יח'", unit2: null, detailed: true },
  { id: 6,  name: "עוגנים (עוגני קרקע/סלע, בורגי סלע לתמיכת גוף המנהרה/פורטל/קירות כנף)", group: "מבנה נושא", imp: "veryHigh", unit: "יח'", unit2: null, detailed: true },
  { id: 7,  name: "טבלת רצפה מונחת", group: "מבנה נושא", imp: "high", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 8,  name: "עמודים / קירות / דיפון", group: "מבנה נושא", imp: "veryHigh", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 9,  name: "קורת ראש עמוד", group: "מבנה נושא", imp: "veryHigh", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 10, name: "יסוד / ראשי כלונסאות / כלונסאות", group: "מבנה נושא", imp: "high", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 11, name: "קיר פורטל", group: "מבנה נושא", imp: "high", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 12, name: "מחבר גוף מנהרה (בין מקטעים טרומיים)", group: "מבנה נושא", imp: "veryHigh", unit: "יח'", unit2: null, detailed: false },
  { id: 20, name: "נקזים (נקזים בגוף הקשת או בקירות הפורטל)", group: "רכיבי קיים והגנה", imp: "medium", unit: "יח'", unit2: null, detailed: false },
  { id: 21, name: "תעלת / צינור ניקוז (בתחום המנהרה)", group: "רכיבי קיים והגנה", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 22, name: "אטומים שונים (מערכת איטום, קירות פורטל, דיפון)", group: "רכיבי קיים והגנה", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 23, name: "תפרי התפשטות", group: "רכיבי קיים והגנה", imp: "medium", unit: "מ\"א", unit2: null, detailed: true },
  { id: 24, name: "צביעה וציפויי הגנה: גוף המנהרה", group: "רכיבי קיים והגנה", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 25, name: "צביעה וציפויי הגנה: מעקות בטיחות לרכב/מעקות לה\"ר", group: "רכיבי קיים והגנה", imp: "medium", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 30, name: "סולמות / מדרגות / שבילי גישה / מדרכות מילוט", group: "רכיבי בטיחות", imp: "medium", unit: "מ\"א", unit2: "[מ\"א]", detailed: true },
  { id: 31, name: "מעקות בטיחות לרכב / מעקות לה\"ר", group: "רכיבי בטיחות", imp: "high", unit: "מ\"א", unit2: "[מ\"א היקף]", detailed: true },
  { id: 32, name: "ציפויי מיסעה", group: "רכיבי בטיחות", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 33, name: "ציפויי פני מדרכות/שוליים/הגבהות/שבילי מילוט", group: "רכיבי בטיחות", imp: "low", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 40, name: "טבלת תקרה משנית (CEILING SLAB)", group: "רכיבים אחרים", imp: "high", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 41, name: "קירות / מחיצות פנימיות", group: "רכיבים אחרים", imp: "high", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 42, name: "קירות כנף", group: "רכיבים אחרים", imp: "high", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 43, name: "פתחי אוורור / גישות / ארובות / תעלות אוורור", group: "רכיבים אחרים", imp: "medium", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 44, name: "מדרונות משופעים מצופים", group: "רכיבים אחרים", imp: "low", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 45, name: "פני דופן סוללה / מדרון", group: "רכיבים אחרים", imp: "low", unit: "מ\"ר", unit2: null, detailed: true },
  { id: 50, name: "תעלת ניקוז מחוץ למנהרה", group: "רכיבי עזר", imp: null, unit: "מ\"ר", unit2: null, detailed: true },
  { id: 51, name: "אבני שפה", group: "רכיבי עזר", imp: null, unit: "מ\"א", unit2: null, detailed: false },
  { id: 52, name: "שילוט פנימי וחיצוני", group: "רכיבי עזר", imp: null, unit: "יח'", unit2: null, detailed: false },
  { id: 53, name: "מחברי מערכות וציוד", group: "רכיבי עזר", imp: null, unit: "יח'", unit2: null, detailed: true },
  { id: 56, name: "רכיבים מכאניים שונים (שערים, דלתות, מחסומים, תריסי אוורור)", group: "רכיבי עזר", imp: null, unit: "יח'", unit2: null, detailed: true },
  { id: 57, name: "מתקנים נושאים למערכות אחרות (בסיסים ומתקנים למשאבות, גנרטור)", group: "רכיבי עזר", imp: null, unit: "יח'", unit2: null, detailed: true },
  { id: 60, name: "אחר", group: "רכיבי עזר", imp: null, unit: "יח'", unit2: null, detailed: false },
];

const COMPONENT_CATALOGS = {
  BRG: COMPONENTS_BRG,
  CLV: COMPONENTS_BRG,
  SGR: COMPONENTS_SGR,
  WAL: COMPONENTS_WAL,
  TUN: COMPONENTS_TUN,
};

// ============================================================================
// טבלה 15: משמעויות מדירוג מצב המבנים הבודדים
// ============================================================================
const MEANING_AV = [
  { min: 90, name: "טוב מאוד", color: "#1a7f37", text: "המבנה במצב כללי \"טוב מאוד\"; ללא פגמים/נזקים משמעותיים ברכיבים; ייתכן כי קיימים פגמים מזעריים." },
  { min: 80, name: "טוב",      color: "#7fb069", text: "המבנה במצב כללי \"טוב\"; ייתכנו נזקים ו/או פגמים בטווח מזערי-בינוני ברכיב בודד או יותר; ייתכן כי רמת תפקוד נפגעה ברכיב בודד או יותר." },
  { min: 65, name: "סביר",     color: "#e6a817", text: "המבנה במצב כללי \"סביר\"; ייתכנו נזקים ו/או פגמים בטווח בינוני-חמור ברכיב בודד או יותר; ייתכן כי רמת התפקוד של רכיב בודד או יותר ירודה באופן משמעותי." },
  { min: 40, name: "ירוד",     color: "#e2711d", text: "המבנה במצב כללי \"ירוד\"; ייתכנו נזקים ו/או פגמים במצב חמור ברכיב בודד או יותר; ייתכן כי רמת התפקוד של רכיב בודד או יותר נפגעה באופן חמור או כשלה." },
  { min: 0,  name: "ירוד מאוד", color: "#c1121f", text: "המבנה במצב כללי \"ירוד מאוד\"; ייתכן כי המבנה אינו כשיר לשירות עקב כשל מרבית רכיבי המבנה; יש לשקול לסגור את המבנה לתנועה." },
];

const MEANING_CRIT = [
  { min: 94, name: "טוב מאוד", color: "#1a7f37", text: "ללא נזקים ו/או פגמים משמעותיים אך ייתכנו פגמים שטחיים; אין השפעה על התסבולת." },
  { min: 81, name: "טוב",      color: "#7fb069", text: "ייתכנו נזקים ו/או פגמים מזעריים; אין השפעה על התסבולת." },
  { min: 58, name: "סביר",     color: "#e6a817", text: "ייתכנו נזקים ו/או פגמים בטווח מזערי-בינוני ברכיבים; תיתכן השפעה מסוימת על התסבולת." },
  { min: 40, name: "ירוד",     color: "#e2711d", text: "ייתכנו נזקים ו/או פגמים בטווח בינוני-חמור; תיתכן פגיעה משמעותית בתסבולת או כשל של רכיב קריטי בודד או יותר; יש לשקול הטלת מגבלות על השימוש במבנה כגון: הגבלת עומס או סגירה לתנועה." },
  { min: 0,  name: "ירוד מאוד", color: "#c1121f", text: "ייתכנו נזקים חמורים מאוד; ייתכן כשל של רכיב קריטי אחד או יותר; יש לשקול לסגור את המבנה לתנועה." },
];

// ============================================================================
// טבלת תדירויות סקירה חוזרת (הנחיות לביצוע סקירה, סעיף 3.4)
// interval = מרווח מירבי בשנים; הסקירה חייבת להתבצע בתוך מרווח הקטן מהמצוין
// ============================================================================
const INSPECTION_FREQUENCIES = [
  { label: "גשרי מקטעים (כל הסוגים 1–6)", years: 2 },
  { label: "גשר סוג 1 (כל הסוגים 1.0–1.3)", years: 2 },
  { label: "גשר סוג 2", years: 2 },
  { label: "גשר סוג 3", years: 3 },
  { label: "גשר סוג 4 (כולל 4.1, 4.2)", years: 3 },
  { label: "גשר סוג 5", years: 3 },
  { label: "גשר סוג 6", years: 4 },
  { label: "מנהרות (כל הסוגים 1–4)", years: 3 },
  { label: "מובל סוג 1", years: 4 },
  { label: "מובל סוג 2", years: 5 },
  { label: "מובל סוג 3", years: 5 },
  { label: "מובל סוג 4", years: 5 },
  { label: "מובל סוג 5", years: 5 },
  { label: "גשרי שילוט (כל הסוגים 1–3)", years: 3 },
  { label: "קיר תומך סוג 1 (קירות מעוגנים)", years: 3 },
  { label: "קיר תומך סוג 2 (טרומי > 6 מ')", years: 4 },
  { label: "קיר תומך סוג 3 (טרומי ≤ 6 מ')", years: 5 },
  { label: "קיר תומך סוג 4 (יצוק > 4 מ')", years: 6 },
  { label: "קיר תומך סוג 5 (יצוק ≤ 4 מ')", years: 7 },
  { label: "קיר תומך סוג 6 (אחרים ומיוחדים)", years: 5 },
  { label: "קירות אקוסטיים (כל הסוגים 1–2)", years: 5 },
];
const DEFAULT_NEXT_INSPECTION_MONTHS = 24; // ברירת המחדל בטופס (סעיף 2.6.1)

// ============================================================================
// תעודת זהות לגשר ומובל — מהדורה 6-2008 (Bridge ID Cards)
// כל שדה: { code, label, type } — code הוא מספר הסעיף כפי שמופיע בעמודת
// "מספר." בטבלת הייחוס (לא תמיד זהה לקוד "0X.XX" המוצג לצידו). type
// ברירת מחדל "text"; "date" רק לשדות שמסומנים "תאריך" בטבלת הייחוס.
// שדות 1.1/1.2/2.1/4.1/10.1/10.2/13.1/13.2/13.3 נמשכים אוטומטית ואינם
// כאן — ר' renderIdCardAutoFields ב-render.js.
// ============================================================================
const ID_CARD_GROUPS = [
  {
    id: "general", label: "כללי",
    fields: [
      { code: "1.3", label: "סימון המבנה" },
      { code: "1.4", label: "תיאור כללי (מילולי)" },
      { code: "1.5", label: "מרחב" },
      { code: "1.7", label: 'ק"מ התחלה' },
      { code: "2.2", label: "קבוצת סווג משנית" },
      { code: "2.3", label: "סווג תפקוד תנועתי" },
      { code: "2.4", label: "סווג חירום" },
      { code: "2.5", label: "הוקם על ידי" },
      { code: "2.6", label: "בעלים" },
      { code: "2.7", label: "אחריות אחזקה" },
      { code: "2.8", label: "שייך לכביש אגרה" },
      { code: "2.9", label: "הובלות מיוחדות" },
      { code: "2.10", label: "ערך היסטורי" },
      { code: "2.11", label: "מבנה זמני" },
      { code: "2.12", label: "מנהל תחום סקירת גשרים", placeholder: 'ימולא ע"י מנהל תחום סקירת גשרים' },
    ],
  },
  {
    id: "service", label: "שירות",
    fields: [
      { code: "3.1", label: "שנת בניה" },
      { code: "3.2", label: "שנת שיקום אחרון" },
      { code: "3.3", label: "סוג שימוש" },
      { code: "3.3.1", label: "מספר הכביש/רמפה" },
      { code: "3.4", label: "שימוש משני מעל" },
      { code: "3.4.1", label: "מספר הכביש/רמפה (משני)" },
      { code: "3.5", label: 'מספר מסלולים ו/או מסילות רכבת מעל' },
      { code: "3.6", label: "מספר נתיבים מעל" },
      { code: "3.7", label: "כיוון תנועה מעל" },
      { code: "3.8", label: "שימוש עיקרי מתחת" },
      { code: "3.8.1", label: "מספר הכביש/רמפה (עיקרי) מתחת" },
      { code: "3.9", label: "שימוש משני מתחת" },
      { code: "3.9.1", label: "מספר הכביש/רמפה (משני) מתחת" },
      { code: "3.10", label: 'מספר מסלולים ו/או מסילות רכבת מתחת' },
      { code: "3.11", label: "מספר נתיבים מתחת" },
      { code: "3.12", label: "כיוון תנועה מתחת" },
      { code: "3.13", label: "נפח תנועה יומי AADT" },
      { code: "3.14", label: "שנת מדידת AADT אחרונה" },
      { code: "3.15", label: "נפח תנועה יומי - משאיות" },
      { code: "3.16", label: "מעקף בדרכים קיימות" },
      { code: "3.17", label: "אורך מעקף" },
      { code: "3.18", label: "תיאור תוואי מעקף מועדף (מילולי וגרפי)" },
      { code: "3.18-photo", displayCode: "3.18", label: "מעקף מקומי (תמונה)", type: "photo" },
      { code: "3.19", label: "מעקף מקומי" },
      { code: "3.20", label: "שיטת ביצוע מעקף מקומי" },
      { code: "3.22", label: "מתכנן שיקום/הרחבה" },
    ],
  },
  {
    id: "geometry", label: "נתונים גיאומטריים",
    fields: [
      { code: "4.2", label: "אורך מפתח מרבי" },
      { code: "4.3", label: "אורך מבנה כללי" },
      { code: "4.4", label: "אורך ימין" },
      { code: "4.5", label: "אורך שמאל" },
      { code: "4.6", label: "חלוקת מפתחים" },
      { code: "4.7", label: "שינוי רוחב קיים" },
      { code: "4.8", label: 'רוחב חיצוני מינימלי ניצב לציר הדרך (לגשרים בלבד)' },
      { code: "4.9", label: 'רוחב חיצוני מכסימלי ניצב לציר הדרך (לגשרים בלבד)' },
      { code: "4.10", label: "רוחב חיצוני מכסימלי" },
      { code: "4.11", label: "רוחב חיצוני מינימלי" },
      { code: "4.12", label: "רוחב הגבהות ומדרכות (1)" },
      { code: "4.13", label: "רוחב הגבהות ומדרכות (2)" },
      { code: "4.14", label: "רוחב מסלול מינימלי (בין הגבהות)" },
      { code: "4.15", label: "רוחב מסלול כולל (מהגבהה להגבהה)" },
      { code: "4.16", label: "סוג מפרדה" },
      { code: "4.17", label: "זווית ייחוס (Skew)" },
      { code: "4.18", label: "מרווח אנכי חופשי מינימלי" },
      { code: "4.19", label: "מרווח אנכי חופשי" },
      { code: "4.20", label: "מרווח אנכי חופשי מינימלי (2)" },
      { code: "4.21", label: "שילוט מגבלת גובה" },
      { code: "4.22", label: "מרווח אופקי מינימלי" },
      { code: "4.23", label: "גובה נציב מכסימלי" },
      { code: "4.29", label: "שטח מיסעה" },
    ],
  },
  {
    id: "classification", label: "סיווגים",
    fields: [
      { code: "5.1", label: "מספר סוגי מבנה עליון/מיסעה/תקרה" },
      { code: "5.2", label: "סיווג מבנה עליון/מיסעה/תקרה" },
      { code: "5.3", label: "סיווג רצפה" },
      { code: "5.4", label: "סיווג נציב/קיר קצה (1)" },
      { code: "5.5", label: "סיווג נציב/קיר קצה (2)" },
      { code: "5.6", label: "מספר סוגי נציבי ביניים" },
      { code: "5.7", label: "סיווג נציבי ביניים" },
      { code: "5.8", label: "סוג דריכה" },
      { code: "5.9", label: "סוג סמכים" },
      { code: "5.10", label: "סוג תפרים" },
      { code: "6.1", label: "חומר טבלת מיסעה/תקרה" },
      { code: "6.2", label: "חומר קורות/ארגז במיסעה" },
      { code: "6.3", label: "חומר נציבי קצה/קירות" },
      { code: "6.4", label: "חומר נציבי ביניים" },
      { code: "6.5", label: "חומר הגנת מדרונות" },
      { code: "6.6", label: "חומר מעקה לרכב/משולב" },
      { code: "6.7", label: "חומר מעקה להולכי רגל" },
      { code: "6.8", label: "חומר חיפוי מיסעה" },
      { code: "6.9", label: "חומר איטום מיסעה" },
      { code: "6.10", label: "חומר כרכובים" },
    ],
  },
  {
    id: "infra", label: "הערכה תשתית",
    fields: [
      { code: "7.1", label: "שיטת דירוג עומסים" },
      { code: "7.2", label: "דירוג עומסים בפועל" },
      { code: "7.3", label: "תאריך דירוג עומסים אחרון", type: "date" },
      { code: "7.4", label: "שיטת דירוג עומס סיסמי" },
      { code: "7.5", label: "דירוג עומס סיסמי" },
      { code: "7.6", label: "תאריך דירוג עומס סיסמי", type: "date" },
      { code: "7.7", label: "מיגבלות מאושרות" },
      { code: "7.8", label: "שילוט הגבלת עומס" },
      { code: "8.1", label: "סוג תשתית קיים" },
      { code: "9.1", label: "מפלס יחסי מתוכנן מירבי" },
      { code: "9.2", label: "תקופת חזרה הידראולית" },
      { code: "9.3", label: "התאמה הידראולית" },
    ],
  },
  {
    id: "indices", label: "מדדי מצב וסקירות",
    fields: [
      { code: "11.1", label: "ערך הסמן Availability PI" },
      { code: "12.1", label: "ערך הסמן Reliability PI" },
      { code: "13.5", label: "סקירה לבקרת נזקים", type: "date" },
      { code: "13.6", label: "סקירה תת מימית", type: "date" },
      { code: "13.7", label: "סקירה מעמיקה", type: "date" },
      { code: "13.8", label: "סקירה מיוחדת אחרת", type: "date" },
    ],
  },
];

// export ל-node (בדיקות) — בדפדפן המשתנים גלובליים
if (typeof module !== "undefined") {
  module.exports = {
    EXTENT, IMPORTANCE, SEVERITY_GENERIC, STRUCTURE_CLASSES,
    SUPERSTRUCTURE_TYPES, TUNNEL_TYPES, COMPONENT_CATALOGS,
    COMPONENTS_BRG, COMPONENTS_SGR, COMPONENTS_WAL, COMPONENTS_TUN,
    MEANING_AV, MEANING_CRIT, INSPECTION_FREQUENCIES, DEFAULT_NEXT_INSPECTION_MONTHS,
    ID_CARD_GROUPS, REQUIRED_FINDINGS_BY_CLASS,
  };
}
