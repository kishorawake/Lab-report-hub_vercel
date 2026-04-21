import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, FileText, X, Sparkles } from "lucide-react";
import ProcessingPipeline from "./ProcessingPipeline";
import { extractTextFromFile } from "@/services/fileExtractor";

interface UploadSectionProps {
  onFileProcessed: (text: string) => void;
  onUseDemoData: () => void;
  isProcessing: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const UploadSection = ({ onFileProcessed, onUseDemoData, isProcessing }: UploadSectionProps) => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [progressPct, setProgressPct] = useState<number>(0);
  const [extracting, setExtracting] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);

    if (file.size > MAX_FILE_SIZE) {
      setError("File size exceeds 10MB limit.");
      setFileName(null);
      return;
    }

    const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp", "text/plain", "text/csv"];
    const okExt = /\.(pdf|png|jpe?g|webp|txt|csv)$/i.test(file.name);
    if (!validTypes.includes(file.type) && !okExt) {
      setError("Unsupported file type. Please upload PDF, image, or text file.");
      setFileName(null);
      return;
    }

    try {
      setExtracting(true);
      setProgressMsg("Preparing file…");
      setProgressPct(2);
      const text = await extractTextFromFile(file, (msg, pct) => {
        setProgressMsg(msg);
        if (typeof pct === "number") setProgressPct(pct);
      });
      setExtracting(false);
      onFileProcessed(text || "");
    } catch (e) {
      setExtracting(false);
      setError(e instanceof Error ? e.message : "Failed to read file. Please try again.");
      setFileName(null);
    }
  }, [onFileProcessed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [processFile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      processFile(e.target.files[0]);
    }
  };

  const busy = isProcessing || extracting;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="panel-card p-8 relative overflow-hidden shimmer"
    >
      <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />

      <div
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 relative z-10 ${
          dragActive ? "border-primary bg-primary/5 shadow-glow" : "border-border hover:border-primary/50 hover:bg-secondary/30"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        {busy ? (
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-full max-w-xs mx-auto">
              <p className="text-sm font-semibold text-foreground mb-2 text-center">
                {extracting ? (progressMsg || "Reading your report…") : "Analyzing your lab report..."}
              </p>
              {extracting && (
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mb-3">
                  <motion.div
                    className="h-full hero-gradient"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ ease: "easeOut", duration: 0.3 }}
                  />
                </div>
              )}
              <ProcessingPipeline />
            </div>
          </motion.div>
        ) : fileName ? (
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-3">
            <motion.div
              className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center"
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <FileText className="w-7 h-7 text-primary" />
            </motion.div>
            <p className="text-sm font-medium text-foreground">{fileName}</p>
            <button onClick={() => { setFileName(null); setError(null); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <X className="w-3 h-3" /> Remove
            </button>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <motion.div
              className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Upload className="w-8 h-8 text-primary" />
            </motion.div>
            <div>
              <p className="text-sm font-medium text-foreground">Drop your lab report here</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, image, or text file (max 10MB)</p>
            </div>
            <label>
              <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv" onChange={handleChange} />
              <motion.span
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl hero-gradient text-primary-foreground text-sm font-medium cursor-pointer shadow-hero transition-shadow hover:shadow-glow"
              >
                <Upload className="w-4 h-4" />
                Choose File
              </motion.span>
            </label>
          </div>
        )}
      </div>

      {error && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-status-critical mt-3 text-center">
          {error}
        </motion.p>
      )}

      <div className="mt-5 text-center relative z-10">
        <motion.button
          onClick={onUseDemoData}
          disabled={isProcessing}
          whileHover={{ scale: 1.03 }}
          className="text-sm text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Or try with sample lab report data →
        </motion.button>
      </div>
    </motion.div>
  );
};

export default UploadSection;
