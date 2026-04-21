/**
 * Client-side translator with two layers:
 *   1) Instant offline dictionary for known phrases (zero latency)
 *   2) Async Google Translate (free unofficial endpoint, no API key) for arbitrary text
 *
 * Async results are cached in-memory + sessionStorage. Components can use
 * `useTranslated(text, lang)` to render translated text reactively.
 */

import { useEffect, useState } from "react";

export type LangCode = "en" | "hi" | "te" | "mr" | "ta" | "kn";

export const LANGUAGES: { code: LangCode; label: string; native: string; bcp47: string }[] = [
  { code: "en", label: "English", native: "English", bcp47: "en-US" },
  { code: "hi", label: "Hindi", native: "हिन्दी", bcp47: "hi-IN" },
  { code: "te", label: "Telugu", native: "తెలుగు", bcp47: "te-IN" },
  { code: "mr", label: "Marathi", native: "मराठी", bcp47: "mr-IN" },
  { code: "ta", label: "Tamil", native: "தமிழ்", bcp47: "ta-IN" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ", bcp47: "kn-IN" },
];

type Dict = Record<string, string>;

/* Phrase dictionary — keys are English fragments, values are translated */
const dict: Record<Exclude<LangCode, "en">, Dict> = {
  hi: {
    "Great news — no critical findings in your report! All values are within safe ranges.":
      "अच्छी खबर — आपकी रिपोर्ट में कोई गंभीर समस्या नहीं है! सभी मान सुरक्षित सीमा में हैं।",
    "Great news! Your overall health looks really good. Let me walk you through.":
      "अच्छी खबर! आपका समग्र स्वास्थ्य बहुत अच्छा है। आइए मैं आपको विस्तार से बताऊँ।",
    "Most things look fine, but there are a few areas that need attention.":
      "अधिकांश चीज़ें ठीक दिख रही हैं, पर कुछ क्षेत्रों पर ध्यान देने की ज़रूरत है।",
    "I need to flag some important findings. Please review carefully and consult your doctor soon.":
      "मुझे कुछ महत्वपूर्ण निष्कर्षों पर ध्यान दिलाना है। कृपया ध्यान से देखें और जल्द ही डॉक्टर से सलाह लें।",
    "Here are some lifestyle tips based on your results:":
      "आपके परिणामों के आधार पर कुछ जीवनशैली सुझाव:",
    "Overall Summary": "समग्र सारांश",
    "Health Score": "स्वास्थ्य स्कोर",
    "Total Tests": "कुल परीक्षण",
    "Normal": "सामान्य",
    "Need Attention": "ध्यान चाहिए",
    "Optimal": "उत्तम",
    "Attention": "ध्यान",
    "Critical": "गंभीर",
    "Test panels detected": "पता चले परीक्षण पैनल",
    "Test Panels Detected": "पता चले परीक्षण पैनल",
    "Abnormal Findings — AI Clinical Analysis": "असामान्य निष्कर्ष — एआई नैदानिक विश्लेषण",
    "Click on each finding to see AI-generated correlations, consequences, and lifestyle tips.":
      "प्रत्येक निष्कर्ष पर क्लिक करें ताकि एआई द्वारा निर्मित सहसंबंध, परिणाम और जीवनशैली सुझाव देख सकें।",
    "Why This Could Be High/Low": "यह उच्च/निम्न क्यों हो सकता है",
    "Possible Consequences": "संभावित परिणाम",
    "How to Improve": "कैसे सुधारें",
    "Verified Medical References": "सत्यापित चिकित्सा संदर्भ",
    "Practical Advice": "व्यावहारिक सलाह",
    "Recommended Actions": "अनुशंसित क्रियाएँ",
    "When to Consult Doctor": "डॉक्टर से कब परामर्श करें",
    "Discuss with Your Doctor": "अपने डॉक्टर से चर्चा करें",
    "Print Report": "रिपोर्ट प्रिंट करें",
    "Back": "वापस",
    "Your Lab Report Analysis": "आपकी लैब रिपोर्ट विश्लेषण",
    "Analyze Another": "एक और विश्लेषण",
    "Upload a new lab report for instant AI insights.": "तुरंत एआई अंतर्दृष्टि के लिए नई लैब रिपोर्ट अपलोड करें।",
    "New Report": "नई रिपोर्ट",
  },
  te: {
    "Great news — no critical findings in your report! All values are within safe ranges.":
      "శుభవార్త — మీ నివేదికలో తీవ్రమైన సమస్యలు లేవు! అన్ని విలువలు సురక్షిత పరిధిలో ఉన్నాయి.",
    "Great news! Your overall health looks really good. Let me walk you through.":
      "శుభవార్త! మీ మొత్తం ఆరోగ్యం చాలా బాగుంది. మీకు వివరంగా చెబుతాను.",
    "Most things look fine, but there are a few areas that need attention.":
      "చాలావరకు బాగున్నా, కొన్ని విషయాలపై దృష్టి అవసరం.",
    "I need to flag some important findings. Please review carefully and consult your doctor soon.":
      "కొన్ని ముఖ్యమైన ఫలితాలను చూపించాలి. దయచేసి జాగ్రత్తగా చూసి త్వరగా డాక్టర్‌ను సంప్రదించండి.",
    "Here are some lifestyle tips based on your results:":
      "మీ ఫలితాల ఆధారంగా కొన్ని జీవనశైలి సూచనలు:",
    "Overall Summary": "మొత్తం సారాంశం",
    "Health Score": "ఆరోగ్య స్కోర్",
    "Total Tests": "మొత్తం పరీక్షలు",
    "Normal": "సాధారణం",
    "Need Attention": "దృష్టి అవసరం",
    "Optimal": "ఉత్తమం",
    "Attention": "శ్రద్ధ",
    "Critical": "క్లిష్టం",
    "Test panels detected": "గుర్తించిన పరీక్ష ప్యానెల్స్",
    "Test Panels Detected": "గుర్తించిన పరీక్ష ప్యానెల్స్",
    "Abnormal Findings — AI Clinical Analysis": "అసాధారణ ఫలితాలు — ఏఐ క్లినికల్ విశ్లేషణ",
    "Click on each finding to see AI-generated correlations, consequences, and lifestyle tips.":
      "ప్రతి ఫలితంపై క్లిక్ చేస్తే ఏఐ సహసంబంధాలు, పరిణామాలు మరియు జీవనశైలి సూచనలు చూడవచ్చు.",
    "Why This Could Be High/Low": "ఇది ఎందుకు ఎక్కువ/తక్కువ కావచ్చు",
    "Possible Consequences": "సాధ్యమైన పరిణామాలు",
    "How to Improve": "ఎలా మెరుగుపరచాలి",
    "Verified Medical References": "ధృవీకరించబడిన వైద్య సూచనలు",
    "Practical Advice": "ఆచరణాత్మక సలహా",
    "Recommended Actions": "సిఫార్సు చేయబడిన చర్యలు",
    "When to Consult Doctor": "డాక్టర్‌ను ఎప్పుడు సంప్రదించాలి",
    "Discuss with Your Doctor": "మీ డాక్టర్‌తో చర్చించండి",
    "Print Report": "నివేదికను ప్రింట్ చేయండి",
    "Back": "వెనుకకు",
    "Your Lab Report Analysis": "మీ ల్యాబ్ నివేదిక విశ్లేషణ",
    "Analyze Another": "మరొకటి విశ్లేషించండి",
    "Upload a new lab report for instant AI insights.": "తక్షణ ఏఐ అంతర్దృష్టుల కోసం కొత్త ల్యాబ్ నివేదికను అప్‌లోడ్ చేయండి.",
    "New Report": "కొత్త నివేదిక",
  },
  mr: {
    "Great news — no critical findings in your report! All values are within safe ranges.":
      "चांगली बातमी — तुमच्या रिपोर्टमध्ये कोणतीही गंभीर समस्या नाही! सर्व मूल्ये सुरक्षित मर्यादेत आहेत.",
    "Great news! Your overall health looks really good. Let me walk you through.":
      "चांगली बातमी! तुमचे एकूण आरोग्य खूप चांगले आहे. मी तुम्हाला सविस्तर सांगतो.",
    "Most things look fine, but there are a few areas that need attention.":
      "बहुतेक गोष्टी ठीक दिसत आहेत, पण काही गोष्टींकडे लक्ष देणे आवश्यक आहे.",
    "I need to flag some important findings. Please review carefully and consult your doctor soon.":
      "काही महत्त्वाच्या निष्कर्षांकडे लक्ष वेधायचे आहे. कृपया काळजीपूर्वक तपासा आणि लवकरच डॉक्टरांचा सल्ला घ्या.",
    "Here are some lifestyle tips based on your results:":
      "तुमच्या निकालांवर आधारित काही जीवनशैली सूचना:",
    "Overall Summary": "एकूण सारांश",
    "Health Score": "आरोग्य स्कोअर",
    "Total Tests": "एकूण चाचण्या",
    "Normal": "सामान्य",
    "Need Attention": "लक्ष आवश्यक",
    "Optimal": "उत्तम",
    "Attention": "लक्ष",
    "Critical": "गंभीर",
    "Test panels detected": "आढळलेले चाचणी पॅनेल",
    "Test Panels Detected": "आढळलेले चाचणी पॅनेल",
    "Abnormal Findings — AI Clinical Analysis": "असामान्य निष्कर्ष — एआय क्लिनिकल विश्लेषण",
    "Click on each finding to see AI-generated correlations, consequences, and lifestyle tips.":
      "प्रत्येक निष्कर्षावर क्लिक करा आणि एआय-निर्मित सहसंबंध, परिणाम आणि जीवनशैली सूचना पहा.",
    "Why This Could Be High/Low": "हे जास्त/कमी का असू शकते",
    "Possible Consequences": "संभाव्य परिणाम",
    "How to Improve": "कसे सुधारावे",
    "Verified Medical References": "सत्यापित वैद्यकीय संदर्भ",
    "Practical Advice": "व्यावहारिक सल्ला",
    "Recommended Actions": "शिफारस केलेल्या क्रिया",
    "When to Consult Doctor": "डॉक्टरांचा सल्ला कधी घ्यावा",
    "Discuss with Your Doctor": "तुमच्या डॉक्टरांशी चर्चा करा",
    "Print Report": "अहवाल मुद्रित करा",
    "Back": "मागे",
    "Your Lab Report Analysis": "तुमच्या लॅब अहवालाचे विश्लेषण",
    "Analyze Another": "आणखी एक विश्लेषण",
    "Upload a new lab report for instant AI insights.": "त्वरित एआय अंतर्दृष्टीसाठी नवीन लॅब अहवाल अपलोड करा.",
    "New Report": "नवीन अहवाल",
  },
  ta: {},
  kn: {},
};

/** Synchronous lookup — returns instant translation or original text. */
export function translate(text: string, lang: LangCode): string {
  if (lang === "en" || !text) return text;
  const d = dict[lang];
  if (d[text]) return d[text];
  let out = text;
  const keys = Object.keys(d).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (out.includes(k)) out = out.split(k).join(d[k]);
  }
  return out;
}

export function getBcp47(lang: LangCode): string {
  return LANGUAGES.find((l) => l.code === lang)?.bcp47 ?? "en-US";
}

/* ───────────── Async Google Translate (free unofficial endpoint) ───────────── */

const memCache = new Map<string, string>();

function cacheKey(text: string, lang: LangCode) {
  return `tx:${lang}:${text}`;
}

function readSession(key: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function writeSession(key: string, value: string) {
  if (typeof sessionStorage === "undefined") return;
  try { sessionStorage.setItem(key, value); } catch { /* quota */ }
}

const inflight = new Map<string, Promise<string>>();

export async function translateAsync(text: string, lang: LangCode): Promise<string> {
  if (lang === "en" || !text?.trim()) return text;

  const key = cacheKey(text, lang);
  if (memCache.has(key)) return memCache.get(key)!;
  const sessioned = readSession(key);
  if (sessioned) { memCache.set(key, sessioned); return sessioned; }
  if (inflight.has(key)) return inflight.get(key)!;

  // Try instant dict first
  const dictHit = translate(text, lang);
  if (dictHit !== text) {
    memCache.set(key, dictHit);
    writeSession(key, dictHit);
    return dictHit;
  }

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
  const p = fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("translate failed"))))
    .then((data: unknown) => {
      // Response shape: [[[translated, original, ...], ...], ...]
      const arr = data as [Array<[string, string]>] | unknown;
      let translated = "";
      if (Array.isArray(arr) && Array.isArray(arr[0])) {
        for (const seg of arr[0] as Array<[string, string]>) {
          if (Array.isArray(seg) && typeof seg[0] === "string") translated += seg[0];
        }
      }
      const final = translated || text;
      memCache.set(key, final);
      writeSession(key, final);
      return final;
    })
    .catch(() => text)
    .finally(() => { inflight.delete(key); });

  inflight.set(key, p);
  return p;
}

/** React hook: returns translated text, falls back to original while loading. */
export function useTranslated(text: string | undefined | null, lang: LangCode): string {
  const safe = text ?? "";
  const [out, setOut] = useState<string>(() => translate(safe, lang));

  useEffect(() => {
    if (!safe || lang === "en") { setOut(safe); return; }
    const dictHit = translate(safe, lang);
    setOut(dictHit); // optimistic
    let cancelled = false;
    translateAsync(safe, lang).then((t) => { if (!cancelled) setOut(t); });
    return () => { cancelled = true; };
  }, [safe, lang]);

  return out;
}

/** Translate an array of strings reactively. */
export function useTranslatedList(texts: string[], lang: LangCode): string[] {
  const [out, setOut] = useState<string[]>(() => texts.map((t) => translate(t, lang)));

  useEffect(() => {
    if (lang === "en") { setOut(texts); return; }
    setOut(texts.map((t) => translate(t, lang))); // optimistic
    let cancelled = false;
    Promise.all(texts.map((t) => translateAsync(t, lang))).then((results) => {
      if (!cancelled) setOut(results);
    });
    return () => { cancelled = true; };
  }, [texts.join("¦"), lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return out;
}
