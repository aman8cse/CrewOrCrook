"use client";

import { useState } from "react";

export function AuthPanel({
  authMode,
  onModeChange,
  authForm,
  onAuthFormChange,
  onSubmit,
}: {
  authMode: "login" | "register";
  onModeChange: (mode: "login" | "register") => void;
  authForm: Record<string, string>;
  onAuthFormChange: (field: string, value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="card auth-panel">
      <div className="switch-row">
        <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => onModeChange("login")}>
          Login
        </button>
        <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => onModeChange("register")}>
          Register
        </button>
      </div>

      <div className="field-grid">
        <input
          className="input"
          placeholder="Username"
          value={authForm.username}
          onChange={(e) => onAuthFormChange("username", e.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={authForm.password}
          onChange={(e) => onAuthFormChange("password", e.target.value)}
        />

        {authMode === "register" && (
          <>
            <input className="input" placeholder="Email" value={authForm.email} onChange={(e) => onAuthFormChange("email", e.target.value)} />
            <input className="input" placeholder="Zeal ID" value={authForm.zealId} onChange={(e) => onAuthFormChange("zealId", e.target.value)} />
            <input className="input" placeholder="Roll Number" value={authForm.rollNo} onChange={(e) => onAuthFormChange("rollNo", e.target.value)} />
            <input className="input" placeholder="Section" value={authForm.section} onChange={(e) => onAuthFormChange("section", e.target.value)} />
            <input className="input" placeholder="Avatar URL" value={authForm.avatar} onChange={(e) => onAuthFormChange("avatar", e.target.value)} />
          </>
        )}

        <button className="primary-btn" type="button" onClick={onSubmit}>
          {authMode === "login" ? "Enter the game" : "Create account"}
        </button>
      </div>
    </div>
  );
}
