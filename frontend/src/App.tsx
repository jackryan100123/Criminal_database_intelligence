import React, { useEffect, useMemo, useState } from "react";
import {
  createProfile,
  deleteProfile,
  getFollowers,
  getSupporters,
  linkProfile,
  login,
  logout,
  register,
  searchProfiles,
  updateProfile,
} from "./api";
import "./styles.css";

type Profile = {
  profile_id: string;
  kind: "criminal" | "user";
  name: string;
  image?: string | null;
  fir_number?: string | null;
  social_media?: string | null;
  organization?: string | null;
  details?: string | null;
};

type SearchResponse = {
  profiles: Profile[];
  related_profiles: Profile[];
};

type Tab = "search" | "create" | "update" | "link" | "followers";

function getDefaultCreatePayload() {
  return {
    kind: "criminal" as "criminal" | "user",
    name: "",
    image: "",
    social_media: "",
    organization: "",
    fir_number: "",
    details: "",
  };
}

function cleanObject(obj: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [tab, setTab] = useState<Tab>("search");

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");

  const [createPayload, setCreatePayload] = useState(getDefaultCreatePayload());
  const [createResult, setCreateResult] = useState<string>("");

  const [updateId, setUpdateId] = useState("");
  const [updatePayload, setUpdatePayload] = useState({
    name: "",
    image: "",
    social_media: "",
    organization: "",
    fir_number: "",
    details: "",
  });

  const [deleteId, setDeleteId] = useState("");
  const [updateResult, setUpdateResult] = useState<string>("");
  const [deleteResult, setDeleteResult] = useState<string>("");

  const [searchPayload, setSearchPayload] = useState({
    name: "",
    fir_number: "",
    social_media: "",
    organization: "",
    details: "",
    size: 10,
  });
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const [linkCriminalId, setLinkCriminalId] = useState("");
  const [linkFollowerId, setLinkFollowerId] = useState("");
  const [linkRole, setLinkRole] = useState<"supporter" | "follower">("supporter");
  const [linkResult, setLinkResult] = useState("");

  const [relCriminalId, setRelCriminalId] = useState("");
  const [followersResult, setFollowersResult] = useState<any>(null);
  const [supportersResult, setSupportersResult] = useState<any>(null);

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t) setToken(t);
  }, []);

  const logoutNow = async () => {
    try {
      await logout();
    } catch (e: any) {
      // Even if logout fails, clear token locally.
    } finally {
      localStorage.removeItem("token");
      setToken(null);
      setTab("search");
    }
  };

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

  const doCreate = async () => {
    setError("");
    setCreateResult("");
    try {
      const payload: any = cleanObject({
        ...createPayload,
        image: createPayload.image || undefined,
        social_media: createPayload.social_media || undefined,
        organization: createPayload.organization || undefined,
        fir_number: createPayload.kind === "criminal" ? createPayload.fir_number : undefined,
        details: createPayload.details || undefined,
      });
      const res = await createProfile(payload);
      setCreateResult(`Created: ${res.profile_id}`);
    } catch (e: any) {
      setError(e.message || "Create failed");
    }
  };

  const doUpdate = async () => {
    setError("");
    setUpdateResult("");
    try {
      if (!updateId.trim()) throw new Error("profile_id is required");
      const payload = cleanObject(updatePayload);
      if (Object.keys(payload).length === 0) throw new Error("Nothing to update");
      await updateProfile(updateId.trim(), payload);
      setUpdateResult("Updated successfully");
      setUpdatePayload({ name: "", image: "", social_media: "", organization: "", fir_number: "", details: "" });
    } catch (e: any) {
      setError(e.message || "Update failed");
    }
  };

  const doDelete = async () => {
    setError("");
    setDeleteResult("");
    try {
      if (!deleteId.trim()) throw new Error("profile_id is required");
      await deleteProfile(deleteId.trim());
      setDeleteResult("Deleted successfully");
    } catch (e: any) {
      setError(e.message || "Delete failed");
    }
  };

  const doSearch = async () => {
    setError("");
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const payload: any = cleanObject({
        ...searchPayload,
        size: searchPayload.size,
      });
      const res = (await searchProfiles(payload)) as SearchResponse;
      setSearchResult(res);
    } catch (e: any) {
      setError(e.message || "Search failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const doLink = async () => {
    setError("");
    setLinkResult("");
    try {
      if (!linkCriminalId.trim() || !linkFollowerId.trim()) throw new Error("Both IDs are required");
      await linkProfile(linkCriminalId.trim(), linkFollowerId.trim(), linkRole);
      setLinkResult("Linked successfully");
    } catch (e: any) {
      setError(e.message || "Link failed");
    }
  };

  const loadFollowersSupporters = async () => {
    setError("");
    setFollowersResult(null);
    setSupportersResult(null);
    try {
      if (!relCriminalId.trim()) throw new Error("criminal_profile_id is required");
      const followers = await getFollowers(relCriminalId.trim());
      const supporters = await getSupporters(relCriminalId.trim());
      setFollowersResult(followers);
      setSupportersResult(supporters);
    } catch (e: any) {
      setError(e.message || "Loading relationships failed");
    }
  };

  const tokenPill = useMemo(() => {
    if (!token) return "Not authenticated";
    return `Authenticated (token saved)`;
  }, [token]);

  return (
    <div className="wrap">
      <div className="header">
        <div className="title">Criminal Database Intelligence (Phase 1)</div>
        <div className="pill">{tokenPill}</div>
      </div>

      {!token ? (
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
      ) : (
        <>
          <div className="nav">
            <button className={tab === "search" ? "primary" : ""} onClick={() => setTab("search")}>
              Search
            </button>
            <button className={tab === "create" ? "primary" : ""} onClick={() => setTab("create")}>
              Create Profile
            </button>
            <button className={tab === "update" ? "primary" : ""} onClick={() => setTab("update")}>
              Update/Delete
            </button>
            <button className={tab === "link" ? "primary" : ""} onClick={() => setTab("link")}>
              Link Supporter/Follower
            </button>
            <button className={tab === "followers" ? "primary" : ""} onClick={() => setTab("followers")}>
              Followers/Supporters
            </button>
            <button className="danger" onClick={logoutNow}>
              Logout
            </button>
          </div>

          {error ? <div className="error">{error}</div> : null}

          <div className="grid" style={{ marginTop: 14 }}>
            {tab === "search" ? (
              <div className="panel">
                <h3>Intelligent Search (Elasticsearch)</h3>
                <div className="row">
                  <div>
                    <label>Name</label>
                    <input value={searchPayload.name} onChange={(e) => setSearchPayload((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <label>FIR Number</label>
                    <input
                      value={searchPayload.fir_number}
                      onChange={(e) => setSearchPayload((p) => ({ ...p, fir_number: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>Social Media</label>
                    <input
                      value={searchPayload.social_media}
                      onChange={(e) => setSearchPayload((p) => ({ ...p, social_media: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>Organization</label>
                    <input
                      value={searchPayload.organization}
                      onChange={(e) => setSearchPayload((p) => ({ ...p, organization: e.target.value }))}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label>Details</label>
                    <textarea
                      value={searchPayload.details}
                      onChange={(e) => setSearchPayload((p) => ({ ...p, details: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="actions">
                  <button className="primary" onClick={doSearch} disabled={searchLoading}>
                    {searchLoading ? "Searching..." : "Search"}
                  </button>
                </div>

                {searchResult ? (
                  <div style={{ marginTop: 14 }}>
                    <div className="card">
                      <div style={{ fontWeight: 800 }}>Matched criminal profiles</div>
                      <div className="meta">{searchResult.profiles.length} results</div>
                    </div>
                    <div className="list" style={{ marginTop: 10 }}>
                      {searchResult.profiles.map((p) => (
                        <div className="card" key={p.profile_id}>
                          <div style={{ fontWeight: 800 }}>{p.name}</div>
                          <div className="meta">
                            id={p.profile_id} | kind={p.kind} | fir={p.fir_number ?? "-"} | org={p.organization ?? "-"}
                          </div>
                        </div>
                      ))}
                      {searchResult.profiles.length === 0 ? <div className="card">No matches.</div> : null}
                    </div>

                    <div className="card" style={{ marginTop: 14 }}>
                      <div style={{ fontWeight: 800 }}>Connected profiles</div>
                      <div className="meta">{searchResult.related_profiles.length} related profiles</div>
                    </div>
                    <div className="list" style={{ marginTop: 10 }}>
                      {searchResult.related_profiles.map((p) => (
                        <div className="card" key={p.profile_id}>
                          <div style={{ fontWeight: 800 }}>{p.name}</div>
                          <div className="meta">
                            id={p.profile_id} | kind={p.kind} | fir={p.fir_number ?? "-"}
                          </div>
                        </div>
                      ))}
                      {searchResult.related_profiles.length === 0 ? <div className="card">No related profiles.</div> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "create" ? (
              <div className="panel">
                <h3>Create Profile</h3>
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
                    <label>Image URL</label>
                    <input value={createPayload.image} onChange={(e) => setCreatePayload((p) => ({ ...p, image: e.target.value }))} />
                  </div>
                  <div>
                    <label>Social Media</label>
                    <input
                      value={createPayload.social_media}
                      onChange={(e) => setCreatePayload((p) => ({ ...p, social_media: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>Organization</label>
                    <input
                      value={createPayload.organization}
                      onChange={(e) => setCreatePayload((p) => ({ ...p, organization: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>FIR Number (criminal only)</label>
                    <input
                      value={createPayload.fir_number}
                      onChange={(e) => setCreatePayload((p) => ({ ...p, fir_number: e.target.value }))}
                      disabled={createPayload.kind !== "criminal"}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label>Details</label>
                    <textarea
                      value={createPayload.details}
                      onChange={(e) => setCreatePayload((p) => ({ ...p, details: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="actions">
                  <button className="primary" onClick={doCreate}>
                    Create
                  </button>
                </div>
                {createResult ? <div className="card" style={{ marginTop: 10 }}>{createResult}</div> : null}
              </div>
            ) : null}

            {tab === "update" ? (
              <div className="panel">
                <h3>Update / Delete</h3>
                <div className="row">
                  <div>
                    <label>profile_id</label>
                    <input value={updateId} onChange={(e) => setUpdateId(e.target.value)} placeholder="Enter profile_id" />
                  </div>
                  <div>
                    <label>Update fields</label>
                    <button onClick={() => setUpdatePayload({ name: "", image: "", social_media: "", organization: "", fir_number: "", details: "" })}>
                      Clear update fields
                    </button>
                  </div>
                </div>
                <div className="row">
                  <div>
                    <label>Name</label>
                    <input value={updatePayload.name} onChange={(e) => setUpdatePayload((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <label>Image URL</label>
                    <input value={updatePayload.image} onChange={(e) => setUpdatePayload((p) => ({ ...p, image: e.target.value }))} />
                  </div>
                  <div>
                    <label>Social Media</label>
                    <input
                      value={updatePayload.social_media}
                      onChange={(e) => setUpdatePayload((p) => ({ ...p, social_media: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>Organization</label>
                    <input
                      value={updatePayload.organization}
                      onChange={(e) => setUpdatePayload((p) => ({ ...p, organization: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>FIR Number</label>
                    <input
                      value={updatePayload.fir_number}
                      onChange={(e) => setUpdatePayload((p) => ({ ...p, fir_number: e.target.value }))}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label>Details</label>
                    <textarea
                      value={updatePayload.details}
                      onChange={(e) => setUpdatePayload((p) => ({ ...p, details: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="actions">
                  <button className="primary" onClick={doUpdate}>
                    Update Profile
                  </button>
                </div>
                {updateResult ? <div className="card" style={{ marginTop: 10 }}>{updateResult}</div> : null}

                <div style={{ height: 16 }} />

                <div className="row">
                  <div>
                    <label>profile_id to delete</label>
                    <input value={deleteId} onChange={(e) => setDeleteId(e.target.value)} placeholder="Enter profile_id to delete" />
                  </div>
                </div>
                <div className="actions">
                  <button className="danger" onClick={doDelete}>
                    Delete Profile
                  </button>
                </div>
                {deleteResult ? <div className="card" style={{ marginTop: 10 }}>{deleteResult}</div> : null}
              </div>
            ) : null}

            {tab === "link" ? (
              <div className="panel">
                <h3>Link Supporter / Follower</h3>
                <div className="row">
                  <div>
                    <label>Criminal profile_id</label>
                    <input value={linkCriminalId} onChange={(e) => setLinkCriminalId(e.target.value)} placeholder="criminal_profile_id" />
                  </div>
                  <div>
                    <label>Follower/Supporter profile_id</label>
                    <input value={linkFollowerId} onChange={(e) => setLinkFollowerId(e.target.value)} placeholder="follower_id (can be user or criminal)" />
                  </div>
                  <div>
                    <label>Role</label>
                    <select value={linkRole} onChange={(e) => setLinkRole(e.target.value as any)}>
                      <option value="supporter">supporter</option>
                      <option value="follower">follower</option>
                    </select>
                  </div>
                </div>
                <div className="actions">
                  <button className="primary" onClick={doLink}>
                    Link
                  </button>
                </div>
                {linkResult ? <div className="card" style={{ marginTop: 10 }}>{linkResult}</div> : null}
              </div>
            ) : null}

            {tab === "followers" ? (
              <div className="panel">
                <h3>Followers / Supporters</h3>
                <div className="row">
                  <div>
                    <label>Criminal profile_id</label>
                    <input value={relCriminalId} onChange={(e) => setRelCriminalId(e.target.value)} placeholder="criminal_profile_id" />
                  </div>
                </div>
                <div className="actions">
                  <button className="primary" onClick={loadFollowersSupporters}>
                    Load
                  </button>
                </div>

                {followersResult ? (
                  <div style={{ marginTop: 14 }}>
                    <div className="card">
                      <div style={{ fontWeight: 800 }}>Followers</div>
                      <div className="meta">{followersResult.followers?.length ?? 0} records</div>
                    </div>
                    <div className="list" style={{ marginTop: 10 }}>
                      {followersResult.followers?.map((x: any) => (
                        <div className="card" key={x.profile_id}>
                          <div style={{ fontWeight: 800 }}>{x.name}</div>
                          <div className="meta">id={x.profile_id} | kind={x.kind}</div>
                        </div>
                      ))}
                      {(followersResult.followers?.length ?? 0) === 0 ? <div className="card">No followers.</div> : null}
                    </div>
                  </div>
                ) : null}

                {supportersResult ? (
                  <div style={{ marginTop: 14 }}>
                    <div className="card">
                      <div style={{ fontWeight: 800 }}>Supporters</div>
                      <div className="meta">{supportersResult.supporters?.length ?? 0} records</div>
                    </div>
                    <div className="list" style={{ marginTop: 10 }}>
                      {supportersResult.supporters?.map((x: any) => (
                        <div className="card" key={x.profile_id}>
                          <div style={{ fontWeight: 800 }}>{x.name}</div>
                          <div className="meta">id={x.profile_id} | kind={x.kind}</div>
                        </div>
                      ))}
                      {(supportersResult.supporters?.length ?? 0) === 0 ? <div className="card">No supporters.</div> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

