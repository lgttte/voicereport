"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function WorkerOnboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = name.trim().length > 0 && code.trim().length === 4;

  const handleSubmit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), invite_code: code.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de l'inscription.");
        setLoading(false);
        return;
      }

      // Store worker identity in localStorage
      localStorage.setItem("worker_device_id", data.device_id);
      localStorage.setItem("worker_name", data.name);
      localStorage.setItem("worker_company_id", data.company_id);
      localStorage.setItem("worker_company_name", data.company_name);
      localStorage.setItem("worker_invite_code", data.invite_code);

      router.replace("/record");
    } catch {
      setError("Erreur réseau. Vérifiez votre connexion.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">
      {/* Ambient */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-sky-600/8 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Back */}
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8"
        >
          ← Retour
        </button>

        {/* Header */}
        <div className="mb-10">
          <p className="text-sm font-semibold text-sky-400 uppercase tracking-widest mb-2">Terrain</p>
          <h1 className="text-4xl font-black text-white leading-tight">
            Bonjour,<br />qui êtes-vous&nbsp;?
          </h1>
          <p className="text-slate-400 mt-3 text-base">
            Entrez votre prénom et le code fourni par votre patron.
          </p>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Votre prénom
            </label>
            <input
              type="text"
              autoFocus
              placeholder="Ex : Jean-Pierre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-2xl font-bold text-white placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Code entreprise (4 chiffres)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="Ex : 8492"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-2xl font-bold text-white placeholder:text-slate-600 tracking-[0.5em] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            className="mt-2 w-full rounded-xl bg-sky-600 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-sky-600/25 transition-all duration-200 hover:bg-sky-500 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Connexion…
              </>
            ) : (
              "C'est parti →"
            )}
          </button>
        </div>

        <p className="text-center text-xs text-slate-600 mt-8">
          Votre patron vous communique le code lors de l&apos;onboarding.
        </p>
      </div>
    </main>
  );
}
