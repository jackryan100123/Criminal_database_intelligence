import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "../api";
import { useTheme } from "../theme/ThemeContext";

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const doLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  const nav = [
    { to: "/", label: "Dashboard", end: true },
    { to: "/profiles", label: "Criminal Profiles" },
    { to: "/search", label: "Search & Filter" },
    { to: "/relationships", label: "Supporters & Followers" },
    { to: "/analytics", label: "Analytics" },
    { to: "/settings", label: "Settings" },
  ];

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark" />
          {!collapsed && (
            <div className="brand-text">
              <div className="brand-title">CDB Intel</div>
              <div className="brand-sub">Investigation Suite</div>
            </div>
          )}
          <button type="button" className="sidebar-toggle" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar">
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav className="sidebar-nav">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <span className="nav-dot" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          {!collapsed && (
            <div className="sidebar-meta">
              <span className="pill subtle">{theme === "dark" ? "Dark" : "Light"}</span>
            </div>
          )}
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="page-title">Workspace</h1>
          </div>
          <div className="topbar-actions">
            <button type="button" className="btn btn-ghost" onClick={toggleTheme}>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <button type="button" className="btn btn-danger-outline" onClick={doLogout}>
              Sign out
            </button>
          </div>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
