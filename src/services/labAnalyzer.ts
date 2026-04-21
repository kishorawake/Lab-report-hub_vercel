/**
 * Lab Report Analysis Pipeline
 * HIPAA-aligned: No PHI is stored or logged. Only de-identified structured data is retained.
 */

import { normalRanges, classifyTest, type TestStatus } from "./normalRanges";
import { deidentifyText } from "./deidentify";

export interface LabTest {
  name: string;
  value: number;
  rawValue: string;
  unit: string;
  normalRange: string;
  status: TestStatus;
  panel: string;
}

export interface PanelSummary {
  name: string;
  tests: LabTest[];
  normalCount: number;
  totalCount: number;
  abnormalCount: number;
}

export interface AnalysisResult {
  tests: LabTest[];
  panels: PanelSummary[];
  totalTests: number;
  normalTests: number;
  abnormalTests: number;
  healthScore: number;
  healthGrade: string;
  overallSummary: string;
  abnormalFindings: AbnormalFinding[];
  practicalAdvice: string[];
  recommendedActions: RecommendedAction[];
  whenToConsultDoctor: string;
  talkingPoints: string[];
}

export interface ClinicalReference {
  label: string;
  url: string;
  source: string;
}

export interface AbnormalFinding {
  testName: string;
  status: TestStatus;
  explanation: string;
  possibleCauses: string[];
  consequences: string[];
  reductionTips: string[];
  references: ClinicalReference[];
}

export interface RecommendedAction {
  step: number;
  title: string;
  description: string;
}

// Synonyms map common report wording to canonical keys in normalRanges.
const synonyms: Record<string, string> = {
  "hgb": "Hemoglobin", "hb": "Hemoglobin", "haemoglobin": "Hemoglobin", "hemoglobin": "Hemoglobin",
  "wbc": "WBC Count", "tlc": "WBC Count", "total leukocyte count": "WBC Count",
  "leukocytes": "WBC Count", "white blood cell": "WBC Count", "white blood cells": "WBC Count",
  "rbc": "RBC Count", "erythrocytes": "RBC Count", "red blood cell": "RBC Count", "red blood cells": "RBC Count",
  "hct": "Hematocrit", "pcv": "Hematocrit", "haematocrit": "Hematocrit",
  "plt": "Platelet Count", "platelets": "Platelet Count", "platelet": "Platelet Count",
  "ast": "SGOT (AST)", "sgot": "SGOT (AST)", "aspartate aminotransferase": "SGOT (AST)",
  "alt": "SGPT (ALT)", "sgpt": "SGPT (ALT)", "alanine aminotransferase": "SGPT (ALT)",
  "alp": "Alkaline Phosphatase", "alk phos": "Alkaline Phosphatase",
  "creatinine": "Serum Creatinine", "serum creatinine": "Serum Creatinine",
  "urea": "Blood Urea", "blood urea nitrogen": "BUN",
  "glucose fasting": "Fasting Blood Sugar", "fbs": "Fasting Blood Sugar",
  "fasting glucose": "Fasting Blood Sugar", "fasting blood glucose": "Fasting Blood Sugar",
  "rbs": "Random Blood Sugar", "random glucose": "Random Blood Sugar", "random blood glucose": "Random Blood Sugar",
  "ppbs": "Post Prandial Blood Sugar", "post prandial glucose": "Post Prandial Blood Sugar",
  "post prandial blood glucose": "Post Prandial Blood Sugar",
  "hba1c": "HbA1c", "hb a1c": "HbA1c", "glycated hemoglobin": "HbA1c", "glycated haemoglobin": "HbA1c",
  "a1c": "HbA1c", "glycosylated hemoglobin": "HbA1c", "glycosylated haemoglobin": "HbA1c",
  "estimated average glucose": "Estimated Average Glucose", "eag": "Estimated Average Glucose",
  "cholesterol total": "Total Cholesterol", "total cholesterol": "Total Cholesterol",
  "tg": "Triglycerides", "triglyceride": "Triglycerides",
  "hdl": "HDL Cholesterol", "ldl": "LDL Cholesterol", "vldl": "VLDL Cholesterol",
  "non-hdl": "Non-HDL Cholesterol", "non hdl": "Non-HDL Cholesterol",
  "na": "Sodium", "k": "Potassium", "cl": "Chloride", "ca": "Calcium",
  "vit b12": "Vitamin B12", "b12": "Vitamin B12", "cyanocobalamin": "Vitamin B12",
  "vit d": "Vitamin D", "25-oh vitamin d": "Vitamin D", "25 hydroxy vitamin d": "Vitamin D",
  "25(oh)d": "Vitamin D", "vitamin d3": "Vitamin D",
  "c-reactive protein": "CRP", "c reactive protein": "CRP", "hs-crp": "CRP",
  "tsh": "TSH", "thyroid stimulating hormone": "TSH",
  "free t3": "Free T3", "ft3": "Free T3",
  "free t4": "Free T4", "ft4": "Free T4",
  "ggt": "GGT", "gamma gt": "GGT", "gamma-glutamyl transferase": "GGT",
  "egfr": "eGFR",
  "mg": "Magnesium", "phos": "Phosphorus",
  "ldh": "LDH", "lactate dehydrogenase": "LDH",
};

// Lines that look like noise / wouldn't contain real test values
const noisePatterns = [
  /\bvisit date\b/i, /\bregistered on\b/i, /\bcollected on\b/i, /\breported on\b/i,
  /\binterpretation\b/i, /\bremark\b/i, /\bbiological reference\b/i,
  /^page\s+\d+\s+of\s+\d+/i, /\bvid no\b/i, /\bpid no\b/i, /\bphone\b/i, /\bcontact\b/i,
  /\bpin code\b/i, /\baddress\b/i, /\baadhaar\b/i,
];

const datePattern = /\b\d{1,2}[-/](?:[A-Za-z]{3}|\d{1,2})[-/]\d{2,4}\b/g;

// ── Dynamic panel section detection ──
// Map common report headers to a normalized panel name. Anything not in this
// list still becomes a panel, but uses the verbatim header for display.
const panelHeaderPatterns: Array<{ re: RegExp; panel: string }> = [
  { re: /\b(complete blood count|cbc|haemogram|hemogram)\b/i, panel: "Blood Health (Complete Blood Count)" },
  { re: /\b(liver function test|lft)\b/i, panel: "Liver Health" },
  { re: /\b(renal function test|kidney function|rft|kft)\b/i, panel: "Kidney Function" },
  { re: /\b(lipid profile|lipid panel)\b/i, panel: "Lipid Profile" },
  { re: /\belectrolytes\b/i, panel: "Electrolytes" },
  { re: /\b(thyroid|tsh.*panel|t3.*t4)\b/i, panel: "Thyroid Function" },
  { re: /\b(blood (sugar|glucose)|glycosylated|hba1c|ghb)\b/i, panel: "Blood Sugar" },
  { re: /\b(urine routine|urinalysis|urine examination)\b/i, panel: "Urine Routine" },
  { re: /\b(esr|erythrocyte sedimentation|crp|inflammation)\b/i, panel: "Inflammation" },
  { re: /\b(iron|ferritin|anemia profile|anaemia)\b/i, panel: "Anemia Profile" },
  { re: /\b(vitamin|mineral)\b/i, panel: "Vitamins & Minerals" },
  { re: /\b(coagulation|pt.*aptt|inr)\b/i, panel: "Coagulation" },
  { re: /\b(amylase|lipase|pancreas)\b/i, panel: "Pancreatic Function" },
  { re: /\b(serology|hbsag|hiv|hepatitis|widal|dengue|malaria)\b/i, panel: "Serology & Infections" },
  { re: /\b(cotinine|nicotine|tobacco)\b/i, panel: "Lifestyle Markers" },
];

function normalizePanelName(headerText: string): string {
  for (const { re, panel } of panelHeaderPatterns) {
    if (re.test(headerText)) return panel;
  }
  // Fall back to a cleaned-up header (title case).
  return headerText
    .replace(/[^A-Za-z0-9& ()/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// Parse a free-text reference range like "0 - 6.5", "< 100", ">40", "Male (0.7 - 1.3)"
// and a value to determine status. Returns null if range can't be parsed.
function classifyAgainstInlineRange(value: number, rangeText: string): TestStatus | null {
  if (!rangeText) return null;
  const t = rangeText.replace(/Female[^()]*\([^)]*\)/i, " ").replace(/Male\s*/i, " ");
  // < N or <= N
  let m = t.match(/<\s*=?\s*(-?\d+(?:\.\d+)?)/);
  if (m && !/-/.test(t.replace(m[0], ""))) {
    const hi = parseFloat(m[1]);
    if (value <= hi) return "normal";
    const diff = (value - hi) / hi;
    return diff > 0.5 ? "critical_high" : "slightly_high";
  }
  // > N or >= N
  m = t.match(/>\s*=?\s*(-?\d+(?:\.\d+)?)/);
  if (m && !/-/.test(t.replace(m[0], ""))) {
    const lo = parseFloat(m[1]);
    if (value >= lo) return "normal";
    const diff = (lo - value) / lo;
    return diff > 0.5 ? "critical_low" : "slightly_low";
  }
  // N - M  (allow "N to M")
  m = t.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/);
  if (m) {
    const lo = parseFloat(m[1]);
    const hi = parseFloat(m[2]);
    if (value >= lo && value <= hi) return "normal";
    if (value < lo) {
      const diff = (lo - value) / Math.max(lo, 0.0001);
      return diff > 0.3 ? "critical_low" : "slightly_low";
    }
    const diff = (value - hi) / Math.max(hi, 0.0001);
    return diff > 0.3 ? "critical_high" : "slightly_high";
  }
  return null;
}

// Lines that look like section/page chrome and shouldn't be treated as test rows.
const tableNoise = [
  /test description|value\(s\)|reference range|biological reference|investigation|observed value/i,
  /^end of report|^\*\*end/i,
  /authenticity check|signature|reg ?no/i,
  /patient name|age\s*\/\s*gender|reporting date|collection date|referral|sample type|method:/i,
  /^page \d+|^iso \d+|home sample|moryapathlab|metropolis/i,
  /^\s*$/,
];

// Extract every (testName, value, unit, range) row found anywhere in the text,
// regardless of whether the test appears in our normalRanges dictionary.
// This is what gives us "dynamic discovery" of panels and tests.
function extractDynamicRows(rawText: string): Array<{
  name: string; value: number; rawValue: string; unit: string;
  normalRange: string; status: TestStatus; panel: string;
}> {
  const out: Array<{
    name: string; value: number; rawValue: string; unit: string;
    normalRange: string; status: TestStatus; panel: string;
  }> = [];

  const lines = rawText.split(/\r?\n/).map((l) => l.replace(/\u00A0/g, " ").trim());
  let currentPanel = "General";

  // Detect headers by looking for lines that are either ALL CAPS title-like
  // or that match a known panel pattern.
  const isHeader = (l: string): string | null => {
    if (!l || l.length > 80) return null;
    if (tableNoise.some((re) => re.test(l))) return null;
    if (/^[A-Z][A-Z &()/.,'-]{4,}$/.test(l) && !/\d/.test(l)) return l;
    for (const { re } of panelHeaderPatterns) if (re.test(l)) return l;
    return null;
  };

  // Match "Name  value  unit  range" on a single line. Allow the value to be
  // either numeric or a short qualitative word (we keep numeric only here).
  // Examples:
  //   "Hemoglobin    14.2    gms/dl    13 - 17"
  //   "Total Cholesterol  168.9  mg/dl  Desirable : < 200"
  //   "URIC ACID  4.3  mg/dl  3.5 - 7.2"
  //   "BUN  31.9  mg/dl  20 - 40"
  const rowRe = /^([A-Za-z][A-Za-z0-9 .,'()/+\-]{1,55}?)\s{2,}(<?>?=?\s*-?\d+(?:[.,]\d+)?)\s*([A-Za-z%/µ\u00B5²³.\-]{0,15})?\s*(.{0,80})?$/;

  for (const line of lines) {
    const headerMatch = isHeader(line);
    if (headerMatch) {
      currentPanel = normalizePanelName(headerMatch);
      continue;
    }
    if (tableNoise.some((re) => re.test(line))) continue;

    const m = rowRe.exec(line);
    if (!m) continue;
    const rawName = m[1].trim();
    if (rawName.length < 2) continue;
    if (/^(date|page|name|age|gender|method|sample|note|remark|interpretation|reference|range)$/i.test(rawName)) continue;
    const valueStr = m[2].replace(/[<>=\s]/g, "").replace(",", ".");
    const v = parseFloat(valueStr);
    if (!isFinite(v)) continue;
    // Skip absurd values that are likely page numbers / IDs.
    if (Math.abs(v) > 10_000_000) continue;
    const unit = (m[3] || "").trim();
    const rangeText = (m[4] || "").trim();

    // Try classifying against the inline reference range.
    const status: TestStatus = classifyAgainstInlineRange(v, rangeText) ?? "normal";

    // Cleaned display name (Title Case).
    const cleanName = rawName
      .replace(/\b([A-Z]{2,})\b/g, (s) => s[0] + s.slice(1).toLowerCase())
      .replace(/\s+/g, " ");

    out.push({
      name: cleanName,
      value: v,
      rawValue: unit ? `${v} ${unit}` : `${v}`,
      unit,
      normalRange: rangeText || "—",
      status,
      panel: currentPanel,
    });
  }
  return out;
}

// Parse text using a proximity window: find each test name occurrence, then
// look ahead in a small window for the first plausible numeric value while
// skipping dates, reference range bounds, and list markers.
function extractTestsFromText(text: string): LabTest[] {
  const tests: LabTest[] = [];
  const seen = new Set<string>();

  const cleaned = text
    .replace(/\u00A0/g, " ")
    .replace(datePattern, " ")
    .replace(/[ \t]+/g, " ");

  const compact = cleaned
    .split(/\r?\n/)
    .filter((l) => !noisePatterns.some((re) => re.test(l)))
    .join(" \n ");

  const candidates: { token: string; canonical: string }[] = [];
  for (const k of Object.keys(normalRanges)) candidates.push({ token: k.toLowerCase(), canonical: k });
  for (const [syn, canon] of Object.entries(synonyms)) candidates.push({ token: syn.toLowerCase(), canonical: canon });
  candidates.sort((a, b) => b.token.length - a.token.length);

  // ── Primary path: per-line table-row parser ──
  // Many lab PDFs print "Test Name   value   unit   range" on one line.
  // Coordinate-based extraction preserves these. Match aggressively.
  const rawLines = cleaned.split(/\r?\n/);
  for (const line of rawLines) {
    if (!line || line.length > 240) continue;
    if (noisePatterns.some((re) => re.test(line))) continue;
    const lowerLine = line.toLowerCase();
    for (const { token, canonical } of candidates) {
      if (seen.has(canonical)) continue;
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const nameRe = new RegExp(`(?:^|[^a-z0-9])${escaped}(?![a-z0-9])`, "i");
      const m = nameRe.exec(lowerLine);
      if (!m) continue;
      // Look at everything after the matched test name on the same line.
      const after = line.slice(m.index + m[0].length);
      // Strip parenthetical method qualifiers like "(HPLC)" or "(EDTA Whole Blood)".
      const noParens = after.replace(/\([^)]{1,40}\)/g, " ");
      // First standalone number that isn't a date fragment or a range bound.
      const numMatch = /(?:^|[^a-z0-9<>=≤≥-])(-?\d+(?:[.,]\d{1,3})?)(?![a-z0-9.])/i.exec(noParens);
      if (!numMatch) continue;
      const numStr = numMatch[1];
      // Reject if number is part of a range like "5.7-6.4" right after.
      const idxNum = noParens.indexOf(numStr, numMatch.index);
      const tail = noParens.slice(idxNum + numStr.length, idxNum + numStr.length + 4);
      if (/^\s*[-–]\s*\d/.test(tail)) continue;
      const v = parseFloat(numStr.replace(",", "."));
      if (!isFinite(v)) continue;
      const range = normalRanges[canonical];
      if (!range) continue;
      const lo = Math.max(0, range.min * 0.05);
      const hi = Math.max(range.max * 8, (range.criticalHigh ?? range.max) * 2, range.max + 50);
      if (v < lo || v > hi) continue;
      const { status } = classifyTest(canonical, v);
      tests.push({
        name: canonical,
        value: v,
        rawValue: `${v} ${range.unit}`.trim(),
        unit: range.unit,
        normalRange: `${range.min} - ${range.max} ${range.unit}`.trim(),
        status,
        panel: range.panel,
      });
      seen.add(canonical);
      break;
    }
  }

  // ── Fallback: proximity-window scan for tests not found per-line ──
  const lower = compact.toLowerCase();

  for (const { token, canonical } of candidates) {
    if (seen.has(canonical)) continue;
    const range = normalRanges[canonical];
    if (!range) continue;

    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordRe = new RegExp(`(?:^|[^a-z0-9])${escaped}(?![a-z0-9])`, "gi");

    // Plausibility bounds: a real value should be in the ballpark of the
    // reference range (allow up to 5x max, and >= 0.1x min, or simply <= criticalHigh*1.5).
    const lo = Math.max(0, range.min * 0.1);
    const hi = Math.max(range.max * 5, (range.criticalHigh ?? range.max) * 1.5, range.max + 10);

    let chosen: number | null = null;
    let m: RegExpExecArray | null;
    outer: while ((m = wordRe.exec(lower)) !== null) {
      const start = m.index + m[0].length;
      const window = compact.slice(start, start + 260);

      // Number must be a standalone token (not embedded in identifier like "HbA1c").
      const numRe = /(?:^|[^a-z0-9])(-?\d+(?:[.,]\d+)?)(?![a-z0-9])/gi;
      let nm: RegExpExecArray | null;
      while ((nm = numRe.exec(window)) !== null) {
        const numStart = nm.index + nm[0].length - nm[1].length;
        const before = window.slice(Math.max(0, numStart - 3), numStart);
        const after = window.slice(numStart + nm[1].length, numStart + nm[1].length + 3);
        const upToHere = window.slice(0, numStart);
        const opens = (upToHere.match(/\(/g) || []).length;
        const closes = (upToHere.match(/\)/g) || []).length;
        if (opens > closes) continue;
        if (/[<>=]\s*$/.test(before)) continue;
        if (/^\s*[-–]\s*\d/.test(after)) continue;
        if (/\d\s*[-–]\s*$/.test(before)) continue;
        const v = parseFloat(nm[1].replace(",", "."));
        if (!isFinite(v)) continue;
        if (/^[.)]/.test(after) && v < 10 && Number.isInteger(v)) continue;
        if (v < lo || v > hi) continue;
        chosen = v;
        break outer;
      }
    }

    if (chosen === null) continue;

    const { status } = classifyTest(canonical, chosen);
    tests.push({
      name: canonical,
      value: chosen,
      rawValue: `${chosen} ${range.unit}`.trim(),
      unit: range.unit,
      normalRange: `${range.min} - ${range.max} ${range.unit}`.trim(),
      status,
      panel: range.panel,
    });
    seen.add(canonical);
  }

  return tests;
}

// Generate panels from test list
function groupIntoPanels(tests: LabTest[]): PanelSummary[] {
  const panelMap = new Map<string, LabTest[]>();

  for (const test of tests) {
    const existing = panelMap.get(test.panel) || [];
    existing.push(test);
    panelMap.set(test.panel, existing);
  }

  return Array.from(panelMap.entries()).map(([name, panelTests]) => ({
    name,
    tests: panelTests,
    normalCount: panelTests.filter((t) => t.status === "normal").length,
    totalCount: panelTests.length,
    abnormalCount: panelTests.filter((t) => t.status !== "normal").length,
  }));
}

// Health score calculation
function calculateHealthScore(tests: LabTest[]): { score: number; grade: string } {
  if (tests.length === 0) return { score: 0, grade: "N/A" };

  // Each test starts at full points. Abnormal tests lose points proportionally.
  // slightly off = 50% of that test's contribution, critical = 100% penalty
  let totalScore = 0;
  for (const test of tests) {
    switch (test.status) {
      case "normal":
        totalScore += 1;
        break;
      case "slightly_low":
      case "slightly_high":
        totalScore += 0.5;
        break;
      case "critical_low":
      case "critical_high":
        totalScore += 0;
        break;
    }
  }

  const score = Math.max(0, Math.min(100, Math.round((totalScore / tests.length) * 100)));

  let grade: string;
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";
  else grade = "F";

  return { score, grade };
}

// Clinical correlation data for abnormal findings
interface ClinicalCorrelation {
  explanation: string;
  possibleCauses: string[];
  consequences: string[];
  reductionTips: string[];
}

const clinicalData: Record<string, Record<string, ClinicalCorrelation>> = {
  "MCH": {
    slightly_low: {
      explanation: "MCH measures the average hemoglobin per red blood cell. Yours is slightly below normal, suggesting smaller or paler red blood cells.",
      possibleCauses: ["Iron deficiency (most common)", "Chronic disease or inflammation", "Thalassemia trait (genetic)", "Vitamin B6 deficiency"],
      consequences: ["Mild fatigue and reduced exercise tolerance", "Can progress to iron-deficiency anemia if untreated", "May indicate underlying nutrient absorption issues"],
      reductionTips: ["Eat iron-rich foods: red meat, spinach, lentils, fortified cereals", "Pair iron foods with vitamin C (citrus, bell peppers) for better absorption", "Avoid tea/coffee with meals as they block iron absorption", "Consider iron supplements after consulting your doctor"],
    },
    critical_low: {
      explanation: "Your MCH is critically low, indicating severe hemoglobin deficiency in red blood cells requiring immediate attention.",
      possibleCauses: ["Severe iron deficiency anemia", "Thalassemia", "Lead poisoning", "Chronic blood loss"],
      consequences: ["Severe fatigue and weakness", "Shortness of breath", "Heart palpitations", "Organ damage from poor oxygen delivery"],
      reductionTips: ["Seek immediate medical care", "Iron infusion therapy may be needed", "Get tested for underlying causes like GI bleeding", "Follow up with a hematologist"],
    },
  },
  "MCHC": {
    slightly_low: {
      explanation: "MCHC measures hemoglobin concentration in red blood cells. A low value means your cells carry less oxygen than ideal.",
      possibleCauses: ["Iron deficiency", "Chronic inflammation", "Early-stage anemia", "Vitamin deficiency (B12, folate)"],
      consequences: ["Reduced oxygen delivery to tissues", "Fatigue and pallor", "May worsen if iron stores continue to deplete"],
      reductionTips: ["Increase dietary iron: beef liver, shellfish, beans, dark leafy greens", "Take vitamin C with meals to enhance iron absorption", "Get ferritin levels checked to assess iron stores", "Avoid calcium supplements with iron-rich meals"],
    },
    critical_low: {
      explanation: "Your MCHC is critically low, indicating severe hemoglobin concentration issues in your red blood cells.",
      possibleCauses: ["Severe iron deficiency", "Thalassemia", "Sideroblastic anemia", "Chronic disease"],
      consequences: ["Severe tissue hypoxia", "Cardiac stress", "Organ dysfunction"],
      reductionTips: ["Urgent medical evaluation needed", "Possible blood transfusion", "Iron infusion therapy", "Treat underlying cause"],
    },
  },
  "Neutrophils": {
    slightly_high: {
      explanation: "Neutrophils are your body's first-line infection fighters. A slight elevation often indicates your immune system is actively responding.",
      possibleCauses: ["Bacterial infection (most common)", "Physical or emotional stress", "Smoking", "Intense exercise", "Certain medications (corticosteroids)"],
      consequences: ["Usually temporary and self-resolving", "May indicate subclinical infection", "Chronic elevation linked to cardiovascular risk"],
      reductionTips: ["Address any underlying infection with your doctor", "Manage stress through meditation, yoga, or deep breathing", "If you smoke, consider a cessation program", "Stay hydrated and get adequate sleep"],
    },
  },
  "HbA1c": {
    slightly_high: {
      explanation: "HbA1c reflects your average blood sugar over 2-3 months. A slight elevation suggests pre-diabetes or early glucose intolerance.",
      possibleCauses: ["Insulin resistance (pre-diabetes)", "High carbohydrate diet", "Sedentary lifestyle", "Family history of diabetes", "Excess body weight"],
      consequences: ["Progression to Type 2 diabetes if untreated", "Increased risk of heart disease", "Nerve damage over time", "Kidney and eye complications"],
      reductionTips: ["Reduce refined carbs and sugary drinks", "Walk 30 minutes after meals to lower glucose spikes", "Increase fiber intake (vegetables, whole grains, legumes)", "Aim for 7-8 hours of quality sleep", "Lose 5-7% body weight if overweight"],
    },
    critical_high: {
      explanation: "Your HbA1c is critically high, indicating poorly controlled diabetes with sustained high blood sugar for months.",
      possibleCauses: ["Uncontrolled Type 2 diabetes", "Undiagnosed Type 1 diabetes", "Medication non-compliance", "Severe insulin resistance"],
      consequences: ["Diabetic ketoacidosis risk", "Accelerated nerve damage (neuropathy)", "Kidney failure (nephropathy)", "Vision loss (retinopathy)", "Cardiovascular disease", "Poor wound healing and infection risk"],
      reductionTips: ["Seek immediate medical care for medication adjustment", "Monitor blood sugar multiple times daily", "Follow a strict low-glycemic diet", "Start or intensify insulin therapy as directed", "Regular exercise (consult doctor first)", "Check feet daily for wounds"],
    },
  },
  "Random Blood Sugar": {
    slightly_high: {
      explanation: "Your random blood sugar is slightly elevated, which could be post-meal or indicate early glucose regulation issues.",
      possibleCauses: ["Recent carbohydrate-heavy meal", "Stress response (cortisol)", "Early insulin resistance", "Certain medications"],
      consequences: ["May indicate pre-diabetes", "Increased cardiovascular risk", "Can damage blood vessels over time"],
      reductionTips: ["Retest fasting glucose for confirmation", "Reduce portion sizes of starchy foods", "Add protein and healthy fats to every meal", "Walk for 15-20 minutes after eating"],
    },
    critical_high: {
      explanation: "Your blood sugar is dangerously elevated. This is a medical emergency requiring immediate intervention.",
      possibleCauses: ["Uncontrolled diabetes", "Diabetic ketoacidosis", "Severe infection", "Pancreatic dysfunction"],
      consequences: ["Diabetic coma risk", "Organ damage", "Dehydration", "Life-threatening electrolyte imbalances"],
      reductionTips: ["Go to the emergency room immediately", "Do not attempt to self-treat", "Bring these lab results with you", "You may need IV insulin and fluids"],
    },
  },
  "LDL Cholesterol": {
    slightly_high: {
      explanation: "LDL ('bad' cholesterol) carries cholesterol to arteries. Elevated levels build plaque in blood vessels over time.",
      possibleCauses: ["Diet high in saturated/trans fats", "Genetic factors (familial hypercholesterolemia)", "Sedentary lifestyle", "Obesity", "Hypothyroidism"],
      consequences: ["Atherosclerosis (artery hardening)", "Increased heart attack risk", "Stroke risk", "Peripheral artery disease"],
      reductionTips: ["Replace saturated fats with olive oil, nuts, avocados", "Eat more soluble fiber: oats, beans, apples, citrus", "Exercise 150+ minutes per week", "Add omega-3 rich fish (salmon, mackerel) 2x/week", "Consider plant sterols/stanols supplements"],
    },
    critical_high: {
      explanation: "Your LDL is dangerously high, significantly accelerating cardiovascular disease risk.",
      possibleCauses: ["Familial hypercholesterolemia", "Severe dietary imbalance", "Untreated hypothyroidism", "Nephrotic syndrome"],
      consequences: ["Rapid plaque buildup", "High heart attack and stroke risk", "Peripheral vascular disease"],
      reductionTips: ["Medication (statins) likely needed — see your doctor", "Strict dietary changes immediately", "Daily cardiovascular exercise", "Get tested for genetic cholesterol disorders"],
    },
  },
  "Non-HDL Cholesterol": {
    slightly_high: {
      explanation: "Non-HDL cholesterol includes all 'bad' cholesterol types. It's a comprehensive marker of cardiovascular risk.",
      possibleCauses: ["High LDL and/or VLDL cholesterol", "High triglycerides", "Poor diet", "Metabolic syndrome"],
      consequences: ["Atherosclerosis progression", "Increased cardiovascular event risk", "Correlates with insulin resistance"],
      reductionTips: ["Follow a Mediterranean-style diet", "Increase physical activity", "Limit alcohol intake", "Maintain healthy body weight", "Reduce processed food consumption"],
    },
  },
  "Alkaline Phosphatase": {
    slightly_high: {
      explanation: "ALP is an enzyme in liver and bones. Slight elevation may reflect liver stress, bone turnover, or even recent exercise.",
      possibleCauses: ["Liver congestion or fatty liver", "Bone healing or growth", "Vitamin D deficiency", "Certain medications", "Bile duct obstruction"],
      consequences: ["May indicate early liver disease", "Could suggest bone metabolism issues", "Usually benign if isolated"],
      reductionTips: ["Get liver function fully evaluated (GGT, bilirubin)", "Check vitamin D levels", "Limit alcohol consumption", "Maintain a healthy weight to reduce liver fat", "Review medications with your doctor"],
    },
    critical_high: {
      explanation: "Critically high ALP suggests significant liver or bone pathology requiring urgent evaluation.",
      possibleCauses: ["Bile duct obstruction", "Liver disease", "Bone disorders (Paget's disease)", "Certain cancers"],
      consequences: ["Progressive liver damage", "Bone weakening", "Potential malignancy"],
      reductionTips: ["Urgent medical evaluation with imaging", "Liver ultrasound recommended", "Bone density scan may be needed", "Follow up with specialist"],
    },
  },
  "Iron": {
    slightly_low: {
      explanation: "Iron is essential for hemoglobin production. Low iron is the world's most common nutritional deficiency.",
      possibleCauses: ["Insufficient dietary iron", "Heavy menstruation", "Poor absorption (celiac, gastritis)", "Chronic blood loss (GI tract)"],
      consequences: ["Fatigue and weakness", "Hair loss and brittle nails", "Restless legs syndrome", "Impaired cognitive function", "Weakened immunity"],
      reductionTips: ["Eat iron-rich foods: red meat, organ meats, shellfish", "Plant sources: spinach, lentils, tofu, fortified cereals", "Pair with vitamin C for 6x better absorption", "Cook in cast iron cookware", "Avoid coffee/tea within 1 hour of iron-rich meals"],
    },
    critical_low: {
      explanation: "Your iron is critically depleted, indicating severe iron deficiency requiring medical intervention.",
      possibleCauses: ["Chronic blood loss (GI bleeding, heavy periods)", "Malabsorption disorders", "Severe dietary deficiency", "Hookworm infection (in endemic areas)"],
      consequences: ["Severe anemia requiring treatment", "Heart strain and palpitations", "Pregnancy complications", "Impaired immune function", "Pica (craving non-food items)"],
      reductionTips: ["See your doctor immediately — oral iron may not be enough", "IV iron infusion may be needed for rapid correction", "Get tested for GI bleeding (stool occult blood test)", "Screen for celiac disease", "Follow up with repeat labs in 4-6 weeks"],
    },
  },
  "Ferritin": {
    slightly_low: {
      explanation: "Ferritin reflects your body's iron stores. Low ferritin means your iron reserves are depleting even if hemoglobin is still normal.",
      possibleCauses: ["Early iron deficiency", "Increased iron demand (pregnancy, growth)", "Blood donation", "Vegetarian/vegan diet without supplementation"],
      consequences: ["Fatigue even before anemia develops", "Hair thinning and loss", "Reduced exercise performance", "Will progress to anemia if not addressed"],
      reductionTips: ["Start iron supplementation (ferrous sulfate 325mg daily)", "Take iron on empty stomach with vitamin C", "Recheck ferritin in 3 months", "Ensure adequate B12 and folate intake"],
    },
  },
  "CRP": {
    slightly_high: {
      explanation: "CRP (C-Reactive Protein) is a marker of inflammation. Elevation indicates your body is fighting something.",
      possibleCauses: ["Infection (viral or bacterial)", "Autoimmune conditions", "Obesity", "Chronic stress", "Gum disease"],
      consequences: ["Indicates systemic inflammation", "Elevated cardiovascular risk if chronic", "May mask underlying conditions"],
      reductionTips: ["Identify and treat underlying infection", "Anti-inflammatory diet: berries, fatty fish, turmeric, green tea", "Regular moderate exercise", "Adequate sleep (7-9 hours)", "Manage stress and maintain dental health"],
    },
    critical_high: {
      explanation: "Your CRP is critically elevated, indicating severe systemic inflammation requiring urgent investigation.",
      possibleCauses: ["Severe bacterial infection or sepsis", "Major tissue injury or surgery", "Active autoimmune flare", "Certain cancers"],
      consequences: ["Organ damage from uncontrolled inflammation", "Sepsis risk", "Tissue destruction", "Cardiovascular emergency"],
      reductionTips: ["Seek immediate medical attention", "Blood cultures and imaging may be needed", "IV antibiotics if infection confirmed", "Close monitoring in clinical setting"],
    },
  },
  "Sodium": {
    critical_low: {
      explanation: "Critically low sodium (hyponatremia) disrupts the water-salt balance in your body, affecting brain and muscle function.",
      possibleCauses: ["Excess water intake", "Heart failure or liver cirrhosis", "SIADH (hormone disorder)", "Diuretic medications", "Adrenal insufficiency"],
      consequences: ["Confusion and headache", "Seizures", "Brain swelling (cerebral edema)", "Coma in severe cases", "Can be life-threatening"],
      reductionTips: ["Emergency medical treatment required", "Fluid restriction may be needed", "IV saline under careful monitoring", "Identify and treat underlying cause", "Do NOT try to correct at home"],
    },
    critical_high: {
      explanation: "Critically high sodium indicates severe dehydration or sodium excess.",
      possibleCauses: ["Severe dehydration", "Diabetes insipidus", "Excess sodium intake", "Kidney disease"],
      consequences: ["Confusion and irritability", "Muscle twitching", "Seizures", "Brain hemorrhage in severe cases"],
      reductionTips: ["Seek emergency care immediately", "Careful IV fluid replacement needed", "Gradual correction to prevent brain injury"],
    },
  },
  "Potassium": {
    critical_low: {
      explanation: "Critically low potassium (hypokalemia) is dangerous because potassium controls heart rhythm and muscle function.",
      possibleCauses: ["Diuretic medications", "Severe vomiting or diarrhea", "Kidney disorders", "Excessive sweating", "Poor dietary intake"],
      consequences: ["Life-threatening heart arrhythmias", "Muscle weakness and cramps", "Paralysis in severe cases", "Respiratory failure", "Cardiac arrest"],
      reductionTips: ["Emergency treatment with IV potassium", "ECG monitoring required", "Once stable: eat potassium-rich foods (bananas, potatoes, spinach, avocados)", "Review medications that may deplete potassium", "Daily potassium supplement as prescribed"],
    },
    critical_high: {
      explanation: "Critically high potassium is immediately life-threatening due to cardiac effects.",
      possibleCauses: ["Kidney failure", "ACE inhibitors or potassium-sparing diuretics", "Tissue damage or burns", "Acidosis"],
      consequences: ["Fatal cardiac arrhythmia", "Cardiac arrest", "Muscle weakness"],
      reductionTips: ["Go to the ER immediately", "IV calcium, insulin, and glucose for emergency lowering", "Dialysis may be needed", "Avoid all high-potassium foods until resolved"],
    },
  },
  "Chloride": {
    critical_low: {
      explanation: "Critically low chloride (hypochloremia) often occurs alongside sodium imbalances and affects acid-base balance.",
      possibleCauses: ["Prolonged vomiting", "Diuretic use", "Heart failure", "Metabolic alkalosis", "Cystic fibrosis"],
      consequences: ["Metabolic alkalosis", "Muscle weakness and twitching", "Breathing difficulties", "Worsening of other electrolyte imbalances"],
      reductionTips: ["Medical treatment with IV normal saline", "Treat underlying cause (e.g., stop vomiting)", "Monitor acid-base balance", "Adequate salt intake once stable"],
    },
    critical_high: {
      explanation: "Critically high chloride indicates possible kidney dysfunction or severe dehydration.",
      possibleCauses: ["Severe dehydration", "Kidney disease", "Metabolic acidosis", "Excess saline administration"],
      consequences: ["Metabolic acidosis", "Kidney stress", "Worsening dehydration"],
      reductionTips: ["IV fluid therapy under medical supervision", "Treat underlying kidney or metabolic issues", "Hydrate adequately once cleared by doctor"],
    },
  },
  "Calcium": {
    critical_low: {
      explanation: "Critically low calcium (hypocalcemia) affects nerves, muscles, and heart function. Calcium is vital for cell signaling.",
      possibleCauses: ["Vitamin D deficiency", "Hypoparathyroidism", "Kidney failure", "Magnesium deficiency", "Pancreatitis"],
      consequences: ["Muscle spasms and tetany", "Tingling in fingers and lips", "Seizures", "Heart rhythm problems", "Osteoporosis long-term"],
      reductionTips: ["Emergency IV calcium gluconate", "Check vitamin D and parathyroid levels", "Once stable: dairy, fortified foods, leafy greens", "Vitamin D3 supplementation (2000-4000 IU/day)", "Weight-bearing exercise for bone health"],
    },
    critical_high: {
      explanation: "Critically high calcium (hypercalcemia) can affect kidneys, heart, and brain function.",
      possibleCauses: ["Hyperparathyroidism", "Certain cancers", "Excess vitamin D", "Granulomatous diseases"],
      consequences: ["Kidney stones", "Bone loss", "Confusion and fatigue", "Heart rhythm problems"],
      reductionTips: ["Urgent medical evaluation", "IV fluids for hydration", "Bisphosphonate therapy may be needed", "Treat underlying cause"],
    },
  },
  "Platelet Count": {
    slightly_low: {
      explanation: "Platelets help your blood clot. A slight decrease is often temporary and benign but should be monitored.",
      possibleCauses: ["Viral infection", "Certain medications", "Alcohol consumption", "Autoimmune conditions", "Liver disease"],
      consequences: ["Slightly increased bleeding tendency", "Easy bruising", "Usually self-resolving if mild"],
      reductionTips: ["Avoid aspirin and NSAIDs unless prescribed", "Limit alcohol intake", "Eat folate-rich foods (leafy greens, citrus)", "Recheck in 4-6 weeks", "Report unusual bruising to your doctor"],
    },
    critical_low: {
      explanation: "Critically low platelets increase your risk of spontaneous and uncontrollable bleeding.",
      possibleCauses: ["Immune thrombocytopenia (ITP)", "Bone marrow disorders", "Severe infection", "Medication side effects"],
      consequences: ["Spontaneous bleeding (gums, nose)", "Internal bleeding risk", "Intracranial hemorrhage in severe cases"],
      reductionTips: ["Seek immediate hematology consultation", "Avoid all contact sports and injury", "Corticosteroids or IVIG may be needed", "Platelet transfusion if actively bleeding"],
    },
    slightly_high: {
      explanation: "Slightly elevated platelets are often reactive — your body is responding to something.",
      possibleCauses: ["Iron deficiency (reactive)", "Infection or inflammation", "Post-surgery response", "Chronic inflammatory conditions"],
      consequences: ["Slightly increased clotting risk", "Usually benign and temporary"],
      reductionTips: ["Treat underlying cause (iron deficiency, infection)", "Stay hydrated", "Stay active to promote healthy blood flow", "Follow up if persistently elevated"],
    },
    critical_high: {
      explanation: "Critically high platelets significantly increase your risk of blood clots.",
      possibleCauses: ["Essential thrombocythemia", "Myeloproliferative disorders", "Severe reactive thrombocytosis"],
      consequences: ["Blood clots (DVT, pulmonary embolism)", "Stroke risk", "Heart attack risk"],
      reductionTips: ["Urgent hematology referral", "Low-dose aspirin may be started", "Cytoreductive therapy if needed", "Avoid smoking and prolonged immobility"],
    },
  },
};

function getClinicalCorrelation(testName: string, status: TestStatus): ClinicalCorrelation {
  const statusKey = status.includes("low")
    ? (status === "critical_low" ? "critical_low" : "slightly_low")
    : (status === "critical_high" ? "critical_high" : "slightly_high");

  return clinicalData[testName]?.[statusKey] || {
    explanation: `Your ${testName} is ${status.replace("_", " ")}. Please consult your healthcare provider for a detailed assessment.`,
    possibleCauses: ["Various medical conditions", "Dietary factors", "Medication effects", "Lifestyle factors"],
    consequences: ["May affect overall health if persistent", "Should be monitored over time", "Consult your doctor for personalized assessment"],
    reductionTips: ["Schedule a follow-up with your doctor", "Maintain a balanced diet", "Stay physically active", "Get adequate sleep and manage stress"],
  };
}

// Verified clinical references (Mayo Clinic, NIH MedlinePlus, CDC, AHA, NHS)
const clinicalReferences: Record<string, ClinicalReference[]> = {
  "HbA1c": [
    { label: "A1C Test — diabetes diagnosis & management", url: "https://www.cdc.gov/diabetes/diabetes-testing/prediabetes-a1c-test.html", source: "CDC" },
    { label: "A1C Test — overview", url: "https://medlineplus.gov/lab-tests/hba1c-test/", source: "NIH MedlinePlus" },
    { label: "Diabetes — symptoms & causes", url: "https://www.mayoclinic.org/diseases-conditions/diabetes/symptoms-causes/syc-20371444", source: "Mayo Clinic" },
  ],
  "Random Blood Sugar": [
    { label: "Blood Glucose Test", url: "https://medlineplus.gov/lab-tests/blood-glucose-test/", source: "NIH MedlinePlus" },
    { label: "Manage Blood Sugar", url: "https://www.cdc.gov/diabetes/treatment/index.html", source: "CDC" },
  ],
  "LDL Cholesterol": [
    { label: "LDL & HDL Cholesterol", url: "https://www.cdc.gov/cholesterol/about/ldl-and-hdl-cholesterol-and-triglycerides.html", source: "CDC" },
    { label: "Prevention & Treatment of High Cholesterol", url: "https://www.heart.org/en/health-topics/cholesterol/prevention-and-treatment-of-high-cholesterol-hyperlipidemia", source: "American Heart Association" },
    { label: "High cholesterol — diagnosis & treatment", url: "https://www.mayoclinic.org/diseases-conditions/high-blood-cholesterol/diagnosis-treatment/drc-20350806", source: "Mayo Clinic" },
  ],
  "Non-HDL Cholesterol": [
    { label: "Cholesterol Levels", url: "https://medlineplus.gov/cholesterollevelswhatyouneedtoknow.html", source: "NIH MedlinePlus" },
    { label: "Healthy Eating to Lower Cholesterol", url: "https://www.heart.org/en/healthy-living/healthy-eating", source: "American Heart Association" },
  ],
  "Iron": [
    { label: "Iron Deficiency Anemia", url: "https://www.mayoclinic.org/diseases-conditions/iron-deficiency-anemia/symptoms-causes/syc-20355034", source: "Mayo Clinic" },
    { label: "Iron — Health Professional Fact Sheet", url: "https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/", source: "NIH ODS" },
  ],
  "Ferritin": [
    { label: "Ferritin Test", url: "https://medlineplus.gov/lab-tests/ferritin-blood-test/", source: "NIH MedlinePlus" },
    { label: "Ferritin Test — Mayo Clinic", url: "https://www.mayoclinic.org/tests-procedures/ferritin-test/about/pac-20384928", source: "Mayo Clinic" },
  ],
  "MCH": [
    { label: "MCH Blood Test", url: "https://medlineplus.gov/lab-tests/mch-blood-test/", source: "NIH MedlinePlus" },
    { label: "Anemia — symptoms & causes", url: "https://www.mayoclinic.org/diseases-conditions/anemia/symptoms-causes/syc-20351360", source: "Mayo Clinic" },
  ],
  "MCHC": [
    { label: "MCHC Blood Test", url: "https://medlineplus.gov/lab-tests/mchc-blood-test/", source: "NIH MedlinePlus" },
  ],
  "Neutrophils": [
    { label: "WBC Differential", url: "https://medlineplus.gov/lab-tests/blood-differential-test/", source: "NIH MedlinePlus" },
  ],
  "Alkaline Phosphatase": [
    { label: "ALP Test", url: "https://medlineplus.gov/lab-tests/alkaline-phosphatase/", source: "NIH MedlinePlus" },
    { label: "Liver function tests", url: "https://www.mayoclinic.org/tests-procedures/liver-function-tests/about/pac-20394595", source: "Mayo Clinic" },
  ],
  "CRP": [
    { label: "C-Reactive Protein (CRP) Test", url: "https://medlineplus.gov/lab-tests/c-reactive-protein-crp-test/", source: "NIH MedlinePlus" },
    { label: "CRP test — Mayo Clinic", url: "https://www.mayoclinic.org/tests-procedures/c-reactive-protein-test/about/pac-20385228", source: "Mayo Clinic" },
  ],
  "Sodium": [
    { label: "Sodium Blood Test", url: "https://medlineplus.gov/lab-tests/sodium-blood-test/", source: "NIH MedlinePlus" },
    { label: "Hyponatremia", url: "https://www.mayoclinic.org/diseases-conditions/hyponatremia/symptoms-causes/syc-20373711", source: "Mayo Clinic" },
  ],
  "Potassium": [
    { label: "Potassium Blood Test", url: "https://medlineplus.gov/lab-tests/potassium-blood-test/", source: "NIH MedlinePlus" },
    { label: "Hyperkalemia (high potassium)", url: "https://www.heart.org/en/health-topics/heart-failure/treatment-options-for-heart-failure/hyperkalemia-high-potassium", source: "American Heart Association" },
  ],
  "Chloride": [
    { label: "Chloride Blood Test", url: "https://medlineplus.gov/lab-tests/chloride-blood-test/", source: "NIH MedlinePlus" },
  ],
  "Calcium": [
    { label: "Calcium Blood Test", url: "https://medlineplus.gov/lab-tests/calcium-blood-test/", source: "NIH MedlinePlus" },
    { label: "Hypocalcemia & Hypercalcemia", url: "https://www.mayoclinic.org/diseases-conditions/hypercalcemia/symptoms-causes/syc-20355523", source: "Mayo Clinic" },
  ],
  "Platelet Count": [
    { label: "Platelet Tests", url: "https://medlineplus.gov/lab-tests/platelet-tests/", source: "NIH MedlinePlus" },
    { label: "Thrombocytopenia (low platelets)", url: "https://www.mayoclinic.org/diseases-conditions/thrombocytopenia/symptoms-causes/syc-20378293", source: "Mayo Clinic" },
  ],
};

const defaultReferences: ClinicalReference[] = [
  { label: "Understanding Lab Test Results", url: "https://medlineplus.gov/laboratorytests.html", source: "NIH MedlinePlus" },
  { label: "Lab tests overview", url: "https://www.mayoclinic.org/tests-procedures", source: "Mayo Clinic" },
];

function getClinicalReferences(testName: string): ClinicalReference[] {
  return clinicalReferences[testName] || defaultReferences;
}

function generateAIReport(tests: LabTest[], panels: PanelSummary[]): {
  overallSummary: string;
  abnormalFindings: AbnormalFinding[];
  practicalAdvice: string[];
  recommendedActions: RecommendedAction[];
  whenToConsultDoctor: string;
  talkingPoints: string[];
} {
  const abnormalTests = tests.filter((t) => t.status !== "normal");
  const criticalTests = abnormalTests.filter((t) => t.status.includes("critical"));

  const abnormalFindings: AbnormalFinding[] = abnormalTests.map((t) => {
    const correlation = getClinicalCorrelation(t.name, t.status);
    return {
      testName: t.name,
      status: t.status,
      explanation: correlation.explanation,
      possibleCauses: correlation.possibleCauses,
      consequences: correlation.consequences,
      reductionTips: correlation.reductionTips,
      references: getClinicalReferences(t.name),
    };
  });

  const hasCritical = criticalTests.length > 0;
  const criticalNames = criticalTests.map((t) => t.name).join(", ");

  const overallSummary = hasCritical
    ? `Your lab results show several critical and very concerning findings that require immediate medical attention. Your ${criticalNames} are all flagged as critical. Additionally, some values are slightly outside the normal range. While some test panels show normal results, the critical values override these and indicate urgent health concerns.`
    : abnormalTests.length > 0
    ? `Your lab results are mostly within normal ranges, but a few values need attention. Your ${abnormalTests.map((t) => t.name).join(", ")} are slightly outside the normal range. These findings are not immediately dangerous but should be discussed with your doctor.`
    : `Great news! All your lab results are within the normal ranges. Your overall health indicators look good. Continue maintaining a healthy lifestyle with regular exercise and balanced nutrition.`;

  const practicalAdvice = hasCritical
    ? [
        "Given the number of critical values, you must seek immediate medical attention. Do not delay in contacting your doctor or going to the nearest emergency room. Take these lab results with you.",
        "Follow all dietary and fluid recommendations provided by your medical team.",
        "Adhere strictly to any medication prescribed for your conditions.",
        "Once your critical conditions are stabilized, discuss a long-term plan with your doctor that includes balanced nutrition, regular physical activity, and stress management.",
      ]
    : abnormalTests.length > 0
    ? [
        "Schedule an appointment with your doctor to discuss these results.",
        "Maintain a balanced diet rich in fruits, vegetables, whole grains, and lean proteins.",
        "Stay well-hydrated and aim for at least 30 minutes of moderate exercise most days.",
        "Track any symptoms you experience and share them with your doctor.",
      ]
    : [
        "Continue your current healthy lifestyle habits.",
        "Maintain regular check-ups with your healthcare provider.",
        "Stay active with regular physical exercise.",
        "Focus on a balanced, nutrient-rich diet.",
      ];

  const recommendedActions: RecommendedAction[] = hasCritical
    ? [
        { step: 1, title: "See Your Doctor Immediately", description: `You should see a doctor immediately or go to the emergency room due to the critical results for ${criticalNames}.` },
        { step: 2, title: "Make Lifestyle Changes", description: "Follow all dietary and fluid recommendations provided by your medical team to help manage your conditions." },
        { step: 3, title: "Schedule Follow-up Tests", description: "Ask your doctor about retesting timeline based on your results." },
      ]
    : [
        { step: 1, title: "Schedule a Doctor Visit", description: "Discuss your abnormal findings with your healthcare provider at your earliest convenience." },
        { step: 2, title: "Improve Your Diet", description: "Focus on nutrient-rich foods that support your specific health needs." },
        { step: 3, title: "Follow Up in 3-6 Months", description: "Retest the flagged parameters to monitor improvement." },
      ];

  const whenToConsultDoctor = hasCritical
    ? `You should see a doctor immediately or go to the emergency room due to the critical and very high/low results for ${criticalNames}.`
    : abnormalTests.length > 0
    ? `Schedule an appointment with your doctor within the next 1-2 weeks to discuss your results, particularly the ${abnormalTests.map((t) => t.name).join(", ")} values.`
    : "Continue your regular check-up schedule. No immediate consultation is needed based on these results.";

  const talkingPoints = hasCritical
    ? [
        "What do these critical values mean for my immediate health?",
        "What are the next steps for emergency treatment and investigation?",
        `How do we address the critically abnormal values (${criticalNames})?`,
        "What lifestyle changes should I make to support my recovery?",
        "What is the recommended follow-up testing schedule?",
      ]
    : [
        "What could be causing my slightly abnormal values?",
        "Should I make any dietary or lifestyle changes?",
        "When should I retest these parameters?",
        "Are there any additional tests you recommend?",
      ];

  return { overallSummary, abnormalFindings, practicalAdvice, recommendedActions, whenToConsultDoctor, talkingPoints };
}

// Main analysis function - the full pipeline
export async function analyzeLabReport(fileContent: string): Promise<AnalysisResult> {
  // Step 1: De-identify (HIPAA-aligned)
  const cleanedText = deidentifyText(fileContent);

  // Step 2: Extract lab data — dictionary-based first (best units / panels),
  // then dynamic discovery fills in any tests we don't know about.
  const known = extractTestsFromText(cleanedText);
  const dynamic = extractDynamicRows(cleanedText);

  // Dedupe: prefer dictionary entries (better units & ranges). Match by
  // case-insensitive substring of cleaned name.
  const knownNamesLower = new Set(known.map((t) => t.name.toLowerCase()));
  const knownSynonymsLower = new Set<string>();
  for (const [syn, canon] of Object.entries(synonyms)) {
    if (knownNamesLower.has(canon.toLowerCase())) knownSynonymsLower.add(syn.toLowerCase());
  }
  const extras = dynamic.filter((d) => {
    const n = d.name.toLowerCase();
    if (knownNamesLower.has(n)) return false;
    for (const known of knownNamesLower) if (n.includes(known) || known.includes(n)) return false;
    for (const syn of knownSynonymsLower) if (n.includes(syn)) return false;
    return true;
  });
  const tests = [...known, ...extras];

  // Step 3: Group into panels
  const panels = groupIntoPanels(tests);

  // Step 4: Calculate health score
  const { score, grade } = calculateHealthScore(tests);

  // Step 5: Generate AI report
  const report = generateAIReport(tests, panels);

  // Original file is NOT stored (HIPAA-aligned)
  // Only de-identified structured data is returned

  return {
    tests,
    panels,
    totalTests: tests.length,
    normalTests: tests.filter((t) => t.status === "normal").length,
    abnormalTests: tests.filter((t) => t.status !== "normal").length,
    healthScore: score,
    healthGrade: grade,
    ...report,
  };
}

// Demo data for when parsing fails or for demonstration
export function getDemoAnalysis(): AnalysisResult {
  const demoTests: LabTest[] = [
    { name: "Hemoglobin", value: 14.2, rawValue: "14.2 gms/dl", unit: "gms/dl", normalRange: "13 - 17 gms/dl", status: "normal", panel: "Blood Health (Complete Blood Count)" },
    { name: "WBC Count", value: 9500, rawValue: "9500 cells/µL", unit: "cells/µL", normalRange: "4000 - 11000 cells/µL", status: "normal", panel: "Blood Health (Complete Blood Count)" },
    { name: "Neutrophils", value: 71, rawValue: "71 %", unit: "%", normalRange: "40 - 70 %", status: "slightly_high", panel: "Blood Health (Complete Blood Count)" },
    { name: "Lymphocytes", value: 20, rawValue: "20 %", unit: "%", normalRange: "20 - 40 %", status: "normal", panel: "Blood Health (Complete Blood Count)" },
    { name: "Eosinophils", value: 6, rawValue: "6 %", unit: "%", normalRange: "1 - 6 %", status: "normal", panel: "Blood Health (Complete Blood Count)" },
    { name: "Monocytes", value: 3, rawValue: "3 %", unit: "%", normalRange: "2 - 8 %", status: "normal", panel: "Blood Health (Complete Blood Count)" },
    { name: "Basophils", value: 0, rawValue: "0 %", unit: "%", normalRange: "0 - 1 %", status: "normal", panel: "Blood Health (Complete Blood Count)" },
    { name: "Hematocrit", value: 46.4, rawValue: "46.4 %", unit: "%", normalRange: "40 - 54 %", status: "normal", panel: "Blood Health (Complete Blood Count)" },
    { name: "RBC Count", value: 5.1, rawValue: "5.1 million/µL", unit: "million/µL", normalRange: "4.5 - 5.5 million/µL", status: "normal", panel: "Blood Health (Complete Blood Count)" },
    { name: "MCV", value: 85.29, rawValue: "85.29 fL", unit: "fL", normalRange: "80 - 100 fL", status: "normal", panel: "Blood Health (Complete Blood Count)" },
    { name: "MCH", value: 26.1, rawValue: "26.1 pg", unit: "pg", normalRange: "27 - 33 pg", status: "slightly_low", panel: "Blood Health (Complete Blood Count)" },
    { name: "MCHC", value: 30.6, rawValue: "30.6 g/dL", unit: "g/dL", normalRange: "32 - 36 g/dL", status: "slightly_low", panel: "Blood Health (Complete Blood Count)" },
    { name: "RDW-CV", value: 13.6, rawValue: "13.6 %", unit: "%", normalRange: "11 - 16 %", status: "normal", panel: "Blood Health (Complete Blood Count)" },
    { name: "Platelet Count", value: 312000, rawValue: "312000 /µL", unit: "/µL", normalRange: "150000 - 400000 /µL", status: "normal", panel: "Blood Health (Complete Blood Count)" },
    { name: "MPV", value: 8.7, rawValue: "8.7 fL", unit: "fL", normalRange: "6.5 - 12 fL", status: "normal", panel: "Blood Health (Complete Blood Count)" },
    { name: "PDW", value: 9.9, rawValue: "9.9 fL", unit: "fL", normalRange: "9 - 17 fL", status: "normal", panel: "Blood Health (Complete Blood Count)" },

    { name: "Blood Urea", value: 15, rawValue: "15 mg/dL", unit: "mg/dL", normalRange: "7 - 20 mg/dL", status: "normal", panel: "Kidney Function" },
    { name: "Serum Creatinine", value: 0.9, rawValue: "0.9 mg/dL", unit: "mg/dL", normalRange: "0.7 - 1.3 mg/dL", status: "normal", panel: "Kidney Function" },
    { name: "Uric Acid", value: 5.2, rawValue: "5.2 mg/dL", unit: "mg/dL", normalRange: "3.5 - 7.2 mg/dL", status: "normal", panel: "Kidney Function" },

    { name: "Total Bilirubin", value: 0.8, rawValue: "0.8 mg/dL", unit: "mg/dL", normalRange: "0.1 - 1.2 mg/dL", status: "normal", panel: "Liver Health" },
    { name: "SGOT (AST)", value: 28, rawValue: "28 U/L", unit: "U/L", normalRange: "0 - 40 U/L", status: "normal", panel: "Liver Health" },
    { name: "SGPT (ALT)", value: 32, rawValue: "32 U/L", unit: "U/L", normalRange: "0 - 41 U/L", status: "normal", panel: "Liver Health" },
    { name: "Alkaline Phosphatase", value: 155, rawValue: "155 U/L", unit: "U/L", normalRange: "44 - 147 U/L", status: "slightly_high", panel: "Liver Health" },
    { name: "Total Protein", value: 7.2, rawValue: "7.2 g/dL", unit: "g/dL", normalRange: "6 - 8.3 g/dL", status: "normal", panel: "Liver Health" },
    { name: "Albumin", value: 4.2, rawValue: "4.2 g/dL", unit: "g/dL", normalRange: "3.5 - 5.5 g/dL", status: "normal", panel: "Liver Health" },
    { name: "Globulin", value: 3.0, rawValue: "3.0 g/dL", unit: "g/dL", normalRange: "2 - 3.5 g/dL", status: "normal", panel: "Liver Health" },
    { name: "A/G Ratio", value: 1.4, rawValue: "1.4", unit: "", normalRange: "1 - 2.5", status: "normal", panel: "Liver Health" },
    { name: "GGT", value: 35, rawValue: "35 U/L", unit: "U/L", normalRange: "0 - 55 U/L", status: "normal", panel: "Liver Health" },
    { name: "Direct Bilirubin", value: 0.2, rawValue: "0.2 mg/dL", unit: "mg/dL", normalRange: "0 - 0.3 mg/dL", status: "normal", panel: "Liver Health" },
    { name: "Indirect Bilirubin", value: 0.6, rawValue: "0.6 mg/dL", unit: "mg/dL", normalRange: "0.1 - 0.9 mg/dL", status: "normal", panel: "Liver Health" },

    { name: "Random Blood Sugar", value: 310, rawValue: "310 mg/dL", unit: "mg/dL", normalRange: "70 - 140 mg/dL", status: "critical_high", panel: "Blood Sugar" },
    { name: "HbA1c", value: 10.5, rawValue: "10.5 %", unit: "%", normalRange: "4 - 5.7 %", status: "critical_high", panel: "Blood Sugar" },

    { name: "Total Cholesterol", value: 195, rawValue: "195 mg/dL", unit: "mg/dL", normalRange: "0 - 200 mg/dL", status: "normal", panel: "Lipid Profile" },
    { name: "Triglycerides", value: 140, rawValue: "140 mg/dL", unit: "mg/dL", normalRange: "0 - 150 mg/dL", status: "normal", panel: "Lipid Profile" },
    { name: "HDL Cholesterol", value: 42, rawValue: "42 mg/dL", unit: "mg/dL", normalRange: "40 - 60 mg/dL", status: "normal", panel: "Lipid Profile" },
    { name: "LDL Cholesterol", value: 125, rawValue: "125 mg/dL", unit: "mg/dL", normalRange: "0 - 100 mg/dL", status: "slightly_high", panel: "Lipid Profile" },
    { name: "VLDL Cholesterol", value: 28, rawValue: "28 mg/dL", unit: "mg/dL", normalRange: "0 - 30 mg/dL", status: "normal", panel: "Lipid Profile" },
    { name: "Non-HDL Cholesterol", value: 153, rawValue: "153 mg/dL", unit: "mg/dL", normalRange: "0 - 130 mg/dL", status: "slightly_high", panel: "Lipid Profile" },

    { name: "Iron", value: 25, rawValue: "25 µg/dL", unit: "µg/dL", normalRange: "60 - 170 µg/dL", status: "critical_low", panel: "Anemia Profile" },
    { name: "Ferritin", value: 15, rawValue: "15 ng/mL", unit: "ng/mL", normalRange: "20 - 250 ng/mL", status: "slightly_low", panel: "Anemia Profile" },

    { name: "Sodium", value: 118, rawValue: "118 mEq/L", unit: "mEq/L", normalRange: "136 - 145 mEq/L", status: "critical_low", panel: "Electrolytes" },
    { name: "Potassium", value: 2.3, rawValue: "2.3 mEq/L", unit: "mEq/L", normalRange: "3.5 - 5 mEq/L", status: "critical_low", panel: "Electrolytes" },
    { name: "Chloride", value: 78, rawValue: "78 mEq/L", unit: "mEq/L", normalRange: "98 - 106 mEq/L", status: "critical_low", panel: "Electrolytes" },
    { name: "Calcium", value: 5.5, rawValue: "5.5 mg/dL", unit: "mg/dL", normalRange: "8.5 - 10.5 mg/dL", status: "critical_low", panel: "Electrolytes" },

    { name: "CRP", value: 65, rawValue: "65 mg/L", unit: "mg/L", normalRange: "0 - 5 mg/L", status: "critical_high", panel: "Inflammation" },
    { name: "ESR", value: 18, rawValue: "18 mm/hr", unit: "mm/hr", normalRange: "0 - 20 mm/hr", status: "normal", panel: "Inflammation" },

    { name: "TSH", value: 2.5, rawValue: "2.5 µIU/mL", unit: "µIU/mL", normalRange: "0.4 - 4 µIU/mL", status: "normal", panel: "Thyroid Function" },
    { name: "T3", value: 120, rawValue: "120 ng/dL", unit: "ng/dL", normalRange: "80 - 200 ng/dL", status: "normal", panel: "Thyroid Function" },
    { name: "T4", value: 8.5, rawValue: "8.5 µg/dL", unit: "µg/dL", normalRange: "4.5 - 12.5 µg/dL", status: "normal", panel: "Thyroid Function" },
  ];

  const panels = groupIntoPanels(demoTests);
  const { score, grade } = calculateHealthScore(demoTests);
  const report = generateAIReport(demoTests, panels);

  return {
    tests: demoTests,
    panels,
    totalTests: demoTests.length,
    normalTests: demoTests.filter((t) => t.status === "normal").length,
    abnormalTests: demoTests.filter((t) => t.status !== "normal").length,
    healthScore: score,
    healthGrade: grade,
    ...report,
  };
}
