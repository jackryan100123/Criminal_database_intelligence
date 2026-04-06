import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboardActivity, getDashboardStats } from "../api";

function formatActivityTime(iso: string | undefined | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, a] = await Promise.all([getDashboardStats(), getDashboardActivity(24)]);
        if (!cancelled) {
          setStats(s);
          setActivity(a.activity ?? []);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e.message || "Failed to load dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const goSearch = () => {
    navigate("/search", { state: { initialQuery: q } });
  };

  return (
    <div className="page dashboard-page">
      <div className="page-header">
        <h2>Investigation workspace</h2>
        <p className="page-lead">
          Build criminal case files, attach OSINT (social, photos, notes), link supporters and followers, and search across everything—including relationship remarks.
        </p>
      </div>

      {err ? <div className="alert alert-error">{err}</div> : null}

      <div className="workflow-strip">
        <span className="workflow-chip">
          <strong>1</strong> Case file
        </span>
        <span className="workflow-chip">
          <strong>2</strong> Links &amp; remarks
        </span>
        <span className="workflow-chip">
          <strong>3</strong> Entity profiles
        </span>
        <span className="workflow-chip">
          <strong>4</strong> Search &amp; graph
        </span>
      </div>

      <section className="panel hero-search">
        <div className="hero-search-inner">
          <label className="hero-label">Global search (names, FIR, phone, remarks, social, custom fields)</label>
          <div className="hero-search-row">
            <input
              className="hero-input"
              placeholder="Try a name fragment, FIR, org, phone, or paste a social handle…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goSearch()}
            />
            <button type="button" className="btn btn-primary" onClick={goSearch}>
              Search
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate("/search")}>
              Advanced filters
            </button>
          </div>
        </div>
      </section>

      <div className="dashboard-actions">
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/profiles", { state: { directoryKind: "criminal" } })}>
          Browse case files
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/profiles", { state: { directoryKind: "user" } })}>
          People &amp; entities
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/relationships")}>
          All relationship links
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/analytics")}>
          Network graph
        </button>
      </div>

      <section className="stats-grid">
        <button type="button" className="stat-card clickable" onClick={() => navigate("/profiles")}>
          <div className="stat-label">Active criminal files</div>
          <div className="stat-value accent">{stats?.active_criminals ?? "—"}</div>
          <div className="stat-hint">of {stats?.total_criminals ?? "—"} total</div>
        </button>
        <button type="button" className="stat-card clickable" onClick={() => navigate("/relationships")}>
          <div className="stat-label">Supporter links</div>
          <div className="stat-value">{stats?.supporter_links ?? "—"}</div>
          <div className="stat-hint">Edges to entities</div>
        </button>
        <button type="button" className="stat-card clickable" onClick={() => navigate("/relationships")}>
          <div className="stat-label">Follower links</div>
          <div className="stat-value">{stats?.follower_links ?? "—"}</div>
          <div className="stat-hint">Edges to entities</div>
        </button>
        <div className="stat-card">
          <div className="stat-label">Total link edges</div>
          <div className="stat-value">{stats?.total_relationship_links ?? "—"}</div>
          <div className="stat-hint">Indexed for search</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Photos in vault</div>
          <div className="stat-value">{stats?.total_photos ?? "—"}</div>
          <div className="stat-hint">With analysis notes</div>
        </div>
        <button
          type="button"
          className="stat-card clickable"
          onClick={() => navigate("/profiles", { state: { directoryKind: "user" } })}
        >
          <div className="stat-label">Person / entity profiles</div>
          <div className="stat-value">{stats?.total_user_profiles ?? "—"}</div>
          <div className="stat-hint">Non-criminal records</div>
        </button>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Recent activity</h3>
          <span className="pill subtle">Latest changes</span>
        </div>
        <div className="activity-feed">
          {activity.length === 0 ? <div className="empty-state">No activity yet.</div> : null}
          {activity.map((ev, i) => {
            const criminalId = ev.criminal_profile_id as string | undefined;
            const profileId = ev.profile_id as string | undefined;
            const openEntity = () => {
              if (ev.type === "relationship_linked" && criminalId) {
                navigate(`/criminal/${criminalId}`);
                return;
              }
              if (profileId && ev.profile_kind === "user") {
                navigate(`/profile/${profileId}`);
                return;
              }
              if (profileId) {
                navigate(`/criminal/${profileId}`);
              }
            };
            const canOpen = Boolean((ev.type === "relationship_linked" && criminalId) || profileId);
            return (
              <div key={i} className="activity-item">
                <div className={`activity-dot type-${ev.type}`} />
                <div className="activity-body">
                  <div className="activity-title">
                    {canOpen ? (
                      <button type="button" className="text-link activity-title-link" onClick={openEntity}>
                        {ev.title}
                      </button>
                    ) : (
                      ev.title
                    )}
                  </div>
                  <div className="activity-meta">{ev.subtitle}</div>
                  <div className="activity-time">{formatActivityTime(ev.at)}</div>
                </div>
                {canOpen ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={openEntity}>
                    Open
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
