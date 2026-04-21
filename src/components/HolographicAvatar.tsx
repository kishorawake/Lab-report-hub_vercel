import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  Volume2,
  VolumeX,
  Play,
  MessageSquare,
  Zap,
  Shield,
  Activity,
} from "lucide-react";
import aiDoctorAvatar from "@/assets/ai-doctor-avatar.png";
import aiDoctorPortrait from "@/assets/ai-doctor.png";
import type { AnalysisResult } from "@/services/labAnalyzer";
import { LANGUAGES, type LangCode, translate, translateAsync, getBcp47 } from "@/services/translate";
import { useLang } from "@/contexts/LangContext";
import { getTtsAudioUrl } from "@/services/ttsCache";
import { useIsMobile } from "@/hooks/use-mobile";

/* ─── types ─── */
interface HolographicAvatarProps {
  results: AnalysisResult;
}

type SummaryMode = "full" | "critical" | "lifestyle";

/* ─── message generator (same logic, HIPAA-safe) ─── */
function generateMessages(results: AnalysisResult, mode: SummaryMode): string[] {
  const msgs: string[] = [];
  const { healthScore, abnormalTests, totalTests, tests, recommendedActions } = results;

  if (mode === "critical") {
    const criticalTests = tests.filter((t) => t.status.includes("critical"));
    if (criticalTests.length === 0) {
      msgs.push("Great news — no critical findings in your report! All values are within safe ranges.");
    } else {
      msgs.push(`⚠️ You have ${criticalTests.length} critical findings that need immediate attention.`);
      criticalTests.forEach((t) => {
        msgs.push(
          `🔴 ${t.name}: ${t.rawValue} — critically ${t.status.includes("high") ? "high" : "low"} (normal: ${t.normalRange}). See a doctor right away.`
        );
      });
    }
    // Always include recommended actions in narration
    if (recommendedActions?.length) {
      msgs.push("Here are the recommended next steps:");
      recommendedActions.forEach((a) => {
        msgs.push(`Step ${a.step}: ${a.title}. ${a.description}`);
      });
    }
    return msgs;
  }

  if (mode === "lifestyle") {
    msgs.push("Here are some lifestyle tips based on your results:");
    if (tests.some((t) => t.panel === "Blood Sugar" && t.status !== "normal"))
      msgs.push("🍎 Your blood sugar needs attention. Reduce refined carbs, increase fiber, and walk after meals.");
    if (tests.some((t) => t.panel === "Lipid Profile" && t.status !== "normal"))
      msgs.push("❤️ Focus on heart health: healthy fats, omega-3 foods, and 30 min exercise daily.");
    if (tests.some((t) => t.name === "Iron" && t.status !== "normal"))
      msgs.push("🥬 Boost iron with spinach, lentils, and vitamin C for better absorption.");
    if (tests.some((t) => t.panel === "Electrolytes" && t.status !== "normal"))
      msgs.push("💧 Stay hydrated — bananas, coconut water, and leafy greens help electrolyte balance.");
    if (msgs.length === 1) msgs.push("✅ Results look good! Keep up balanced diet, exercise, and sleep.");
    if (recommendedActions?.length) {
      msgs.push("And here are the recommended next steps:");
      recommendedActions.forEach((a) => {
        msgs.push(`Step ${a.step}: ${a.title}. ${a.description}`);
      });
    }
    return msgs;
  }

  if (healthScore >= 80) msgs.push("Great news! Your overall health looks really good. Let me walk you through.");
  else if (healthScore >= 60) msgs.push("Most things look fine, but there are a few areas that need attention.");
  else msgs.push("I need to flag some important findings. Please review carefully and consult your doctor soon.");

  msgs.push(
    `I analyzed ${totalTests} tests across ${results.panels.length} panels. ${results.normalTests} normal, ${abnormalTests} need attention.`
  );

  const criticalTests = tests.filter((t) => t.status.includes("critical"));
  const slightlyOff = tests.filter((t) => t.status.includes("slightly"));
  if (criticalTests.length > 0)
    msgs.push(`⚠️ Critical: ${criticalTests.map((t) => t.name).join(", ")} — need immediate medical attention.`);
  if (slightlyOff.length > 0)
    msgs.push(`${slightlyOff.map((t) => t.name).join(", ")} are slightly outside normal — worth monitoring.`);

  if (recommendedActions?.length) {
    msgs.push("Here are the recommended next steps for you:");
    recommendedActions.forEach((a) => {
      msgs.push(`Step ${a.step}: ${a.title}. ${a.description}`);
    });
  }

  msgs.push("Scroll down for detailed panels, recommendations, and doctor advice. I'm AI — not a replacement for your doctor! 😊");
  return msgs;
}

const modeConfig: Record<SummaryMode, { label: string; icon: typeof Zap }> = {
  full: { label: "Full Summary", icon: Activity },
  critical: { label: "Critical Only", icon: Shield },
  lifestyle: { label: "Lifestyle Tips", icon: Sparkles },
};

/* ─── Holographic Particles ─── */
const HoloParticles = ({ count = 12 }: { count?: number }) => {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${10 + Math.random() * 80}%`,
        delay: Math.random() * 3,
        duration: 2 + Math.random() * 2,
        size: 2 + Math.random() * 3,
      })),
    [count]
  );

  return (
    <>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="holo-particle"
          style={{ left: p.left, bottom: "10%", width: p.size, height: p.size }}
          animate={{
            y: [0, -30, -60],
            x: [0, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10],
            opacity: [0, 0.7, 0],
            scale: [0, 1, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </>
  );
};

/* ─── Data stream lines ─── */
const DataStreams = () => (
  <>
    {[15, 35, 65, 85].map((left, i) => (
      <div
        key={i}
        className="holo-data-stream"
        style={{ left: `${left}%`, animationDelay: `${i * 0.5}s`, opacity: 0.3 }}
      />
    ))}
  </>
);

/* ─── Holographic Ring ─── */
const HoloRing = ({ delay = 0 }: { delay?: number }) => (
  <div className="holo-ring" style={{ animationDelay: `${delay}s` }} />
);

/* ─── MAIN COMPONENT ─── */
const HolographicAvatar = ({ results }: HolographicAvatarProps) => {
  const [mode, setMode] = useState<SummaryMode>("full");
  const { lang, setLang } = useLang();
  const isMobile = useIsMobile();
  const baseMessages = useMemo(() => generateMessages(results, mode), [results, mode]);
  // Optimistic sync translation, then upgrade asynchronously via Google Translate.
  const [messages, setMessages] = useState<string[]>(() => baseMessages.map((m) => translate(m, lang)));
  useEffect(() => {
    setMessages(baseMessages.map((m) => translate(m, lang)));
    if (lang === "en") return;
    let cancelled = false;
    Promise.all(baseMessages.map((m) => translateAsync(m, lang))).then((res) => {
      if (!cancelled) setMessages(res);
    });
    return () => { cancelled = true; };
  }, [baseMessages, lang]);
  const [currentMsg, setCurrentMsg] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);
  const [displayedText, setDisplayedText] = useState("");
  // Audio is OPT-IN (muted by default). Toggling unmute primes the speech engine.
  const [isMuted, setIsMuted] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isProjected, setIsProjected] = useState(false);
  const [sparkBurst, setSparkBurst] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakTokenRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* Projection animation on mount */
  useEffect(() => {
    const timer = setTimeout(() => setIsProjected(true), 300);
    return () => clearTimeout(timer);
  }, []);

  /* Preload voices (Chrome loads them asynchronously — first call often fails silently) */
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const prime = () => synth.getVoices();
    prime();
    synth.addEventListener?.("voiceschanged", prime);
    return () => synth.removeEventListener?.("voiceschanged", prime);
  }, []);

  /* GSAP glow pulse on avatar */
  useEffect(() => {
    if (!avatarRef.current) return;
    if (isMobile) return;
    const ctx = gsap.context(() => {
      gsap.to(avatarRef.current, {
        boxShadow: isSpeaking
          ? "0 0 40px hsl(185 85% 60% / 0.6), 0 0 80px hsl(185 85% 60% / 0.3)"
          : "0 0 20px hsl(185 85% 60% / 0.3), 0 0 40px hsl(185 85% 60% / 0.1)",
        duration: 0.6,
        ease: "power2.out",
      });
    });
    return () => ctx.revert();
  }, [isSpeaking, isMobile]);

  /* Reset msg index on mode change */
  useEffect(() => setCurrentMsg(0), [mode]);

  /* Show full message instantly */
  useEffect(() => {
    setDisplayedText(messages[currentMsg] ?? "");
  }, [currentMsg, messages]);

  /* Robust TTS — cancels previous utterance, uses token to ignore stale callbacks */
  const stopSpeaking = useCallback(() => {
    speakTokenRef.current += 1;
    if (typeof window !== "undefined") {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* noop */
      }
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = "";
      } catch {
        /* noop */
      }
      audioRef.current = null;
    }
    utteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  /* Pick the most natural-sounding female voice for a language. */
  const pickFemaleVoice = useCallback(
    (voices: SpeechSynthesisVoice[], targetLang: string): SpeechSynthesisVoice | undefined => {
      const prefix = targetLang.split("-")[0].toLowerCase();
      const matches = voices.filter(
        (v) =>
          v.lang?.toLowerCase() === targetLang.toLowerCase() ||
          v.lang?.toLowerCase().startsWith(prefix)
      );
      if (matches.length === 0) return undefined;

      const femaleHints = /female|woman|samantha|victoria|karen|tessa|moira|fiona|zira|hazel|susan|allison|ava|serena|kate|google\s+(uk|us)\s+english\s+female|aditi|raveena|swara|priya|kalpana|lekha/i;
      const maleHints = /male|man|david|mark|alex|fred|daniel|oliver|guy|george|ravi|hemant/i;

      const female = matches.find((v) => femaleHints.test(v.name));
      if (female) return female;
      const notMale = matches.find((v) => !maleHints.test(v.name));
      return notMale ?? matches[0];
    },
    []
  );

  /* Server-proxied Google TTS — bypasses browser CORS/referrer blocks.
     Splits long text into <=180 char chunks and plays them sequentially. */
  const speakViaGoogle = useCallback((text: string, langCode: LangCode, token: number) => {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.?!।])\s+/);
    let buf = "";
    for (const s of sentences) {
      if ((buf + " " + s).trim().length > 180) {
        if (buf) chunks.push(buf.trim());
        if (s.length > 180) {
          for (let i = 0; i < s.length; i += 180) chunks.push(s.slice(i, i + 180));
          buf = "";
        } else buf = s;
      } else {
        buf = (buf + " " + s).trim();
      }
    }
    if (buf) chunks.push(buf.trim());
    if (chunks.length === 0) return;

    const tl = langCode === "en" ? "en" : langCode;
    let idx = 0;

    if (token === speakTokenRef.current) setIsSpeaking(true);

    const playNext = async () => {
      if (token !== speakTokenRef.current) return;
      if (idx >= chunks.length) {
        if (token === speakTokenRef.current) setIsSpeaking(false);
        return;
      }
      const chunk = chunks[idx++];
      // Try IndexedDB cache first; falls back to direct /api/tts URL on failure
      const { url, revoke } = await getTtsAudioUrl(chunk, tl);
      if (token !== speakTokenRef.current) {
        if (revoke) URL.revokeObjectURL(url);
        return;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      const cleanup = () => { if (revoke) URL.revokeObjectURL(url); };
      audio.onended = () => { cleanup(); playNext(); };
      audio.onerror = (e) => {
        console.warn("[TTS] audio error for chunk:", chunk.slice(0, 40), e);
        cleanup();
        playNext();
      };
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch((err) => {
          console.warn("[TTS] play() rejected:", err?.message || err);
          if (token === speakTokenRef.current) setIsSpeaking(false);
        });
      }
    };
    playNext();
  }, []);

  const speak = useCallback((text: string, langCode: LangCode) => {
    if (typeof window === "undefined" || !text) return;
    const synth = window.speechSynthesis;
    speakTokenRef.current += 1;
    const myToken = speakTokenRef.current;
    try {
      synth?.cancel();
    } catch {
      /* noop */
    }
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* noop */ }
      audioRef.current = null;
    }

    const cleanText = text.replace(/[⚠️🔴🍎❤️🥬💧✅😊◉◎◈]/g, "").trim();
    if (!cleanText) return;

    const targetLang = getBcp47(langCode);
    const voices = synth?.getVoices() ?? [];
    const femaleVoice = pickFemaleVoice(voices, targetLang);

    // For Indic languages, ALWAYS prefer Google TTS — browser native Indic voices
    // are rare and often robotic/male. Google gives consistent natural female tone.
    const isIndic = langCode !== "en";
    if (isIndic || !synth) {
      speakViaGoogle(cleanText, langCode, myToken);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    // Calm, formal, human female tone
    utterance.rate = 0.92;
    utterance.pitch = 1.1;
    utterance.volume = 1;
    utterance.lang = targetLang;
    if (femaleVoice) utterance.voice = femaleVoice;

    utterance.onstart = () => {
      if (myToken === speakTokenRef.current) setIsSpeaking(true);
    };
    utterance.onend = () => {
      if (myToken === speakTokenRef.current) setIsSpeaking(false);
    };
    utterance.onerror = () => {
      if (myToken === speakTokenRef.current) {
        speakViaGoogle(cleanText, langCode, speakTokenRef.current);
      }
    };
    utteranceRef.current = utterance;

    try {
      synth.speak(utterance);
    } catch {
      speakViaGoogle(cleanText, langCode, speakTokenRef.current);
    }
  }, [speakViaGoogle, pickFemaleVoice]);

  /* Cleanup any ongoing speech on unmount */
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, [stopSpeaking]);

  const toggleMute = () => {
    if (!isMuted) {
      stopSpeaking();
      setIsMuted(true);
    } else {
      // Prime BOTH audio engines synchronously inside the user gesture.
      if (typeof window !== "undefined" && window.speechSynthesis) {
        try {
          const ping = new SpeechSynthesisUtterance(" ");
          ping.volume = 0;
          window.speechSynthesis.speak(ping);
        } catch { /* noop */ }
      }
      // Prime HTMLAudioElement so subsequent .play() calls work for Indic TTS
      try {
        const primer = new Audio();
        primer.muted = true;
        primer.src = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA";
        primer.play().catch(() => { /* noop */ });
      } catch { /* noop */ }
      setIsMuted(false);
      // Speak immediately within gesture context (no setTimeout — that breaks gesture)
      speak(messages[currentMsg] ?? "", lang);
    }
    setSparkBurst((n) => n + 1);
  };

  const handleReplay = () => {
    setSparkBurst((n) => n + 1);
    speak(messages[currentMsg] ?? "", lang);
  };

  const goToMsg = (i: number) => {
    setCurrentMsg(i);
    setSparkBurst((n) => n + 1);
    if (!isMuted) speak(messages[i] ?? "", lang);
  };

  // Re-speak current message when language changes (if unmuted)
  useEffect(() => {
    if (!isMuted) {
      const t = setTimeout(() => speak(messages[currentMsg] ?? "", lang), 150);
      return () => clearTimeout(t);
    }
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="lg:sticky lg:top-24 holo-container"
    >
      {/* ─── Hologram Card ─── */}
      <div className="relative rounded-2xl overflow-hidden holo-glow">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-holo/5 via-transparent to-holo/10 pointer-events-none" />

        {/* Scan lines overlay */}
        <div className="holo-scanlines rounded-2xl" />

        {/* Data streams */}
        {!isMobile && <DataStreams />}

        <div className="relative z-10 p-5">
          {/* ─── Avatar Section ─── */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              {/* Orbital rings */}
              {!isMobile && <HoloRing />}
              {!isMobile && <HoloRing delay={4} />}

              {/* Avatar figure */}
              <motion.div
                ref={avatarRef}
                className={`relative w-16 h-16 rounded-full overflow-hidden holo-figure ${!isProjected ? "projecting" : ""}`}
                animate={
                  isSpeaking
                    ? { y: [0, -3, 0, -2, 0], scale: [1, 1.02, 1] }
                    : { y: [0, -4, 0] }
                }
                transition={
                  isSpeaking
                    ? { duration: 0.5, repeat: Infinity }
                    : { duration: 4, repeat: Infinity, ease: "easeInOut" }
                }
              >
                <img
                  src={aiDoctorAvatar}
                  alt="Holographic AI Doctor"
                  className="w-full h-full object-cover"
                  style={{ filter: "saturate(0.7) brightness(1.2) hue-rotate(10deg)" }}
                  width={512}
                  height={512}
                />

                {/* Hologram color tint */}
                <div className="absolute inset-0 bg-holo/20 mix-blend-overlay" />

                {/* Lip-sync overlay (active while speaking) */}
                {isSpeaking && <div className="holo-lip-overlay" />}

                {/* Scanlines on avatar */}
                <div className="holo-scanlines" />
              </motion.div>

              {/* Status indicator */}
              <motion.div
                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-background"
                style={{ backgroundColor: "hsl(var(--holo-primary))" }}
                animate={
                  isSpeaking
                    ? { scale: [1, 1.5, 1], boxShadow: ["0 0 0 0 hsl(185 85% 60% / 0)", "0 0 12px 4px hsl(185 85% 60% / 0.5)", "0 0 0 0 hsl(185 85% 60% / 0)"] }
                    : { scale: [1, 1.2, 1] }
                }
                transition={{ duration: isSpeaking ? 0.6 : 2, repeat: Infinity }}
              />

              {/* Particles around avatar */}
              {!isMobile && <HoloParticles count={8} />}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-display font-bold text-sm text-holo">Dr. AI</span>
                <motion.div
                  animate={{ rotate: [0, 180, 360] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="w-3.5 h-3.5 text-holo" />
                </motion.div>
              </div>
              <span className="text-[10px] text-holo/60 font-mono tracking-wider">
                {isSpeaking ? "◉ TRANSMITTING..." : "◎ HOLOGRAM ACTIVE"}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={toggleMute}
                className="p-1.5 rounded-lg hover:bg-holo/10 transition-colors"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-holo/50" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-holo" />
                )}
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-lg hover:bg-holo/10 transition-colors"
              >
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-holo/50" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-holo/50" />
                )}
              </button>
            </div>
          </div>

          {/* ─── Expanded Content ─── */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              >
                {/* Language Selector */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[9px] uppercase tracking-wider text-holo/50 font-mono">Voice</span>
                  <div className="flex gap-1 flex-1 bg-holo/5 border border-holo/10 rounded-lg p-0.5">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => setLang(l.code)}
                        title={`Narrate in ${l.label}`}
                        className={`flex-1 text-[9px] font-medium py-1 px-1 rounded-md transition-all ${
                          lang === l.code
                            ? "bg-holo/20 text-holo shadow-[0_0_8px_hsl(185_85%_60%/0.25)]"
                            : "text-holo/40 hover:text-holo/70"
                        }`}
                      >
                        {l.native}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode Switcher */}
                <div className="flex gap-1 mb-3 bg-holo/5 border border-holo/10 rounded-lg p-0.5">
                  {(Object.keys(modeConfig) as SummaryMode[]).map((m) => {
                    const Icon = modeConfig[m].icon;
                    return (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`flex-1 text-[9px] font-medium py-1.5 px-1.5 rounded-md transition-all flex items-center justify-center gap-1 ${
                          mode === m
                            ? "bg-holo/20 text-holo shadow-[0_0_12px_hsl(185_85%_60%/0.2)]"
                            : "text-holo/40 hover:text-holo/70"
                        }`}
                      >
                        <Icon className="w-2.5 h-2.5" />
                        {modeConfig[m].label}
                      </button>
                    );
                  })}
                </div>

                {/* Subtitle / Chat Bubble — animated gradient sweep + sparkle burst */}
                <motion.div
                  key={`${mode}-${currentMsg}`}
                  initial={{ opacity: 0, y: 8, scale: 0.96, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="relative holo-subtitle-bar rounded-xl rounded-tl-sm p-3.5 mb-3 overflow-hidden"
                >
                  <motion.div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(110deg, transparent 30%, hsl(185 85% 60% / 0.18) 50%, transparent 70%)",
                    }}
                    animate={{ x: ["-100%", "120%"] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
                  />
                  <AnimatePresence>
                    {[...Array(6)].map((_, i) => (
                      <motion.span
                        key={`spark-${sparkBurst}-${i}`}
                        className="absolute w-1 h-1 rounded-full bg-holo pointer-events-none"
                        style={{ left: `${20 + i * 12}%`, top: "50%" }}
                        initial={{ opacity: 0, scale: 0, y: 0 }}
                        animate={{
                          opacity: [0, 1, 0],
                          scale: [0, 1.4, 0],
                          y: [0, -16 - i * 2, -28],
                          x: [(i - 3) * 4, (i - 3) * 8],
                        }}
                        transition={{ duration: 0.9, delay: i * 0.04, ease: "easeOut" }}
                      />
                    ))}
                  </AnimatePresence>
                  {showSubtitles && (
                    <p className="relative text-xs text-holo/90 leading-relaxed min-h-[3rem] font-light">
                      {displayedText}
                      {isSpeaking && (
                        <span className="inline-flex gap-0.5 ml-1.5 align-middle">
                          {[0, 1, 2].map((i) => (
                            <motion.span
                              key={i}
                              className="inline-block w-1 h-1 rounded-full bg-holo"
                              animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }}
                            />
                          ))}
                        </span>
                      )}
                    </p>
                  )}
                </motion.div>

                {/* Navigation */}
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {messages.map((_, i) => (
                      <motion.button
                        key={i}
                        onClick={() => goToMsg(i)}
                        whileHover={{ scale: 1.3 }}
                        whileTap={{ scale: 0.85 }}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          i === currentMsg
                            ? "w-5 bg-holo shadow-[0_0_8px_hsl(185_85%_60%/0.5)]"
                            : "w-1.5 bg-holo/20 hover:bg-holo/40"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <motion.button
                      onClick={handleReplay}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-holo/10 hover:bg-holo/20 text-holo transition-colors flex items-center gap-1"
                      title={isMuted ? "Unmute first to hear audio" : "Replay narration"}
                    >
                      <Play className="w-2.5 h-2.5" />
                      Replay
                    </motion.button>
                    <motion.button
                      onClick={() => goToMsg(Math.max(0, currentMsg - 1))}
                      disabled={currentMsg === 0}
                      whileHover={{ scale: 1.08, x: -2 }}
                      whileTap={{ scale: 0.92 }}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-holo/5 hover:bg-holo/10 text-holo/60 disabled:opacity-30 transition-colors"
                    >
                      Prev
                    </motion.button>
                    <motion.button
                      onClick={() => goToMsg(Math.min(messages.length - 1, currentMsg + 1))}
                      disabled={currentMsg === messages.length - 1}
                      whileHover={{ scale: 1.08, x: 2 }}
                      whileTap={{ scale: 0.92 }}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-holo/10 hover:bg-holo/20 text-holo disabled:opacity-30 transition-colors"
                    >
                      Next
                    </motion.button>
                  </div>
                </div>

                {/* Subtitle toggle */}
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-holo/10">
                  <button
                    onClick={() => setShowSubtitles(!showSubtitles)}
                    className={`text-[9px] px-2 py-0.5 rounded-md transition-colors flex items-center gap-1 ${
                      showSubtitles ? "bg-holo/15 text-holo" : "bg-holo/5 text-holo/40"
                    }`}
                  >
                    <MessageSquare className="w-2.5 h-2.5" />
                    Subtitles
                  </button>
                  <span className="text-[8px] text-holo/30 font-mono ml-auto">HIPAA-ALIGNED • NO PHI STORED</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Particles in card background */}
        {!isMobile && <HoloParticles count={6} />}
      </div>

      {/* ─── Quick Stats (holographic style) ─── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="mt-3 rounded-xl p-4 space-y-2.5 relative overflow-hidden holo-glow"
      >
        <div className="holo-scanlines rounded-xl" style={{ opacity: 0.3 }} />
        <div className="relative z-10">
          <h4 className="text-[10px] uppercase tracking-widest font-bold text-holo/60 font-mono">
            ◈ Quick Summary
          </h4>
          <div className="space-y-2 mt-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-holo/50">Health Score</span>
              <span
                className={`text-xs font-bold font-mono ${
                  results.healthScore >= 80
                    ? "text-status-normal"
                    : results.healthScore >= 60
                    ? "text-status-attention"
                    : "text-status-critical"
                }`}
              >
                {results.healthScore}/100
              </span>
            </div>
            <div className="w-full h-1.5 bg-holo/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${results.healthScore}%` }}
                transition={{ duration: 1.5, ease: "easeOut", delay: 1.5 }}
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, hsl(var(--holo-primary)), hsl(var(--holo-accent)))`,
                  boxShadow: "0 0 12px hsl(var(--holo-primary) / 0.5)",
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="text-center p-2 rounded-lg bg-status-normal/10 border border-status-normal/20">
              <div className="text-sm font-bold text-status-normal font-mono">{results.normalTests}</div>
              <div className="text-[9px] text-holo/40">Normal</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-status-critical/10 border border-status-critical/20">
              <div className="text-sm font-bold text-status-critical font-mono">{results.abnormalTests}</div>
              <div className="text-[9px] text-holo/40">Flagged</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ─── AI Doctor Portrait with Halo + Aura ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.4, duration: 0.8, ease: "easeOut" }}
        className="mt-4 relative flex items-end justify-center overflow-hidden rounded-2xl"
        style={{ minHeight: 320 }}
      >
        {/* Soft radial aura background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 65%, hsl(var(--holo-primary) / 0.35) 0%, hsl(var(--holo-accent) / 0.18) 35%, transparent 70%)",
          }}
        />

        {/* Pulsing aura rings */}
        <motion.div
          className="absolute left-1/2 top-[18%] -translate-x-1/2 rounded-full"
          style={{
            width: 180,
            height: 180,
            background:
              "radial-gradient(circle, hsl(var(--holo-primary) / 0.45), transparent 65%)",
            filter: "blur(18px)",
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.95, 0.6] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute left-1/2 top-[14%] -translate-x-1/2 rounded-full border-2"
          style={{
            width: 160,
            height: 160,
            borderColor: "hsl(var(--holo-accent) / 0.5)",
            boxShadow:
              "0 0 30px hsl(var(--holo-primary) / 0.6), inset 0 0 25px hsl(var(--holo-accent) / 0.4)",
          }}
          animate={{ scale: [1, 1.08, 1], rotate: [0, 360] }}
          transition={{
            scale: { duration: 4, repeat: Infinity, ease: "easeInOut" },
            rotate: { duration: 22, repeat: Infinity, ease: "linear" },
          }}
        />
        <motion.div
          className="absolute left-1/2 top-[10%] -translate-x-1/2 rounded-full border"
          style={{
            width: 200,
            height: 200,
            borderColor: "hsl(var(--holo-primary) / 0.35)",
          }}
          animate={{ scale: [1, 1.18, 1], opacity: [0.7, 0.2, 0.7] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Floating particles */}
        {!isMobile && <HoloParticles count={14} />}

        {/* The doctor portrait — gentle float */}
        <motion.img
          src={aiDoctorPortrait}
          alt="AI Doctor"
          className="relative z-10 max-h-[300px] w-auto object-contain"
          style={{
            filter:
              "drop-shadow(0 0 18px hsl(var(--holo-primary) / 0.55)) drop-shadow(0 8px 22px hsl(var(--holo-accent) / 0.35))",
          }}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Bottom holo platform glow */}
        <motion.div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full"
          style={{
            width: 180,
            height: 18,
            background:
              "radial-gradient(ellipse, hsl(var(--holo-primary) / 0.7), transparent 70%)",
            filter: "blur(6px)",
          }}
          animate={{ opacity: [0.5, 0.9, 0.5], scaleX: [1, 1.1, 1] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

    </motion.div>
  );
};

export default HolographicAvatar;
