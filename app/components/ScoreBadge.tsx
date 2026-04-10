"use client";

interface ScoreBadgeProps {
  score: number;
}

export default function ScoreBadge({ score }: ScoreBadgeProps) {
  const color = score >= 7 ? "text-emerald-400" : score >= 5 ? "text-amber-400" : "text-red-400";
  const bg = score >= 7 ? "bg-emerald-500/10 border-emerald-500/30" : score >= 5 ? "bg-amber-500/10 border-amber-500/30" : "bg-red-500/10 border-red-500/30";
  const label = score >= 8 ? "Excellent" : score >= 6 ? "Correct" : score >= 4 ? "Difficile" : "Critique";

  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border-2 px-5 py-3.5 ${bg}`}>
      <p className={`text-2xl font-bold leading-none ${color}`}>{score}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">/10</p>
    </div>
  );
}
