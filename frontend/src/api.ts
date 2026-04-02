type Json = any;

// In Docker we proxy API requests through the same nginx origin,
// so the correct default is a relative URL prefix (empty string).
const API_URL = (import.meta as any).env?.VITE_API_URL ?? "";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const detail = data?.detail ?? data?.message ?? res.statusText;
    throw new Error(detail);
  }
  return data as Json;
}

export async function login(username: string, password: string) {
  const res = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail ?? data?.message ?? "Login failed");
  return data as { access_token: string; token_type: string };
}

export async function register(username: string, password: string, email: string) {
  const res = await fetch(`${API_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail ?? data?.message ?? "Register failed");
  return data as { message: string };
}

export async function logout() {
  return apiFetch("/logout", { method: "POST" });
}

export async function createProfile(payload: any) {
  return apiFetch("/profile", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateProfile(profileId: string, payload: any) {
  return apiFetch(`/profile/${profileId}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function deleteProfile(profileId: string) {
  return apiFetch(`/profile/${profileId}`, { method: "DELETE" });
}

export async function getProfile(profileId: string) {
  return apiFetch(`/profile/${profileId}`, { method: "GET" });
}

export async function linkProfile(
  criminalProfileId: string,
  followerId: string,
  role: "supporter" | "follower",
  remark?: string
) {
  return apiFetch(`/profile/${criminalProfileId}/link`, {
    method: "POST",
    body: JSON.stringify({ follower_id: followerId, role, remark }),
  });
}

export async function getFollowers(criminalProfileId: string) {
  return apiFetch(`/profile/${criminalProfileId}/followers`, { method: "GET" });
}

export async function getSupporters(criminalProfileId: string) {
  return apiFetch(`/profile/${criminalProfileId}/supporters`, { method: "GET" });
}

export async function searchProfiles(payload: any) {
  return apiFetch("/search", { method: "POST", body: JSON.stringify(payload) });
}

export async function uploadProfilePhotos(profileId: string, files: FileList | File[]) {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const form = new FormData();
  const arr = Array.isArray(files) ? files : Array.from(files);
  for (const f of arr) form.append("files", f);

  const res = await fetch(`${API_URL}/profile/${profileId}/photos`, {
    method: "POST",
    headers,
    body: form,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = data?.detail ?? data?.message ?? res.statusText;
    throw new Error(detail);
  }
  return data;
}

export async function getProfilePhotos(profileId: string) {
  return apiFetch(`/profile/${profileId}/photos`, { method: "GET" });
}

export async function listProfiles(params?: { kind?: string; limit?: number; offset?: number }) {
  const sp = new URLSearchParams();
  if (params?.kind) sp.set("kind", params.kind);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const q = sp.toString();
  return apiFetch(`/profiles${q ? `?${q}` : ""}`, { method: "GET" });
}

export async function getDashboardStats() {
  return apiFetch("/dashboard/stats", { method: "GET" });
}

export async function getDashboardActivity(limit = 20) {
  return apiFetch(`/dashboard/activity?limit=${limit}`, { method: "GET" });
}

export async function getRelationships(params?: { q?: string; role?: string; limit?: number; offset?: number }) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.role) sp.set("role", params.role);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  return apiFetch(`/relationships?${sp.toString()}`, { method: "GET" });
}

export async function getAnalyticsNetwork() {
  return apiFetch("/analytics/network", { method: "GET" });
}

export async function getTopCriminals(limit = 10) {
  return apiFetch(`/analytics/top-criminals?limit=${limit}`, { method: "GET" });
}

