import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { createProfile, listProfiles } from "../api";
import { criminalProfilePath, entityProfilePath } from "../paths";

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
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  /** URL `?kind=user` | `?kind=criminal` (default) — keeps sidebar “People / entities” vs “Criminal cases” in sync. */
  const directoryKind = searchParams.get("kind") === "user" ? "user" : "criminal";

  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"list" | "newCriminal" | "newEntity">("list");

  const [criminalForm, setCriminalForm] = useState({
    name: "",
    organization: "",
    social_media: "",
    fir_number: "",
    details: "",
    active_status: true,
    remarks: "",
    phone: "",
    email_contact: "",
    address: "",
  });
  const [entityForm, setEntityForm] = useState({
    name: "",
    organization: "",
    social_media: "",
    details: "",
    active_status: true,
    remarks: "",
    phone: "",
    email_contact: "",
    address: "",
  });
  const [createInfoCriminal, setCreateInfoCriminal] = useState<InfoRow[]>([{ key: "", value: "" }]);
  const [createInfoEntity, setCreateInfoEntity] = useState<InfoRow[]>([{ key: "", value: "" }]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setErr("");
    try {
      const res = await listProfiles({ kind: directoryKind, limit: 100 });
      setRows(res.profiles ?? []);
    } catch (e: any) {
      setErr(e.message || "Failed to load profiles");
    }
  };

  useEffect(() => {
    load();
  }, [directoryKind]);

  /** Legacy `state.directoryKind` → URL; sidebar uses `openDirectory` to reset to directory tab. */
  useEffect(() => {
    const st = (location.state as { directoryKind?: "criminal" | "user" })?.directoryKind;
    if (st === "criminal" || st === "user") {
      navigate({ pathname: "/profiles", search: `?kind=${st}` }, { replace: true, state: { openDirectory: true } });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    const openDir = (location.state as { openDirectory?: boolean })?.openDirectory;
    if (openDir) {
      setTab("list");
      navigate({ pathname: "/profiles", search: location.search }, { replace: true, state: {} });
    }
  }, [location.state, location.search, navigate]);

  const goTab = (t: "list" | "newCriminal" | "newEntity") => {
    setTab(t);
    if (t === "newEntity") setSearchParams({ kind: "user" }, { replace: true });
    if (t === "newCriminal") setSearchParams({ kind: "criminal" }, { replace: true });
  };

  const setDirectoryKind = (k: "criminal" | "user") => {
    setSearchParams({ kind: k }, { replace: true });
    setTab("list");
  };

  const doCreateCriminal = async () => {
    setErr("");
    setMsg("");
    if (!criminalForm.name.trim()) {
      setErr("Name is required.");
      return;
    }
    try {
      const info = infoRowsToObject(createInfoCriminal);
      const payload: any = {
        kind: "criminal",
        name: criminalForm.name.trim(),
        organization: criminalForm.organization || undefined,
        social_media: criminalForm.social_media || undefined,
        fir_number: criminalForm.fir_number || undefined,
        details: criminalForm.details || undefined,
        active_status: criminalForm.active_status,
        remarks: criminalForm.remarks || undefined,
        phone: criminalForm.phone?.trim() || undefined,
        email_contact: criminalForm.email_contact?.trim() || undefined,
        address: criminalForm.address?.trim() || undefined,
        info: Object.keys(info).length ? info : undefined,
      };
      const res = await createProfile(payload);
      setMsg("Criminal case file created.");
      navigate(criminalProfilePath(res.profile_id));
    } catch (e: any) {
      setErr(e.message || "Create failed");
    }
  };

  const doCreateEntity = async () => {
    setErr("");
    setMsg("");
    if (!entityForm.name.trim()) {
      setErr("Name is required.");
      return;
    }
    try {
      const info = infoRowsToObject(createInfoEntity);
      const payload: any = {
        kind: "user",
        name: entityForm.name.trim(),
        organization: entityForm.organization || undefined,
        social_media: entityForm.social_media || undefined,
        details: entityForm.details || undefined,
        active_status: entityForm.active_status,
        remarks: entityForm.remarks || undefined,
        phone: entityForm.phone?.trim() || undefined,
        email_contact: entityForm.email_contact?.trim() || undefined,
        address: entityForm.address?.trim() || undefined,
        info: Object.keys(info).length ? info : undefined,
      };
      const res = await createProfile(payload);
      setMsg("Person / entity profile created.");
      navigate(entityProfilePath(res.profile_id));
    } catch (e: any) {
      setErr(e.message || "Create failed");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Case files &amp; entities</h2>
        <p className="page-lead">
          <strong>Criminal case files</strong> are FIR-based records with case links. <strong>People / entities</strong> are separate profiles for supporters,
          followers, or OSINT targets — open them at <code className="mono">/entity/…</code>, then link from a case or mark as criminal when needed.
        </p>
      </div>
      <div className="tabs">
        <button type="button" className={tab === "list" ? "active" : ""} onClick={() => goTab("list")}>
          Directory
        </button>
        <button type="button" className={tab === "newCriminal" ? "active" : ""} onClick={() => goTab("newCriminal")}>
          New criminal case
        </button>
        <button type="button" className={tab === "newEntity" ? "active" : ""} onClick={() => goTab("newEntity")}>
          New person / entity
        </button>
      </div>
      {err ? <div className="alert alert-error">{err}</div> : null}
      {msg ? <div className="alert alert-info">{msg}</div> : null}

      {tab === "list" ? (
        <section className="panel">
          <div className="panel-toolbar">
            <div className="tabs" style={{ marginRight: "auto" }}>
              <button type="button" className={directoryKind === "criminal" ? "active" : ""} onClick={() => setDirectoryKind("criminal")}>
                Criminal case files
              </button>
              <button type="button" className={directoryKind === "user" ? "active" : ""} onClick={() => setDirectoryKind("user")}>
                People / entities
              </button>
            </div>
            <button type="button" className="btn btn-secondary" onClick={load}>
              Refresh
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>{directoryKind === "criminal" ? "FIR" : "Phone"}</th>
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
                    onClick={() => navigate(directoryKind === "user" ? entityProfilePath(p.profile_id) : criminalProfilePath(p.profile_id))}
                    title={directoryKind === "user" ? "Open person/entity profile" : "Open criminal case file"}
                  >
                    <td>{p.name}</td>
                    <td>{directoryKind === "criminal" ? p.fir_number || "—" : p.phone || "—"}</td>
                    <td>{p.organization || "—"}</td>
                    <td>
                      <span className={p.active_status ? "status-pill on" : "status-pill off"}>{p.active_status ? "Active" : "Inactive"}</span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(directoryKind === "user" ? entityProfilePath(p.profile_id) : criminalProfilePath(p.profile_id))}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <div className="empty-state">{directoryKind === "criminal" ? "No criminal case files yet." : "No person/entity profiles yet."}</div>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "newCriminal" ? (
        <section className="panel">
          <h3>New criminal case file</h3>
          <p className="page-lead muted" style={{ marginTop: 0 }}>
            Creates a <strong>criminal</strong> record (requires a unique FIR when filing). Opens the case page when saved.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void doCreateCriminal();
            }}
          >
            <div className="row grid-2">
              <label className="field">
                <span>Name</span>
                <input value={criminalForm.name} onChange={(e) => setCriminalForm((p) => ({ ...p, name: e.target.value }))} required />
              </label>
              <label className="field">
                <span>FIR number</span>
                <input value={criminalForm.fir_number} onChange={(e) => setCriminalForm((p) => ({ ...p, fir_number: e.target.value }))} placeholder="Unique case FIR" />
              </label>
              <label className="field">
                <span>Organization</span>
                <input value={criminalForm.organization} onChange={(e) => setCriminalForm((p) => ({ ...p, organization: e.target.value }))} />
              </label>
              <label className="field">
                <span>Social media / OSINT</span>
                <input value={criminalForm.social_media} onChange={(e) => setCriminalForm((p) => ({ ...p, social_media: e.target.value }))} />
              </label>
              <label className="field">
                <span>Phone</span>
                <input value={criminalForm.phone} onChange={(e) => setCriminalForm((p) => ({ ...p, phone: e.target.value }))} />
              </label>
              <label className="field">
                <span>Email (contact)</span>
                <input value={criminalForm.email_contact} onChange={(e) => setCriminalForm((p) => ({ ...p, email_contact: e.target.value }))} />
              </label>
              <label className="field">
                <span>Active</span>
                <select
                  value={criminalForm.active_status ? "true" : "false"}
                  onChange={(e) => setCriminalForm((p) => ({ ...p, active_status: e.target.value === "true" }))}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label className="field full">
                <span>Address</span>
                <textarea value={criminalForm.address} onChange={(e) => setCriminalForm((p) => ({ ...p, address: e.target.value }))} rows={2} />
              </label>
              <label className="field full">
                <span>Details</span>
                <textarea value={criminalForm.details} onChange={(e) => setCriminalForm((p) => ({ ...p, details: e.target.value }))} />
              </label>
              <label className="field full">
                <span>Remarks</span>
                <input value={criminalForm.remarks} onChange={(e) => setCriminalForm((p) => ({ ...p, remarks: e.target.value }))} />
              </label>
            </div>
            <div className="subpanel">
              <div className="subpanel-title">Additional info (searchable)</div>
              {createInfoCriminal.map((r, idx) => (
                <div className="row grid-2 kv-row" key={idx}>
                  <input
                    placeholder="key"
                    value={r.key}
                    onChange={(e) => {
                      const n = [...createInfoCriminal];
                      n[idx] = { ...n[idx], key: e.target.value };
                      setCreateInfoCriminal(n);
                    }}
                  />
                  <input
                    placeholder="value"
                    value={r.value}
                    onChange={(e) => {
                      const n = [...createInfoCriminal];
                      n[idx] = { ...n[idx], value: e.target.value };
                      setCreateInfoCriminal(n);
                    }}
                  />
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreateInfoCriminal((p) => [...p, { key: "", value: "" }])}>
                + Field
              </button>
            </div>
            <div className="panel-toolbar">
              <button type="submit" className="btn btn-primary">
                Create case file
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {tab === "newEntity" ? (
        <section className="panel">
          <h3>New person / entity profile</h3>
          <p className="page-lead muted" style={{ marginTop: 0 }}>
            Creates a <strong>non-criminal</strong> record for supporters, followers, or standalone targets. Link it from a case file&apos;s <em>Case links</em> tab,
            or use <strong>Mark as criminal</strong> on the entity page later.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void doCreateEntity();
            }}
          >
            <div className="row grid-2">
              <label className="field">
                <span>Name</span>
                <input value={entityForm.name} onChange={(e) => setEntityForm((p) => ({ ...p, name: e.target.value }))} required />
              </label>
              <label className="field">
                <span>Organization</span>
                <input value={entityForm.organization} onChange={(e) => setEntityForm((p) => ({ ...p, organization: e.target.value }))} />
              </label>
              <label className="field">
                <span>Phone</span>
                <input value={entityForm.phone} onChange={(e) => setEntityForm((p) => ({ ...p, phone: e.target.value }))} />
              </label>
              <label className="field">
                <span>Email (contact)</span>
                <input value={entityForm.email_contact} onChange={(e) => setEntityForm((p) => ({ ...p, email_contact: e.target.value }))} />
              </label>
              <label className="field full">
                <span>Address</span>
                <textarea value={entityForm.address} onChange={(e) => setEntityForm((p) => ({ ...p, address: e.target.value }))} rows={2} />
              </label>
              <label className="field">
                <span>Social media / OSINT</span>
                <input value={entityForm.social_media} onChange={(e) => setEntityForm((p) => ({ ...p, social_media: e.target.value }))} />
              </label>
              <label className="field">
                <span>Active</span>
                <select
                  value={entityForm.active_status ? "true" : "false"}
                  onChange={(e) => setEntityForm((p) => ({ ...p, active_status: e.target.value === "true" }))}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label className="field full">
                <span>Details</span>
                <textarea value={entityForm.details} onChange={(e) => setEntityForm((p) => ({ ...p, details: e.target.value }))} />
              </label>
              <label className="field full">
                <span>Remarks</span>
                <input value={entityForm.remarks} onChange={(e) => setEntityForm((p) => ({ ...p, remarks: e.target.value }))} />
              </label>
            </div>
            <div className="subpanel">
              <div className="subpanel-title">Additional info (searchable)</div>
              {createInfoEntity.map((r, idx) => (
                <div className="row grid-2 kv-row" key={idx}>
                  <input
                    placeholder="key"
                    value={r.key}
                    onChange={(e) => {
                      const n = [...createInfoEntity];
                      n[idx] = { ...n[idx], key: e.target.value };
                      setCreateInfoEntity(n);
                    }}
                  />
                  <input
                    placeholder="value"
                    value={r.value}
                    onChange={(e) => {
                      const n = [...createInfoEntity];
                      n[idx] = { ...n[idx], value: e.target.value };
                      setCreateInfoEntity(n);
                    }}
                  />
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreateInfoEntity((p) => [...p, { key: "", value: "" }])}>
                + Field
              </button>
            </div>
            <div className="panel-toolbar">
              <button type="submit" className="btn btn-primary">
                Create entity profile
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
