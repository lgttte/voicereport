"use client";

import React, { useState } from "react";
import { HardHat, ChevronRight } from "lucide-react";
import type { UserProfile } from "../lib/types";

const ROLES = [
  { label: "Chef de chantier", emoji: "👷" },
  { label: "Conducteur de travaux", emoji: "🏗️" },
  { label: "Ouvrier", emoji: "🔨" },
  { label: "Artisan", emoji: "🛠️" },
  { label: "Patron", emoji: "👔" },
  { label: "Autre", emoji: "📋" },
];

export default function UserSetup({ onComplete }: { onComplete: (user: UserProfile) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    const user: UserProfile = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: name.trim(),
      role: role || "Chef de chantier",
      createdAt: Date.now(),
    };
    onComplete(user);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fadeIn">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/20">
            <HardHat className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Bienvenue sur VoiceReport</h1>
          <p className="text-sm text-slate-400">Configurez votre profil en 10 secondes</p>
        </div>

        <div className="bg-slate-900/60 rounded-2xl p-6 border border-slate-800 space-y-6 animate-fadeInUp stagger-2">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Votre prénom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="Ex: Jean-Pierre"
              className="w-full px-4 py-3.5 bg-slate-800/50 border border-slate-700/60 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/40 text-lg transition-all"
              autoFocus
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Votre rôle</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => setRole(r.label)}
                  className={`py-3 px-3 rounded-xl text-sm font-medium transition-all active:scale-[0.96] ${
                    role === r.label
                      ? "bg-red-500/15 border-red-500/50 text-red-400 border-2 ring-1 ring-red-500/20"
                      : "bg-slate-800/50 border border-slate-700/60 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <span className="text-lg mr-1">{r.emoji}</span> {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-red-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            C&apos;est parti <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Vos données restent sur votre appareil
        </p>
      </div>
    </main>
  );
}
