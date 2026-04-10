"use client";

import { Bell, Zap } from "lucide-react";

interface AlertsBannerProps {
  alertes: string[];
  impacts: string[];
}

export default function AlertsBanner({ alertes, impacts }: AlertsBannerProps) {
  if (alertes.length === 0 && impacts.length === 0) return null;

  return (
    <>
      {alertes.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3.5 space-y-2 animate-fadeInUp stagger-1">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="h-3.5 w-3.5 text-red-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-red-400">Alertes</p>
          </div>
          {alertes.map((a, i) => (
            <p key={i} className="text-sm text-red-200 leading-relaxed">{a}</p>
          ))}
        </div>
      )}
      {impacts.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-2 animate-fadeInUp stagger-2">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Impacts détectés</p>
          </div>
          {impacts.map((imp, i) => (
            <p key={i} className="text-sm text-amber-200/80 leading-relaxed">{imp}</p>
          ))}
        </div>
      )}
    </>
  );
}
