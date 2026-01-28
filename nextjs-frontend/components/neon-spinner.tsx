import { motion } from "framer-motion";

export function NeonSpinner() {
  return (
    <div className="relative h-10 w-10">
      <motion.div
        className="absolute inset-0 rounded-full border border-white/10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-300 border-r-violet-400 shadow-neonSm"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-1 rounded-full bg-gradient-to-br from-indigo-500/20 via-violet-500/10 to-cyan-400/10 blur"
        animate={{ opacity: [0.35, 0.7, 0.35] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
      />
    </div>
  );
}
