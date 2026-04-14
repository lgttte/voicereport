"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { HardHat, LayoutDashboard, ArrowRight, Lock, Mic } from "lucide-react";

// ── Animation variants ────────────────────────────────────────────────────────

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const fadeDown = {
  hidden: { opacity: 0, y: -16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.25 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

// ── RoleCard ──────────────────────────────────────────────────────────────────

type RoleCardProps = {
  onClick: () => void;
  icon: React.ReactNode;
  iconBg: string;
  iconGlow: string;
  borderHover: string;
  glowColor: string;
  label: string;
  description: string;
};

function RoleCard({
  onClick, icon, iconBg, iconGlow, borderHover, glowColor,
  label, description,
}: RoleCardProps) {
  return (
    <motion.button
      type="button"
      variants={cardVariant}
      onClick={onClick}
      whileHover={{ y: -6, transition: { duration: 0.25, ease: "easeOut" } }}
      whileTap={{ scale: 0.98 }}
      className={`
        group relative flex flex-col items-center text-center gap-4 p-5 sm:p-7 w-full
        rounded-2xl border border-white/10 ${borderHover}
        bg-white/[0.04] backdrop-blur-lg
        transition-colors duration-300 cursor-pointer outline-none
        focus-visible:ring-2 focus-visible:ring-white/30
        overflow-hidden
      `}
    >
      {/* Card inner glow on hover */}
      <div className={`pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${glowColor}`} />

      {/* Icon circle */}
      <div className={`relative w-16 h-16 rounded-2xl ${iconBg} flex items-center justify-center shadow-lg ${iconGlow} transition-shadow duration-300 group-hover:scale-105 group-hover:transition-transform`}>
        {icon}
      </div>

      {/* Text */}
      <div className="space-y-2">
        <p className="text-base font-bold text-white tracking-tight">{label}</p>
        <p className="text-xs text-slate-400 leading-relaxed max-w-[200px]">{description}</p>
      </div>

      <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors duration-300 group-hover:translate-x-1" />
    </motion.button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SplitScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const deviceId = localStorage.getItem("worker_device_id");
    if (deviceId) {
      router.replace("/record");
    } else {
      setChecking(false);
    }
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <main className="relative min-h-screen bg-slate-950 flex flex-col items-center justify-center px-5 py-8 overflow-hidden">

      {/* ── Ambient orbs ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Central violet halo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-violet-600/15 blur-[140px]" />
        {/* Blue accent top-left */}
        <div className="absolute -top-32 -left-20 w-[400px] h-[400px] rounded-full bg-sky-600/10 blur-[100px]" />
        {/* Indigo accent bottom-right */}
        <div className="absolute -bottom-32 -right-20 w-[400px] h-[400px] rounded-full bg-indigo-600/10 blur-[100px]" />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center">

        {/* ── Header ── */}
        <motion.div
          className="flex flex-col items-center text-center mb-8"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          {/* Logo */}
          <motion.div variants={fadeDown} className="mb-4">
            <div className="relative">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl"
                style={{
                  background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6d28d9 100%)",
                  boxShadow: "0 0 40px rgba(109, 40, 217, 0.45), 0 20px 40px rgba(0,0,0,0.4)",
                }}
              >
                <Mic className="w-7 h-7 text-white" />
              </div>
              {/* Online dot */}
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-400 border-2 border-slate-950 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
            </div>
          </motion.div>

          {/* Brand name */}
          <motion.h1
            variants={fadeDown}
            className="text-3xl sm:text-4xl font-black tracking-tight mb-2"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            VoiceReport
          </motion.h1>

          {/* Subtitle */}
          <motion.p variants={fadeDown} className="text-slate-400 text-sm sm:text-base font-medium max-w-xs">
            Comment utilisez-vous VoiceReport&nbsp;?
          </motion.p>

        </motion.div>

        {/* ── Role cards ── */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          <RoleCard
            onClick={() => router.push("/worker-onboarding")}
            icon={<HardHat className="w-9 h-9 text-sky-300" />}
            iconBg="bg-sky-500/15 border border-sky-500/25"
            iconGlow="shadow-sky-500/20"
            borderHover="hover:border-sky-500/45"
            glowColor="bg-gradient-to-b from-sky-500/5 to-transparent"
            label="Je suis sur le terrain"
            description="Dictez votre rapport de chantier en quelques secondes"
          />

          <RoleCard
            onClick={() => router.push("/login")}
            icon={<LayoutDashboard className="w-9 h-9 text-violet-300" />}
            iconBg="bg-violet-500/15 border border-violet-500/25"
            iconGlow="shadow-violet-500/20"
            borderHover="hover:border-violet-500/45"
            glowColor="bg-gradient-to-b from-violet-500/5 to-transparent"
            label="Je suis au bureau"
            description="Consultez et analysez les rapports de votre équipe"
          />
        </motion.div>

        {/* ── Footer ── */}
        <motion.div
          className="flex items-center gap-1.5 mt-6 text-slate-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.9, duration: 0.6 } }}
        >
          <Lock className="w-3 h-3" />
          <p className="text-xs">Vos données restent privées et sécurisées</p>
        </motion.div>
      </div>
    </main>
  );
}
