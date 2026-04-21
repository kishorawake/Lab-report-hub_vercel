import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { useLang } from "@/contexts/LangContext";
import { useTranslated } from "@/services/translate";

interface OverallSummaryProps {
  totalTests: number;
  normalTests: number;
  abnormalTests: number;
  summary: string;
  panelCount: number;
}

const AnimatedNumber = ({ value, delay }: { value: number; delay: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 15 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.5, type: "spring" }}
      className="text-2xl font-display font-bold"
    >
      {value}
    </motion.div>
  );
};

interface FlipTileProps {
  value: number;
  label: string;
  delay: number;
  colorClass: string;
  textColor: string;
  back: string;
  onClick: () => void;
}

const FlipTile = ({ value, label, delay, colorClass, textColor, back, onClick }: FlipTileProps) => {
  const { lang } = useLang();
  const tBack = useTranslated(back, lang);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      className="group relative h-[80px] w-full rounded-xl [transform-style:preserve-3d] transition-transform duration-500 hover:[transform:rotateY(180deg)] focus:outline-none focus:ring-2 focus:ring-primary/50"
      aria-label={`${label}: ${value}. ${back}`}
    >
      <div className={`absolute inset-0 ${colorClass} rounded-xl p-3 flex flex-col items-center justify-center [backface-visibility:hidden]`}>
        <div className={textColor}>
          <AnimatedNumber value={value} delay={delay} />
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
      <div className={`absolute inset-0 ${colorClass} rounded-xl p-3 flex items-center justify-center [transform:rotateY(180deg)] [backface-visibility:hidden]`}>
        <span className={`text-xs font-semibold ${textColor} text-center leading-tight`}>{tBack} →</span>
      </div>
    </motion.button>
  );
};

const OverallSummary = ({ totalTests, normalTests, abnormalTests, summary, panelCount }: OverallSummaryProps) => {
  const { lang } = useLang();
  const tTitle = useTranslated("Overall Summary", lang);
  const tDetected = useTranslated("Test panels detected", lang);
  const tTotal = useTranslated("Total Tests", lang);
  const tNormal = useTranslated("Normal", lang);
  const tNeed = useTranslated("Need Attention", lang);
  const tSummary = useTranslated(summary, lang);

  const scrollTo = (id: string) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-2", "ring-primary/60", "rounded-2xl");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary/60", "rounded-2xl"), 1600);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2, duration: 0.5 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="panel-card p-6 gradient-border"
    >
      <h3 className="font-display text-lg font-semibold text-foreground mb-4">{tTitle}</h3>
      <div className="text-sm text-muted-foreground mb-4">{tDetected}: {panelCount}</div>

      <div className="grid grid-cols-3 gap-3 mb-5 [perspective:1000px]">
        <FlipTile value={totalTests} label={tTotal} delay={0.4} colorClass="bg-secondary" textColor="text-foreground" back="View panels" onClick={() => scrollTo("panels-section")} />
        <FlipTile value={normalTests} label={tNormal} delay={0.6} colorClass="bg-status-normal/10" textColor="text-status-normal" back="See details" onClick={() => scrollTo("panels-section")} />
        <FlipTile value={abnormalTests} label={tNeed} delay={0.8} colorClass="bg-status-critical/10" textColor="text-status-critical" back="View findings" onClick={() => scrollTo("findings-section")} />
      </div>

      <p className="text-sm text-foreground/80 leading-relaxed">{tSummary}</p>
    </motion.div>
  );
};

export default OverallSummary;
