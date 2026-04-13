"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CompanyRegister() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ name: string; invite_code: string } | null>(null);

  const canSubmit = name.trim().length >= 2;

  const handleSubmit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la création.");
        setLoading(false);
        return;
      }

      setCreated(data);
    } catch {
      setError("Erreur réseau.");
      setLoading(false);
    }
  };

  if (created) {
    return (
      <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">✅</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Entreprise créée !</h1>
          <p className="text-slate-400 mb-8">Donnez ce code à vos équipes sur le terrain.</p>

          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-8 mb-8">
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-2">{created.name}</p>
            <p className="text-6xl font-black text-white tracking-[0.4em]">{created.invite_code}</p>
            <p className="text-xs text-slate-500 mt-3">Code Chantier</p>
          </div>

          <button
            type="button"
            onClick={() => {
              localStorage.setItem("admin_company_id", "");
              router.push("/login");
            }}
            className="w-full rounded-xl bg-violet-600 px-6 py-4 text-base font-bold text-white hover:bg-violet-500 transition-colors"
          >
            Accéder au Dashboard →
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8"
        >
          ← Retour
        </button>

        <div className="mb-10">
          <p className="text-sm font-semibold text-emerald-400 uppercase tracking-widest mb-2">Inscription</p>
          <h1 className="text-4xl font-black text-white leading-tight">Créer mon entreprise</h1>
          <p className="text-slate-400 mt-3">Un code à 4 chiffres sera généré automatiquement.</p>
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Nom de l&apos;entreprise
            </label>
            <input
              type="text"
              autoFocus
              placeholder="Ex : Bâti-Pro Sarl"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-xl font-bold text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            className="w-full rounded-xl bg-emerald-600 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <><span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Création…</>
            ) : "Générer mon code →"}
          </button>
        </div>
      </div>
    </main>
  );
}
