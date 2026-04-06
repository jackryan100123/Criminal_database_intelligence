import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, register } from "../api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const submit = async () => {
    setError("");
    setInfo("");
    try {
      if (mode === "register") {
        await register(username.trim(), password, email.trim());
        setInfo("Account created. Sign in below.");
        setMode("login");
        return;
      }
      const data = await login(username.trim(), password);
      localStorage.setItem("token", data.access_token);
      navigate("/", { replace: true });
    } catch (e: any) {
      setError(e.message || "Authentication failed");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark lg" />
          <div>
            <h1 className="auth-title">Criminal Database Intelligence</h1>
            <p className="auth-sub">Secure analyst workspace · Phase 1</p>
          </div>
        </div>
        <div className="auth-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Sign in
          </button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            Register
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "register" ? (
            <label className="field">
              <span>Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
          ) : null}
          <label className="field">
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          {error ? <div className="alert alert-error">{error}</div> : null}
          {info ? <div className="alert alert-info">{info}</div> : null}
          <button type="submit" className="btn btn-primary btn-block">
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
