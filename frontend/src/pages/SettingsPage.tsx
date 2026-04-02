import React from "react";
import { useTheme } from "../theme/ThemeContext";

export default function SettingsPage() {
  const { theme, toggleTheme, setTheme } = useTheme();

  return (
    <div className="page">
      <div className="page-header">
        <h2>Settings</h2>
        <p className="page-lead">Appearance and session preferences.</p>
      </div>
      <section className="panel settings-panel">
        <h3>Appearance</h3>
        <p className="muted">Choose a theme optimized for long investigation sessions.</p>
        <div className="settings-row">
          <button type="button" className={`btn ${theme === "dark" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTheme("dark")}>
            Dark (default)
          </button>
          <button type="button" className={`btn ${theme === "light" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTheme("light")}>
            Light
          </button>
          <button type="button" className="btn btn-ghost" onClick={toggleTheme}>
            Toggle
          </button>
        </div>
        <div className="settings-note">
          Theme is stored in this browser only (<code>localStorage</code>).
        </div>
      </section>
    </div>
  );
}
