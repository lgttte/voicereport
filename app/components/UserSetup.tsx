"use client";

import React, { useState } from "react";
import type { UserProfile } from "../lib/types";

const ROLES: { label: string; icon: React.ReactNode }[] = [
  {
    label: "Chef de chantier",
    icon: (
      <svg viewBox="0 0 24 24"><path d="M2 18h20" /><path d="M4 18a8 8 0 0 1 16 0" /></svg>
    ),
  },
  {
    label: "Conducteur de travaux",
    icon: (
      <svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="12" rx="1" /><path d="M7 8V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" /></svg>
    ),
  },
  {
    label: "Ouvrier",
    icon: (
      <svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></svg>
    ),
  },
  {
    label: "Artisan",
    icon: (
      <svg viewBox="0 0 24 24"><path d="M14.7 6.3l3 3" /><path d="M9 11l4 4" /><path d="M3 21l6-6" /><path d="M14 4l6 6-3 3-6-6z" /></svg>
    ),
  },
  {
    label: "Patron",
    icon: (
      <svg viewBox="0 0 24 24"><path d="M16 4h4v16h-4z" /><path d="M4 4h4v16H4z" /><path d="M8 4l4 16" /></svg>
    ),
  },
  {
    label: "Autre",
    icon: (
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>
    ),
  },
];

export default function UserSetup({ onComplete }: { onComplete: (user: UserProfile) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const canSubmit = name.trim().length > 0 && role.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const user: UserProfile = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: name.trim(),
      role: role,
      createdAt: Date.now(),
    };
    onComplete(user);
  };

  return (
    <div className="ob-body">
      <div className="ob-orb ob-orb-1" />
      <div className="ob-orb ob-orb-2" />
      <div className="ob-orb ob-orb-3" />

      <div className="ob-wrap">
        {/* Logo + Title */}
        <div className="ob-logo-wrap">
          <div className="ob-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 18h20" />
              <path d="M4 18a8 8 0 0 1 16 0" />
              <path d="M12 2v4" />
              <path d="M8 6l1 4" />
              <path d="M16 6l-1 4" />
            </svg>
          </div>
          <h1 className="ob-title">Bienvenue sur VoiceReport</h1>
          <p className="ob-subtitle">Configurez votre profil en 10 secondes</p>
        </div>

        {/* Card */}
        <div className="ob-card">
          {/* Name input */}
          <div className="ob-input-wrap">
            <label className="ob-label">Votre prénom</label>
            <input
              type="text"
              className="ob-input"
              placeholder="Ex : Jean-Pierre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              autoFocus
            />
          </div>

          {/* Roles */}
          <div className="ob-roles-wrap">
            <label className="ob-label">Votre rôle</label>
            <div className="ob-roles">
              {ROLES.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  className={`ob-role${role === r.label ? " selected" : ""}`}
                  onClick={() => setRole(r.label)}
                >
                  <span className="ob-role-icon">{r.icon}</span>
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <button
            type="button"
            className={`ob-cta${!canSubmit ? " disabled" : ""}`}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            C&apos;est parti
            <span className="ob-cta-arrow">→</span>
          </button>
        </div>

        <p className="ob-footnote">Vos données restent sur votre appareil</p>
      </div>
    </div>
  );
}
