import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRelationships } from "../api";
import { criminalProfilePath, entityProfilePath } from "../paths";

export default function RelationshipsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"" | "supporter" | "follower">("");
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");

  const load = async () => {
    setErr("");
    try {
      const res = await getRelationships({ q: q || undefined, role: role || undefined, limit: 200 });
      setRows(res.relationships ?? []);
    } catch (e: any) {
      setErr(e.message || "Failed to load relationships");
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page relationships-page">
      <div className="page-header">
        <h2>Relationship links</h2>
        <p className="page-lead">
          Every supporter/follower edge with investigative remarks. Open the <strong>criminal file</strong> to edit links in context, or the <strong>entity</strong>{" "}
          profile to update contact and OSINT.
        </p>
      </div>
      <section className="panel">
        <div className="row grid-3">
          <label className="field">
            <span>Search</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, FIR, remark…" />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as any)}>
              <option value="">All</option>
              <option value="supporter">Supporter</option>
              <option value="follower">Follower</option>
            </select>
          </label>
          <div className="field actions-inline">
            <span className="span-label">&nbsp;</span>
            <button type="button" className="btn btn-primary" onClick={load}>
              Apply
            </button>
          </div>
        </div>
        {err ? <div className="alert alert-error">{err}</div> : null}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Criminal</th>
                <th>Linked entity</th>
                <th>Role</th>
                <th>Remark</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.link_id}>
                  <td>
                    <button type="button" className="text-link table-name-link" onClick={() => navigate(criminalProfilePath(r.criminal_profile_id))}>
                      {r.criminal_name}
                    </button>{" "}
                    <span className={r.criminal_active ? "status-pill on" : "status-pill off"}>{r.criminal_active ? "Active" : "Inactive"}</span>
                  </td>
                  <td>
                    {r.linked_kind === "criminal" ? (
                      <button type="button" className="text-link table-name-link" onClick={() => navigate(criminalProfilePath(r.linked_profile_id))}>
                        {r.linked_name}
                      </button>
                    ) : (
                      <button type="button" className="text-link table-name-link" onClick={() => navigate(entityProfilePath(r.linked_profile_id))}>
                        {r.linked_name}
                      </button>
                    )}{" "}
                    <span className="pill subtle">{r.linked_kind}</span>
                  </td>
                  <td>
                    <span className={`pill-role ${r.role === "supporter" ? "supporter" : "follower"}`}>{r.role}</span>
                  </td>
                  <td className="td-remark">{r.remark || "—"}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(criminalProfilePath(r.criminal_profile_id))}>
                      Criminal file
                    </button>
                    {r.linked_kind === "user" ? (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(entityProfilePath(r.linked_profile_id))}>
                        Entity
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <div className="empty-state">No relationships found.</div> : null}
        </div>
      </section>
    </div>
  );
}
