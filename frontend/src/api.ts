type Json = any;

const API_URL = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:8000";

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

export async function linkProfile(criminalProfileId: string, followerId: string, role: "supporter" | "follower") {
  return apiFetch(`/profile/${criminalProfileId}/link`, {
    method: "POST",
    body: JSON.stringify({ follower_id: followerId, role }),
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

