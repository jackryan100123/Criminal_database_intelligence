import React, { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { logout } from "../api";
import { useTheme } from "../theme/ThemeContext";

function titleForPath(pathname: string): string {
  if (pathname.startsWith("/criminal/")) return "Criminal case file";
  if (pathname.startsWith("/entity/")) return "Person / entity profile";
  if (pathname.startsWith("/profile/")) return "Person / entity profile";
  const map: Record<string, string> = {
    "/": "Investigation workspace",
    "/profiles": "Case files & entities",
    "/search": "Global search",
    "/relationships": "Relationship links",
    "/analytics": "Analytics & network",
    "/settings": "Settings",
  };
  return map[pathname] ?? "Workspace";
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const pageTitle = useMemo(() => titleForPath(location.pathname), [location.pathname]);

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
    { to: "/", label: "Workspace", end: true },
    { to: "/profiles", label: "Case files" },
    { to: "/search", label: "Search" },
    { to: "/relationships", label: "Links" },
    { to: "/analytics", label: "Network" },
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
            <h1 className="page-title">{pageTitle}</h1>
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
