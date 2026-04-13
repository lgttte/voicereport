"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = code.trim().length === 4;

  const handleSubmit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/company?code=${code.trim()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Code invalide.");
        setLoading(false);
        return;
      }

      // Store admin session
      localStorage.setItem("admin_company_id", data.id);
      localStorage.setItem("admin_company_name", data.name);
      localStorage.setItem("admin_invite_code", data.invite_code);

      router.replace("/dashboard");
    } catch {
      setError("Erreur réseau. Vérifiez votre connexion.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full bg-violet-600/8 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8"
        >
          ← Retour
        </button>

        <div className="mb-10">
          <p className="text-sm font-semibold text-violet-400 uppercase tracking-widest mb-2">Admin</p>
          <h1 className="text-4xl font-black text-white leading-tight">Espace patron</h1>
          <p className="text-slate-400 mt-3 text-base">
            Entrez votre code entreprise pour accéder au dashboard.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Code entreprise (4 chiffres)
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={4}
              placeholder="0000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-3xl font-black text-white placeholder:text-slate-700 tracking-[0.6em] text-center focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
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
            className="w-full rounded-xl bg-violet-600 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-violet-600/25 transition-all duration-200 hover:bg-violet-500 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Connexion…
              </>
            ) : (
              "Accéder au dashboard →"
            )}
          </button>
        </div>

        <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500 mb-3 font-semibold uppercase tracking-widest">Pas encore inscrit ?</p>
          <p className="text-sm text-slate-400">
            Créez votre entreprise pour obtenir votre code :
          </p>
          <button
            type="button"
            onClick={() => router.push("/register")}
            className="mt-3 w-full rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            Créer mon entreprise
          </button>
        </div>
      </div>
    </main>
  );
}
