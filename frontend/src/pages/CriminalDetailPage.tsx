import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  deleteProfile,
  getFollowers,
  getProfile,
  getProfilePhotos,
  getSupporters,
  linkProfile,
  updateProfile,
  uploadProfilePhotos,
} from "../api";

type ProfileKind = "criminal" | "user";

type Profile = {
  profile_id: string;
  kind: ProfileKind;
  name: string;
  image?: string | null;
  fir_number?: string | null;
  social_media?: string | null;
  organization?: string | null;
  details?: string | null;
  active_status: boolean;
  remarks?: string | null;
  info?: Record<string, any> | null;
};

type Relation = {
  criminal_profile_id: string;
  linked_profile_id: string;
  linked_kind: ProfileKind;
  linked_name: string;
  linked_image?: string | null;
  role: "supporter" | "follower";
  remark?: string | null;
};

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
    if (!k || r.value.trim() === "") continue;
    out[k] = r.value.trim();
  }
  return out;
}

export default function CriminalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"basic" | "photos" | "relations" | "info">("basic");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [followers, setFollowers] = useState<Relation[]>([]);
  const [supporters, setSupporters] = useState<Relation[]>([]);

  const [editForm, setEditForm] = useState({
    name: "",
    image: "",
    social_media: "",
    organization: "",
    fir_number: "",
    details: "",
    active_status: true,
    remarks: "",
  });
  const [editInfo, setEditInfo] = useState<InfoRow[]>([{ key: "", value: "" }]);
  const [editMsg, setEditMsg] = useState("");

  const [linkForm, setLinkForm] = useState({ follower_id: "", role: "supporter" as "supporter" | "follower", remark: "" });
  const [linkMsg, setLinkMsg] = useState("");

  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const p = (await getProfile(id)) as Profile;
      if (p.kind !== "criminal") {
        setError("This profile is not a criminal record.");
        setProfile(p);
        setLoading(false);
        return;
      }
      setProfile(p);
      setEditForm({
        name: p.name ?? "",
        image: (p.image as any) ?? "",
        social_media: p.social_media ?? "",
        organization: p.organization ?? "",
        fir_number: p.fir_number ?? "",
        details: p.details ?? "",
        active_status: p.active_status ?? true,
        remarks: p.remarks ?? "",
      });
      const infoObj = p.info ?? {};
      const rows: InfoRow[] = Object.entries(infoObj).map(([k, v]) => ({ key: k, value: String(v ?? "") }));
      setEditInfo(rows.length ? rows : [{ key: "", value: "" }]);

      const photoRes = await getProfilePhotos(id);
      setPhotos(photoRes.photos ?? []);
      const fr = await getFollowers(id);
      setFollowers(fr.followers ?? []);
      const sp = await getSupporters(id);
      setSupporters(sp.supporters ?? []);
    } catch (e: any) {
      setError(e.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveProfile = async () => {
    if (!profile) return;
    setError("");
    setEditMsg("");
    try {
      const infoObj = infoRowsToObject(editInfo);
      const payload = cleanObject({
        name: editForm.name,
        image: editForm.image || undefined,
        social_media: editForm.social_media || undefined,
        organization: editForm.organization || undefined,
        fir_number: editForm.fir_number || undefined,
        details: editForm.details || undefined,
        active_status: editForm.active_status,
        remarks: editForm.remarks || undefined,
        info: Object.keys(infoObj).length ? infoObj : undefined,
      });
      await updateProfile(profile.profile_id, payload);
      setEditMsg("Saved.");
      await load();
    } catch (e: any) {
      setError(e.message || "Update failed");
    }
  };

  const removeProfile = async () => {
    if (!id || !window.confirm("Delete this criminal profile permanently?")) return;
    try {
      await deleteProfile(id);
      navigate("/profiles", { replace: true });
    } catch (e: any) {
      setError(e.message || "Delete failed");
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!id || !files?.length) return;
    try {
      await uploadProfilePhotos(id, files);
      const photoRes = await getProfilePhotos(id);
      setPhotos(photoRes.photos ?? []);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    }
  };

  const doLink = async () => {
    if (!id) return;
    setLinkMsg("");
    try {
      if (!linkForm.follower_id.trim()) throw new Error("Linked profile id required");
      await linkProfile(id, linkForm.follower_id.trim(), linkForm.role, linkForm.remark.trim() || undefined);
      setLinkForm((p) => ({ ...p, follower_id: "", remark: "" }));
      setLinkMsg("Relationship saved.");
      const fr = await getFollowers(id);
      setFollowers(fr.followers ?? []);
      const sp = await getSupporters(id);
      setSupporters(sp.supporters ?? []);
    } catch (e: any) {
      setError(e.message || "Link failed");
    }
  };

  if (!id) return <div className="empty-state">Missing profile id.</div>;

  return (
    <div className="page criminal-detail">
      <div className="profile-hero">
        <div className="profile-hero-main">
          <div className="avatar-lg">{profile?.name?.slice(0, 1)?.toUpperCase() ?? "?"}</div>
          <div>
            <h2>{profile?.name ?? "Loading…"}</h2>
            <div className="profile-badges">
              <span className="pill subtle">Criminal</span>
              {profile ? (
                <span className={profile.active_status ? "status-pill on" : "status-pill off"}>
                  {profile.active_status ? "Active" : "Inactive"}
                </span>
              ) : null}
              <span className="pill subtle mono">{id}</span>
            </div>
          </div>
        </div>
        <div className="profile-hero-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/search")}>
            Back to search
          </button>
          <button type="button" className="btn btn-danger-outline" onClick={removeProfile}>
            Delete
          </button>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="tabs underline">
        <button type="button" className={tab === "basic" ? "active" : ""} onClick={() => setTab("basic")}>
          Basic info
        </button>
        <button type="button" className={tab === "photos" ? "active" : ""} onClick={() => setTab("photos")}>
          Photos
        </button>
        <button type="button" className={tab === "relations" ? "active" : ""} onClick={() => setTab("relations")}>
          Supporters / followers
        </button>
        <button type="button" className={tab === "info" ? "active" : ""} onClick={() => setTab("info")}>
          Additional info
        </button>
      </div>

      {loading ? <div className="panel">Loading…</div> : null}

      {!loading && profile && tab === "basic" ? (
        <section className="panel">
          <div className="row grid-2">
            <label className="field">
              <span>Name</span>
              <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
            </label>
            <label className="field">
              <span>Active</span>
              <select
                value={editForm.active_status ? "true" : "false"}
                onChange={(e) => setEditForm((p) => ({ ...p, active_status: e.target.value === "true" }))}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label className="field">
              <span>FIR number</span>
              <input value={editForm.fir_number} onChange={(e) => setEditForm((p) => ({ ...p, fir_number: e.target.value }))} />
            </label>
            <label className="field">
              <span>Organization</span>
              <input value={editForm.organization} onChange={(e) => setEditForm((p) => ({ ...p, organization: e.target.value }))} />
            </label>
            <label className="field">
              <span>Social media</span>
              <input value={editForm.social_media} onChange={(e) => setEditForm((p) => ({ ...p, social_media: e.target.value }))} />
            </label>
            <label className="field">
              <span>Image URL</span>
              <input value={editForm.image} onChange={(e) => setEditForm((p) => ({ ...p, image: e.target.value }))} />
            </label>
            <label className="field full">
              <span>Details</span>
              <textarea value={editForm.details} onChange={(e) => setEditForm((p) => ({ ...p, details: e.target.value }))} />
            </label>
            <label className="field full">
              <span>Remarks</span>
              <input value={editForm.remarks} onChange={(e) => setEditForm((p) => ({ ...p, remarks: e.target.value }))} />
            </label>
          </div>
          <div className="panel-toolbar">
            <button type="button" className="btn btn-primary" onClick={saveProfile}>
              Save changes
            </button>
            {editMsg ? <span className="ok-text">{editMsg}</span> : null}
          </div>
        </section>
      ) : null}

      {!loading && profile && tab === "photos" ? (
        <section className="panel">
          <div
            className={`dropzone ${dragOver ? "active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onFiles(e.dataTransfer.files);
            }}
          >
            <p>Drag &amp; drop images here, or choose files</p>
            <input type="file" multiple accept="image/*" onChange={(e) => onFiles(e.target.files)} />
          </div>
          <div className="photo-grid">
            {photos.map((p) => (
              <div key={p.photo_id} className="photo-tile">
                <img src={p.image_url} alt="" />
                <div className="photo-cap">{p.uploaded_at}</div>
              </div>
            ))}
            {photos.length === 0 ? <div className="empty-state">No photos uploaded.</div> : null}
          </div>
        </section>
      ) : null}

      {!loading && profile && tab === "relations" ? (
        <div className="two-col">
          <section className="panel">
            <h3>Link entity</h3>
            <div className="row grid-2">
              <label className="field">
                <span>Linked profile ID</span>
                <input value={linkForm.follower_id} onChange={(e) => setLinkForm((p) => ({ ...p, follower_id: e.target.value }))} />
              </label>
              <label className="field">
                <span>Role</span>
                <select value={linkForm.role} onChange={(e) => setLinkForm((p) => ({ ...p, role: e.target.value as any }))}>
                  <option value="supporter">Supporter</option>
                  <option value="follower">Follower</option>
                </select>
              </label>
              <label className="field full">
                <span>Remark</span>
                <input value={linkForm.remark} onChange={(e) => setLinkForm((p) => ({ ...p, remark: e.target.value }))} />
              </label>
            </div>
            <button type="button" className="btn btn-primary" onClick={doLink}>
              Add relationship
            </button>
            {linkMsg ? <div className="alert alert-info">{linkMsg}</div> : null}
          </section>
          <section className="panel">
            <h3>Supporters</h3>
            <div className="card-list dense">
              {supporters.map((r) => (
                <div key={r.linked_profile_id + "s"} className="mini-card">
                  <div className="mini-title">
                    {r.linked_name} <span className="pill subtle">{r.linked_kind}</span>
                  </div>
                  {r.remark ? <div className="mini-remark">{r.remark}</div> : null}
                </div>
              ))}
              {!supporters.length ? <div className="empty-state">None</div> : null}
            </div>
          </section>
          <section className="panel">
            <h3>Followers</h3>
            <div className="card-list dense">
              {followers.map((r) => (
                <div key={r.linked_profile_id + "f"} className="mini-card">
                  <div className="mini-title">
                    {r.linked_name} <span className="pill subtle">{r.linked_kind}</span>
                  </div>
                  {r.remark ? <div className="mini-remark">{r.remark}</div> : null}
                </div>
              ))}
              {!followers.length ? <div className="empty-state">None</div> : null}
            </div>
          </section>
        </div>
      ) : null}

      {!loading && profile && tab === "info" ? (
        <section className="panel">
          <p className="page-lead">Key/value fields are indexed for search (`info.*` in Elasticsearch).</p>
          {editInfo.map((r, idx) => (
            <div className="row grid-2 kv-row" key={idx}>
              <input
                value={r.key}
                onChange={(e) => {
                  const n = [...editInfo];
                  n[idx] = { ...n[idx], key: e.target.value };
                  setEditInfo(n);
                }}
              />
              <input
                value={r.value}
                onChange={(e) => {
                  const n = [...editInfo];
                  n[idx] = { ...n[idx], value: e.target.value };
                  setEditInfo(n);
                }}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditInfo((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p))}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditInfo((p) => [...p, { key: "", value: "" }])}>
            + Add field
          </button>
          <div className="panel-toolbar">
            <button type="button" className="btn btn-primary" onClick={saveProfile}>
              Save info
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
