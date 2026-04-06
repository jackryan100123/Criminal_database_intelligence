import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createProfile, listProfiles } from "../api";

type InfoRow = { key: string; value: string };

function infoRowsToObject(rows: InfoRow[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k || r.value.trim() === "") continue;
    out[k] = r.value.trim();
  }
  return out;
}

export default function ProfilesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"list" | "create">("list");

  const [createPayload, setCreatePayload] = useState({
    kind: "criminal" as "criminal" | "user",
    name: "",
    organization: "",
    social_media: "",
    fir_number: "",
    details: "",
    active_status: true,
    remarks: "",
  });
  const [createInfo, setCreateInfo] = useState<InfoRow[]>([{ key: "", value: "" }]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setErr("");
    try {
      const res = await listProfiles({ kind: "criminal", limit: 100 });
      setRows(res.profiles ?? []);
    } catch (e: any) {
      setErr(e.message || "Failed to load profiles");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const doCreate = async () => {
    setErr("");
    setMsg("");
    try {
      const info = infoRowsToObject(createInfo);
      const payload: any = {
        kind: createPayload.kind,
        name: createPayload.name,
        organization: createPayload.organization || undefined,
        social_media: createPayload.social_media || undefined,
        fir_number: createPayload.kind === "criminal" ? createPayload.fir_number || undefined : undefined,
        details: createPayload.details || undefined,
        active_status: createPayload.active_status,
        remarks: createPayload.remarks || undefined,
        info: Object.keys(info).length ? info : undefined,
      };
      const res = await createProfile(payload);
      setMsg(`Created profile ${res.profile_id}`);
      setTab("list");
      await load();
    } catch (e: any) {
      setErr(e.message || "Create failed");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Criminal profiles</h2>
        <p className="page-lead">Browse criminals and create new entity records.</p>
      </div>
      <div className="tabs">
        <button type="button" className={tab === "list" ? "active" : ""} onClick={() => setTab("list")}>
          Directory
        </button>
        <button type="button" className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}>
          New profile
        </button>
      </div>
      {err ? <div className="alert alert-error">{err}</div> : null}
      {msg ? <div className="alert alert-info">{msg}</div> : null}

      {tab === "list" ? (
        <section className="panel">
          <div className="panel-toolbar">
            <button type="button" className="btn btn-secondary" onClick={load}>
              Refresh
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>FIR</th>
                  <th>Organization</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.profile_id}
                    className="table-row-click"
                    onClick={() => navigate(`/criminal/${p.profile_id}`)}
                    title="Open criminal profile"
                  >
                    <td>{p.name}</td>
                    <td>{p.fir_number || "—"}</td>
                    <td>{p.organization || "—"}</td>
                    <td>
                      <span className={p.active_status ? "status-pill on" : "status-pill off"}>{p.active_status ? "Active" : "Inactive"}</span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/criminal/${p.profile_id}`)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? <div className="empty-state">No criminal profiles yet.</div> : null}
          </div>
        </section>
      ) : null}

      {tab === "create" ? (
        <section className="panel">
          <h3>New profile</h3>
          <div className="row grid-2">
            <label className="field">
              <span>Kind</span>
              <select value={createPayload.kind} onChange={(e) => setCreatePayload((p) => ({ ...p, kind: e.target.value as any }))}>
                <option value="criminal">Criminal</option>
                <option value="user">User / entity</option>
              </select>
            </label>
            <label className="field">
              <span>Name</span>
              <input value={createPayload.name} onChange={(e) => setCreatePayload((p) => ({ ...p, name: e.target.value }))} />
            </label>
            <label className="field">
              <span>Organization</span>
              <input value={createPayload.organization} onChange={(e) => setCreatePayload((p) => ({ ...p, organization: e.target.value }))} />
            </label>
            <label className="field">
              <span>Social media</span>
              <input value={createPayload.social_media} onChange={(e) => setCreatePayload((p) => ({ ...p, social_media: e.target.value }))} />
            </label>
            <label className="field">
              <span>FIR (criminal)</span>
              <input
                value={createPayload.fir_number}
                onChange={(e) => setCreatePayload((p) => ({ ...p, fir_number: e.target.value }))}
                disabled={createPayload.kind !== "criminal"}
              />
            </label>
            <label className="field">
              <span>Active</span>
              <select
                value={createPayload.active_status ? "true" : "false"}
                onChange={(e) => setCreatePayload((p) => ({ ...p, active_status: e.target.value === "true" }))}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label className="field full">
              <span>Details</span>
              <textarea value={createPayload.details} onChange={(e) => setCreatePayload((p) => ({ ...p, details: e.target.value }))} />
            </label>
            <label className="field full">
              <span>Remarks</span>
              <input value={createPayload.remarks} onChange={(e) => setCreatePayload((p) => ({ ...p, remarks: e.target.value }))} />
            </label>
          </div>
          <div className="subpanel">
            <div className="subpanel-title">Additional info</div>
            {createInfo.map((r, idx) => (
              <div className="row grid-2 kv-row" key={idx}>
                <input
                  placeholder="key"
                  value={r.key}
                  onChange={(e) => {
                    const n = [...createInfo];
                    n[idx] = { ...n[idx], key: e.target.value };
                    setCreateInfo(n);
                  }}
                />
                <input
                  placeholder="value"
                  value={r.value}
                  onChange={(e) => {
                    const n = [...createInfo];
                    n[idx] = { ...n[idx], value: e.target.value };
                    setCreateInfo(n);
                  }}
                />
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreateInfo((p) => [...p, { key: "", value: "" }])}>
              + Field
            </button>
          </div>
          <div className="panel-toolbar">
            <button type="button" className="btn btn-primary" onClick={doCreate}>
              Create profile
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
