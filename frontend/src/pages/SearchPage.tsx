import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { searchProfiles } from "../api";

type InfoRow = { key: string; value: string };

function cleanObject(obj: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

function infoRowsToObject(rows: InfoRow[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    if (r.value.trim() === "") continue;
    out[k] = r.value.trim();
  }
  return out;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const [searchBase, setSearchBase] = useState({
    name: "",
    fir_number: "",
    organization: "",
    social_media: "",
    details: "",
    active_status: "" as "" | "true" | "false",
    role: "" as "" | "supporter" | "follower",
    link_remark: "",
    info: [{ key: "", value: "" }] as InfoRow[],
    size: 15,
  });

  useEffect(() => {
    const st = (location.state as any)?.initialName;
    if (typeof st === "string" && st) {
      setSearchBase((p) => ({ ...p, name: st }));
    }
  }, [location.state]);

  const runSearch = async () => {
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const infoObj = infoRowsToObject(searchBase.info);
      const payload = cleanObject({
        name: searchBase.name,
        fir_number: searchBase.fir_number,
        organization: searchBase.organization,
        social_media: searchBase.social_media,
        details: searchBase.details,
        size: searchBase.size,
        active_status: searchBase.active_status === "" ? undefined : searchBase.active_status === "true",
        role: searchBase.role === "" ? undefined : searchBase.role,
        link_remark: searchBase.link_remark,
        info: Object.keys(infoObj).length ? infoObj : undefined,
      });
      const res = await searchProfiles(payload);
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page search-page">
      <div className="page-header">
        <h2>Search &amp; filter</h2>
        <p className="page-lead">Full-text search across profiles, additional info fields, and relationship remarks.</p>
      </div>

      <section className="panel">
        <div className="panel-toolbar">
          <button type="button" className={`btn btn-ghost ${filtersOpen ? "active" : ""}`} onClick={() => setFiltersOpen((v) => !v)}>
            {filtersOpen ? "Hide filters" : "Show filters"}
          </button>
          <button type="button" className="btn btn-primary" onClick={runSearch} disabled={loading}>
            {loading ? "Searching…" : "Run search"}
          </button>
        </div>
        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className={`filters ${filtersOpen ? "" : "collapsed"}`}>
          <div className="row grid-2">
            <label className="field">
              <span>Name / alias</span>
              <input value={searchBase.name} onChange={(e) => setSearchBase((p) => ({ ...p, name: e.target.value }))} />
            </label>
            <label className="field">
              <span>FIR number</span>
              <input value={searchBase.fir_number} onChange={(e) => setSearchBase((p) => ({ ...p, fir_number: e.target.value }))} />
            </label>
            <label className="field">
              <span>Organization</span>
              <input value={searchBase.organization} onChange={(e) => setSearchBase((p) => ({ ...p, organization: e.target.value }))} />
            </label>
            <label className="field">
              <span>Social media</span>
              <input value={searchBase.social_media} onChange={(e) => setSearchBase((p) => ({ ...p, social_media: e.target.value }))} />
            </label>
            <label className="field full">
              <span>Details / profile remarks</span>
              <textarea value={searchBase.details} onChange={(e) => setSearchBase((p) => ({ ...p, details: e.target.value }))} />
            </label>
            <label className="field">
              <span>Active status</span>
              <select value={searchBase.active_status} onChange={(e) => setSearchBase((p) => ({ ...p, active_status: e.target.value as any }))}>
                <option value="">Any</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
            <label className="field">
              <span>Connected role filter</span>
              <select value={searchBase.role} onChange={(e) => setSearchBase((p) => ({ ...p, role: e.target.value as any }))}>
                <option value="">Both</option>
                <option value="supporter">Supporters</option>
                <option value="follower">Followers</option>
              </select>
            </label>
            <label className="field full">
              <span>Relationship remark contains</span>
              <input value={searchBase.link_remark} onChange={(e) => setSearchBase((p) => ({ ...p, link_remark: e.target.value }))} />
            </label>
          </div>

          <div className="subpanel">
            <div className="subpanel-title">Additional info (key / value)</div>
            {searchBase.info.map((r, idx) => (
              <div className="row grid-2 kv-row" key={idx}>
                <input
                  placeholder="field key"
                  value={r.key}
                  onChange={(e) => {
                    const next = [...searchBase.info];
                    next[idx] = { ...next[idx], key: e.target.value };
                    setSearchBase((p) => ({ ...p, info: next }));
                  }}
                />
                <div className="kv-actions">
                  <input
                    placeholder="value"
                    value={r.value}
                    onChange={(e) => {
                      const next = [...searchBase.info];
                      next[idx] = { ...next[idx], value: e.target.value };
                      setSearchBase((p) => ({ ...p, info: next }));
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setSearchBase((p) => ({ ...p, info: p.info.length > 1 ? p.info.filter((_, i) => i !== idx) : p.info }))
                    }
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSearchBase((p) => ({ ...p, info: [...p.info, { key: "", value: "" }] }))}>
              + Add info pair
            </button>
          </div>
        </div>
      </section>

      {result ? (
        <div className="results-grid">
          <section className="panel">
            <div className="panel-header">
              <h3>Criminal matches</h3>
              <span className="pill subtle">{result.profiles?.length ?? 0}</span>
            </div>
            <div className="card-list">
              {(result.profiles ?? []).map((p: any) => (
                <button key={p.profile_id} type="button" className="result-card" onClick={() => navigate(`/criminal/${p.profile_id}`)}>
                  <div className="result-title">{p.name}</div>
                  <div className="result-meta">
                    FIR {p.fir_number || "—"} · {p.organization || "—"} ·{" "}
                    <span className={p.active_status ? "status-active" : "status-inactive"}>{p.active_status ? "Active" : "Inactive"}</span>
                  </div>
                </button>
              ))}
              {(result.profiles ?? []).length === 0 ? <div className="empty-state">No criminal profiles matched.</div> : null}
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h3>Connected entities</h3>
              <span className="pill subtle">{result.related_profiles?.length ?? 0}</span>
            </div>
            <div className="card-list dense">
              {(result.related_profiles ?? []).map((r: any, i: number) => (
                <div key={i} className="mini-card">
                  <div className="mini-title">
                    {r.linked_name}{" "}
                    <span className="pill subtle">{r.role}</span>
                  </div>
                  <div className="mini-meta">→ criminal {r.criminal_profile_id}</div>
                  {r.remark ? <div className="mini-remark">{r.remark}</div> : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
