import React, { useEffect, useMemo, useState } from "react";
import {
  createProfile,
  deleteProfile,
  getFollowers,
  getProfile,
  getProfilePhotos,
  getSupporters,
  linkProfile,
  login,
  logout,
  register,
  searchProfiles,
  updateProfile,
  uploadProfilePhotos,
} from "./api";
import "./styles.css";

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

type SearchResponse = {
  profiles: Profile[];
  related_profiles: Relation[];
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
    if (!k) continue;
    const v = r.value;
    if (v.trim() === "") continue;
    out[k] = v.trim();
  }
  return out;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [error, setError] = useState("");

  const [view, setView] = useState<"dashboard" | "profile" | "manage">("dashboard");
  const [selectedCriminalId, setSelectedCriminalId] = useState<string>("");

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);

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
    size: 10,
  });

  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [followers, setFollowers] = useState<Relation[]>([]);
  const [supporters, setSupporters] = useState<Relation[]>([]);

  // Create profile (criminal or user)
  const [createPayload, setCreatePayload] = useState({
    kind: "criminal" as ProfileKind,
    name: "",
    image: "",
    social_media: "",
    organization: "",
    fir_number: "",
    details: "",
    active_status: true,
    remarks: "",
  });
  const [createInfo, setCreateInfo] = useState<InfoRow[]>([{ key: "", value: "" }]);
  const [createResult, setCreateResult] = useState("");

  // Edit profile
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
  const [editResult, setEditResult] = useState("");

  // Relationship link form
  const [linkForm, setLinkForm] = useState({
    follower_id: "",
    role: "supporter" as "supporter" | "follower",
    remark: "",
  });
  const [linkResult, setLinkResult] = useState("");

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t) setToken(t);
  }, []);

  useEffect(() => {
    if (token) {
      setView("dashboard");
    }
  }, [token]);

  const tokenPill = useMemo(() => {
    if (!token) return "Not authenticated";
    return "Authenticated";
  }, [token]);

  const doLogin = async () => {
    setAuthError("");
    setError("");
    try {
      const data = await login(loginUsername.trim(), loginPassword);
      localStorage.setItem("token", data.access_token);
      setToken(data.access_token);
    } catch (e: any) {
      setAuthError(e.message || "Login failed");
    }
  };

  const doRegister = async () => {
    setAuthError("");
    setError("");
    try {
      await register(registerUsername.trim(), registerPassword, registerEmail.trim());
      setAuthError("Registered successfully. Please login.");
    } catch (e: any) {
      setAuthError(e.message || "Register failed");
    }
  };

  const logoutNow = async () => {
    try {
      await logout();
    } catch {
      // ignore
    } finally {
      localStorage.removeItem("token");
      setToken(null);
      setView("dashboard");
      setSelectedCriminalId("");
      setProfile(null);
    }
  };

  const doSearch = async () => {
    setError("");
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const infoObj = infoRowsToObject(searchBase.info);
      const payload: any = cleanObject({
        name: searchBase.name,
        fir_number: searchBase.fir_number,
        organization: searchBase.organization,
        social_media: searchBase.social_media,
        details: searchBase.details,
        size: searchBase.size,
        active_status:
          searchBase.active_status === "" ? undefined : searchBase.active_status === "true",
        role: searchBase.role === "" ? undefined : searchBase.role,
        link_remark: searchBase.link_remark,
        info: Object.keys(infoObj).length ? infoObj : undefined,
      });

      const res = (await searchProfiles(payload)) as SearchResponse;
      setSearchResult(res);
    } catch (e: any) {
      setError(e.message || "Search failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const loadProfileDetail = async (criminalProfileId: string) => {
    setProfileLoading(true);
    setError("");
    try {
      setSelectedCriminalId(criminalProfileId);
      setView("profile");
      const p = (await getProfile(criminalProfileId)) as Profile;
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

      const photoRes = await getProfilePhotos(criminalProfileId);
      setPhotos(photoRes.photos ?? []);

      const followersRes = await getFollowers(criminalProfileId);
      setFollowers(followersRes.followers ?? []);

      const supportersRes = await getSupporters(criminalProfileId);
      setSupporters(supportersRes.supporters ?? []);
    } catch (e: any) {
      setError(e.message || "Failed to load profile");
    } finally {
      setProfileLoading(false);
    }
  };

  const doCreate = async () => {
    setError("");
    setCreateResult("");
    try {
      const infoObj = infoRowsToObject(createInfo);
      const payload: any = cleanObject({
        kind: createPayload.kind,
        name: createPayload.name,
        image: createPayload.image || undefined,
        social_media: createPayload.social_media || undefined,
        organization: createPayload.organization || undefined,
        fir_number: createPayload.kind === "criminal" ? createPayload.fir_number || undefined : undefined,
        details: createPayload.details || undefined,
        active_status: createPayload.active_status,
        remarks: createPayload.remarks || undefined,
        info: Object.keys(infoObj).length ? infoObj : undefined,
      });
      const res = await createProfile(payload);
      setCreateResult(`Created: ${res.profile_id}`);
    } catch (e: any) {
      setError(e.message || "Create failed");
    }
  };

  const doUpdateProfile = async () => {
    if (!profile) return;
    setError("");
    setEditResult("");
    try {
      const infoObj = infoRowsToObject(editInfo);
      const payload: any = cleanObject({
        name: editForm.name,
        image: editForm.image || undefined,
        social_media: editForm.social_media || undefined,
        organization: editForm.organization || undefined,
        fir_number: profile.kind === "criminal" ? (editForm.fir_number || undefined) : undefined,
        details: editForm.details || undefined,
        active_status: editForm.active_status,
        remarks: editForm.remarks || undefined,
        info: Object.keys(infoObj).length ? infoObj : undefined,
      });
      await updateProfile(profile.profile_id, payload);
      setEditResult("Updated successfully");
      await loadProfileDetail(profile.profile_id);
    } catch (e: any) {
      setError(e.message || "Update failed");
    }
  };

  const doDeleteProfile = async () => {
    if (!selectedCriminalId) return;
    setError("");
    try {
      await deleteProfile(selectedCriminalId);
      setProfile(null);
      setPhotos([]);
      setFollowers([]);
      setSupporters([]);
      setSelectedCriminalId("");
      setView("dashboard");
    } catch (e: any) {
      setError(e.message || "Delete failed");
    }
  };

  const doLink = async () => {
    if (!selectedCriminalId) return;
    setError("");
    setLinkResult("");
    try {
      if (!linkForm.follower_id.trim()) throw new Error("follower_id is required");
      await linkProfile(selectedCriminalId, linkForm.follower_id.trim(), linkForm.role, linkForm.remark.trim() || undefined);
      setLinkResult("Linked successfully");
      setLinkForm((p) => ({ ...p, follower_id: "", remark: "" }));
      const followersRes = await getFollowers(selectedCriminalId);
      setFollowers(followersRes.followers ?? []);
      const supportersRes = await getSupporters(selectedCriminalId);
      setSupporters(supportersRes.supporters ?? []);
    } catch (e: any) {
      setError(e.message || "Link failed");
    }
  };

  const doPhotoUpload = async (files: FileList | null) => {
    if (!selectedCriminalId || !files || files.length === 0) return;
    setError("");
    try {
      await uploadProfilePhotos(selectedCriminalId, files);
      const photoRes = await getProfilePhotos(selectedCriminalId);
      setPhotos(photoRes.photos ?? []);
    } catch (e: any) {
      setError(e.message || "Photo upload failed");
    }
  };

  const activeRelatedCounts = useMemo(() => {
    if (!searchResult || !selectedCriminalId) return { supporters: 0, followers: 0 };
    const rel = searchResult.related_profiles.filter((r) => r.criminal_profile_id === selectedCriminalId);
    return {
      supporters: rel.filter((r) => r.role === "supporter").length,
      followers: rel.filter((r) => r.role === "follower").length,
    };
  }, [searchResult, selectedCriminalId]);

  if (!token) {
    return (
      <div className="wrap">
        <div className="header">
          <div className="title">Criminal Database Intelligence</div>
          <div className="pill">Phase 1</div>
        </div>
        <div className="grid">
          <div className="panel">
            <h3>Login</h3>
            <div className="row">
              <div>
                <label>Username</label>
                <input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} />
              </div>
              <div>
                <label>Password</label>
                <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
              </div>
            </div>
            <div className="actions">
              <button className="primary" onClick={doLogin}>
                Login
              </button>
            </div>
            {authError ? <div className="error">{authError}</div> : null}
          </div>
          <div className="panel">
            <h3>Register</h3>
            <div className="row">
              <div>
                <label>Username</label>
                <input value={registerUsername} onChange={(e) => setRegisterUsername(e.target.value)} />
              </div>
              <div>
                <label>Email</label>
                <input value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} />
              </div>
              <div>
                <label>Password</label>
                <input type="password" value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} />
              </div>
            </div>
            <div className="actions">
              <button className="primary" onClick={doRegister}>
                Create Account
              </button>
            </div>
            {authError ? <div className="error">{authError}</div> : null}
          </div>
        </div>
        {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="header">
        <div className="title">Analyst Workspace</div>
        <div className="pill">{tokenPill}</div>
      </div>

      <div className="nav">
        <button className={view === "dashboard" ? "primary" : ""} onClick={() => setView("dashboard")}>
          Dashboard
        </button>
        <button className={view === "manage" ? "primary" : ""} onClick={() => setView("manage")}>
          Create Profiles
        </button>
        {selectedCriminalId ? (
          <button className={view === "profile" ? "primary" : ""} onClick={() => loadProfileDetail(selectedCriminalId)}>
            Criminal Detail
          </button>
        ) : null}
        <button className="danger" onClick={logoutNow}>
          Logout
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {view === "dashboard" ? (
        <div className="grid" style={{ marginTop: 14 }}>
          <div className="panel">
            <h3>Global Search (Elasticsearch)</h3>
            <div className="row">
              <div>
                <label>Criminal / Person name</label>
                <input value={searchBase.name} onChange={(e) => setSearchBase((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label>FIR Number</label>
                <input value={searchBase.fir_number} onChange={(e) => setSearchBase((p) => ({ ...p, fir_number: e.target.value }))} />
              </div>
              <div>
                <label>Organization</label>
                <input value={searchBase.organization} onChange={(e) => setSearchBase((p) => ({ ...p, organization: e.target.value }))} />
              </div>
              <div>
                <label>Social media</label>
                <input value={searchBase.social_media} onChange={(e) => setSearchBase((p) => ({ ...p, social_media: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label>Details / Remarks (profile)</label>
                <textarea value={searchBase.details} onChange={(e) => setSearchBase((p) => ({ ...p, details: e.target.value }))} />
              </div>

              <div>
                <label>Active status (criminal)</label>
                <select value={searchBase.active_status} onChange={(e) => setSearchBase((p) => ({ ...p, active_status: e.target.value as any }))}>
                  <option value="">Any</option>
                  <option value="true">Active only</option>
                  <option value="false">Inactive only</option>
                </select>
              </div>
              <div>
                <label>Relationship type (connected)</label>
                <select value={searchBase.role} onChange={(e) => setSearchBase((p) => ({ ...p, role: e.target.value as any }))}>
                  <option value="">Both</option>
                  <option value="supporter">Supporters</option>
                  <option value="follower">Followers</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label>Relationship remark (supporter/follower)</label>
                <input value={searchBase.link_remark} onChange={(e) => setSearchBase((p) => ({ ...p, link_remark: e.target.value }))} />
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900 }}>Additional Info Search (info.*)</div>
              <div className="meta">Add any analyst field and Elasticsearch will search it.</div>
              <div className="list" style={{ marginTop: 10 }}>
                {searchBase.info.map((r, idx) => (
                  <div key={idx} className="row" style={{ margin: 0 }}>
                    <div>
                      <label>Key</label>
                      <input
                        value={r.key}
                        onChange={(e) => {
                          const next = [...searchBase.info];
                          next[idx] = { ...next[idx], key: e.target.value };
                          setSearchBase((p) => ({ ...p, info: next }));
                        }}
                        placeholder="case_number"
                      />
                    </div>
                    <div>
                      <label>Value</label>
                      <input
                        value={r.value}
                        onChange={(e) => {
                          const next = [...searchBase.info];
                          next[idx] = { ...next[idx], value: e.target.value };
                          setSearchBase((p) => ({ ...p, info: next }));
                        }}
                        placeholder="12/2024"
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button
                        onClick={() => {
                          setSearchBase((p) => ({ ...p, info: p.info.length > 1 ? p.info.filter((_, i) => i !== idx) : p.info }));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="actions" style={{ marginTop: 10 }}>
                <button
                  className="primary"
                  onClick={() => setSearchBase((p) => ({ ...p, info: [...p.info, { key: "", value: "" }] }))}
                >
                  + Add info field
                </button>
              </div>
            </div>

            <div className="actions" style={{ marginTop: 12 }}>
              <button className="primary" onClick={doSearch} disabled={searchLoading}>
                {searchLoading ? "Searching..." : "Search"}
              </button>
              <button
                onClick={() => {
                  setSearchBase({
                    name: "",
                    fir_number: "",
                    organization: "",
                    social_media: "",
                    details: "",
                    active_status: "",
                    role: "",
                    link_remark: "",
                    info: [{ key: "", value: "" }],
                    size: 10,
                  });
                  setSearchResult(null);
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {searchResult ? (
            <div className="panel">
              <h3>Results</h3>
              <div className="meta">
                Returned criminals that match, plus criminals connected via supporters/followers that match.
              </div>
              <div className="list" style={{ marginTop: 12 }}>
                {searchResult.profiles.map((p) => (
                  <button
                    key={p.profile_id}
                    className="card"
                    onClick={() => loadProfileDetail(p.profile_id)}
                    style={{ textAlign: "left" }}
                  >
                    <div style={{ fontWeight: 900 }}>{p.name}</div>
                    <div className="meta">id={p.profile_id} | fir={p.fir_number ?? "-"} | org={p.organization ?? "-"}</div>
                    <div className="meta">Active={p.active_status ? "Yes" : "No"}</div>
                  </button>
                ))}
                {searchResult.profiles.length === 0 ? <div className="card">No matches found.</div> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {view === "manage" ? (
        <div className="grid" style={{ marginTop: 14 }}>
          <div className="panel">
            <h3>Create Profile (Criminal or User)</h3>
            <div className="row">
              <div>
                <label>Kind</label>
                <select value={createPayload.kind} onChange={(e) => setCreatePayload((p) => ({ ...p, kind: e.target.value as any }))}>
                  <option value="criminal">criminal</option>
                  <option value="user">user</option>
                </select>
              </div>
              <div>
                <label>Name</label>
                <input value={createPayload.name} onChange={(e) => setCreatePayload((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label>Organization</label>
                <input
                  value={createPayload.organization}
                  onChange={(e) => setCreatePayload((p) => ({ ...p, organization: e.target.value }))}
                />
              </div>
              <div>
                <label>Social media</label>
                <input value={createPayload.social_media} onChange={(e) => setCreatePayload((p) => ({ ...p, social_media: e.target.value }))} />
              </div>
              <div>
                <label>FIR Number (criminal only)</label>
                <input
                  value={createPayload.fir_number}
                  onChange={(e) => setCreatePayload((p) => ({ ...p, fir_number: e.target.value }))}
                  disabled={createPayload.kind !== "criminal"}
                />
              </div>
              <div>
                <label>Profile image URL (optional)</label>
                <input value={createPayload.image} onChange={(e) => setCreatePayload((p) => ({ ...p, image: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label>Details / general remarks</label>
                <textarea value={createPayload.details} onChange={(e) => setCreatePayload((p) => ({ ...p, details: e.target.value }))} />
              </div>
              <div>
                <label>Active status</label>
                <select value={createPayload.active_status ? "true" : "false"} onChange={(e) => setCreatePayload((p) => ({ ...p, active_status: e.target.value === "true" }))}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              <div>
                <label>Remarks</label>
                <input value={createPayload.remarks} onChange={(e) => setCreatePayload((p) => ({ ...p, remarks: e.target.value }))} />
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900 }}>Additional Info</div>
              <div className="meta">Analyst-defined key/value fields (searchable).</div>
              <div className="list" style={{ marginTop: 10 }}>
                {createInfo.map((r, idx) => (
                  <div key={idx} className="row" style={{ margin: 0 }}>
                    <div>
                      <label>Key</label>
                      <input
                        value={r.key}
                        onChange={(e) => {
                          const next = [...createInfo];
                          next[idx] = { ...next[idx], key: e.target.value };
                          setCreateInfo(next);
                        }}
                        placeholder="alias"
                      />
                    </div>
                    <div>
                      <label>Value</label>
                      <input
                        value={r.value}
                        onChange={(e) => {
                          const next = [...createInfo];
                          next[idx] = { ...next[idx], value: e.target.value };
                          setCreateInfo(next);
                        }}
                        placeholder="Alias name"
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button
                        onClick={() => setCreateInfo((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p))}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="actions" style={{ marginTop: 10 }}>
                <button className="primary" onClick={() => setCreateInfo((p) => [...p, { key: "", value: "" }])}>
                  + Add info field
                </button>
              </div>
            </div>

            <div className="actions" style={{ marginTop: 12 }}>
              <button className="primary" onClick={doCreate}>
                Create Profile
              </button>
              <button
                onClick={() => {
                  setCreatePayload({
                    kind: "criminal",
                    name: "",
                    image: "",
                    social_media: "",
                    organization: "",
                    fir_number: "",
                    details: "",
                    active_status: true,
                    remarks: "",
                  });
                  setCreateInfo([{ key: "", value: "" }]);
                  setCreateResult("");
                }}
              >
                Reset
              </button>
            </div>

            {createResult ? <div className="card" style={{ marginTop: 10 }}>{createResult}</div> : null}
          </div>
        </div>
      ) : null}

      {view === "profile" ? (
        <div className="grid" style={{ marginTop: 14 }}>
          <div className="panel">
            <h3>Criminal Profile Detail</h3>
            {profileLoading || !profile ? <div className="card">Loading...</div> : null}
            {profile && !profileLoading ? (
              <>
                <div className="card">
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{profile.name}</div>
                  <div className="meta">
                    id={profile.profile_id} | fir={profile.fir_number ?? "-"} | org={profile.organization ?? "-"} | Active=
                    {profile.active_status ? "Yes" : "No"}
                  </div>
                  {profile.remarks ? <div className="meta">Remarks: {profile.remarks}</div> : null}
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <div>
                    <label>Update name</label>
                    <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <label>Active status</label>
                    <select value={editForm.active_status ? "true" : "false"} onChange={(e) => setEditForm((p) => ({ ...p, active_status: e.target.value === "true" }))}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label>Organization</label>
                    <input value={editForm.organization} onChange={(e) => setEditForm((p) => ({ ...p, organization: e.target.value }))} />
                  </div>
                  <div>
                    <label>FIR Number</label>
                    <input value={editForm.fir_number} onChange={(e) => setEditForm((p) => ({ ...p, fir_number: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label>Details</label>
                    <textarea value={editForm.details} onChange={(e) => setEditForm((p) => ({ ...p, details: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label>Remarks</label>
                    <input value={editForm.remarks} onChange={(e) => setEditForm((p) => ({ ...p, remarks: e.target.value }))} />
                  </div>
                </div>

                <div className="card" style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 900 }}>Additional Info Fields (searchable)</div>
                  <div className="meta">Edit any custom analyst fields here.</div>
                  <div className="list" style={{ marginTop: 10 }}>
                    {editInfo.map((r, idx) => (
                      <div key={idx} className="row" style={{ margin: 0 }}>
                        <div>
                          <label>Key</label>
                          <input
                            value={r.key}
                            onChange={(e) => {
                              const next = [...editInfo];
                              next[idx] = { ...next[idx], key: e.target.value };
                              setEditInfo(next);
                            }}
                          />
                        </div>
                        <div>
                          <label>Value</label>
                          <input
                            value={r.value}
                            onChange={(e) => {
                              const next = [...editInfo];
                              next[idx] = { ...next[idx], value: e.target.value };
                              setEditInfo(next);
                            }}
                          />
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-end" }}>
                          <button onClick={() => setEditInfo((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p))}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="actions" style={{ marginTop: 10 }}>
                    <button className="primary" onClick={() => setEditInfo((p) => [...p, { key: "", value: "" }])}>
                      + Add field
                    </button>
                  </div>
                </div>

                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="primary" onClick={doUpdateProfile}>
                    Update Profile
                  </button>
                  <button className="danger" onClick={doDeleteProfile}>
                    Delete Profile
                  </button>
                </div>
                {editResult ? <div className="card" style={{ marginTop: 10 }}>{editResult}</div> : null}

                <div className="card" style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 900 }}>Photos</div>
                  <div className="meta">Upload multiple photos for this profile.</div>
                  <div className="actions" style={{ marginTop: 10 }}>
                    <input type="file" multiple accept="image/*" onChange={(e) => doPhotoUpload(e.target.files)} />
                  </div>
                  <div className="list" style={{ marginTop: 10 }}>
                    {photos.length ? (
                      photos.map((p) => (
                        <div key={p.photo_id} className="card">
                          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                          {/* @ts-ignore */}
                          <img src={p.image_url} alt="profile" style={{ width: "100%", borderRadius: 10 }} />
                          <div className="meta">{p.uploaded_at ?? ""}</div>
                        </div>
                      ))
                    ) : (
                      <div className="card">No photos uploaded yet.</div>
                    )}
                  </div>
                </div>

                <div className="card" style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 900 }}>Add Supporter / Follower</div>
                  <div className="meta">You can link any profile (criminal or user).</div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <div>
                      <label>linked_profile_id</label>
                      <input
                        value={linkForm.follower_id}
                        onChange={(e) => setLinkForm((p) => ({ ...p, follower_id: e.target.value }))}
                        placeholder="e.g. 1234-...."
                      />
                    </div>
                    <div>
                      <label>Role</label>
                      <select value={linkForm.role} onChange={(e) => setLinkForm((p) => ({ ...p, role: e.target.value as any }))}>
                        <option value="supporter">supporter</option>
                        <option value="follower">follower</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label>Remark</label>
                      <input value={linkForm.remark} onChange={(e) => setLinkForm((p) => ({ ...p, remark: e.target.value }))} placeholder="why linked / context" />
                    </div>
                  </div>
                  <div className="actions" style={{ marginTop: 10 }}>
                    <button className="primary" onClick={doLink}>
                      Link
                    </button>
                  </div>
                  {linkResult ? <div className="card" style={{ marginTop: 10 }}>{linkResult}</div> : null}
                </div>

                <div className="row" style={{ marginTop: 14 }}>
                  <div className="panel" style={{ margin: 0 }}>
                    <h3>Supporters</h3>
                    <div className="list">
                      {supporters.length ? (
                        supporters.map((r) => (
                          <div key={`${r.criminal_profile_id}-${r.linked_profile_id}-supporter`} className="card">
                            <div style={{ fontWeight: 900 }}>{r.linked_name}</div>
                            <div className="meta">id={r.linked_profile_id}</div>
                            {r.remark ? <div className="meta">Remark: {r.remark}</div> : null}
                          </div>
                        ))
                      ) : (
                        <div className="card">No supporters yet.</div>
                      )}
                    </div>
                  </div>
                  <div className="panel" style={{ margin: 0 }}>
                    <h3>Followers</h3>
                    <div className="list">
                      {followers.length ? (
                        followers.map((r) => (
                          <div key={`${r.criminal_profile_id}-${r.linked_profile_id}-follower`} className="card">
                          <div style={{ fontWeight: 900 }}>{r.linked_name}</div>
                          <div className="meta">id={r.linked_profile_id}</div>
                          {r.remark ? <div className="meta">Remark: {r.remark}</div> : null}
                          </div>
                        ))
                      ) : (
                        <div className="card">No followers yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

