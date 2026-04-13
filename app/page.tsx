"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-sky-600/10 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo + heading */}
        <div className="flex flex-col items-center text-center mb-12">
          <div className="w-14 h-14 rounded-2xl bg-sky-600 flex items-center justify-center mb-5 shadow-lg shadow-sky-600/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
              <path d="M2 18h20" /><path d="M4 18a8 8 0 0 1 16 0" />
              <path d="M12 2v4" /><path d="M8 6l1 4" /><path d="M16 6l-1 4" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">VoiceReport</h1>
          <p className="text-lg text-slate-400 font-medium">Comment utilisez-vous VoiceReport&nbsp;?</p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => router.push("/worker-onboarding")}
            className="group flex flex-col items-center gap-4 rounded-2xl border border-slate-700/60 bg-slate-900/80 p-8 text-center transition-all duration-200 hover:border-sky-500/60 hover:bg-slate-800/80 hover:shadow-xl hover:shadow-sky-500/10 active:scale-[0.98]"
          >
            <span className="text-5xl">👷</span>
            <div>
              <p className="text-xl font-bold text-white mb-1">Je suis sur le terrain</p>
              <p className="text-sm text-slate-400 leading-snug">Dicter mon rapport vocal de chantier</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-4 py-1.5 text-xs font-semibold text-sky-400 group-hover:bg-sky-500/25">
              Accès rapide →
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/login")}
            className="group flex flex-col items-center gap-4 rounded-2xl border border-slate-700/60 bg-slate-900/80 p-8 text-center transition-all duration-200 hover:border-violet-500/60 hover:bg-slate-800/80 hover:shadow-xl hover:shadow-violet-500/10 active:scale-[0.98]"
          >
            <span className="text-5xl">💼</span>
            <div>
              <p className="text-xl font-bold text-white mb-1">Je suis au bureau</p>
              <p className="text-sm text-slate-400 leading-snug">Consulter les rapports de mon équipe</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-4 py-1.5 text-xs font-semibold text-violet-400 group-hover:bg-violet-500/25">
              Dashboard Admin →
            </span>
          </button>
        </div>

        <p className="text-center text-xs text-slate-600 mt-8">
          Vos données restent privées et sécurisées
        </p>
      </div>
    </main>
  );
}
