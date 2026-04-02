import React, { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import NetworkGraph from "../components/NetworkGraph";
import { getAnalyticsNetwork, getDashboardStats, getTopCriminals } from "../api";

const COLORS = ["#34d399", "#60a5fa", "#fbbf24", "#f87171", "#a78bfa", "#2dd4bf"];

export default function AnalyticsPage() {
  const [stats, setStats] = useState<any>(null);
  const [top, setTop] = useState<any[]>([]);
  const [net, setNet] = useState<{ nodes: any[]; links: any[] } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const [s, t, n] = await Promise.all([getDashboardStats(), getTopCriminals(12), getAnalyticsNetwork()]);
        if (!c) {
          setStats(s);
          setTop(t.top ?? []);
          setNet({ nodes: n.nodes ?? [], links: n.links ?? [] });
        }
      } catch (e: any) {
        if (!c) setErr(e.message || "Failed to load analytics");
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const pieData = stats
    ? [
        { name: "Supporters", value: stats.supporter_links },
        { name: "Followers", value: stats.follower_links },
      ]
    : [];

  return (
    <div className="page analytics-page">
      <div className="page-header">
        <h2>Analytics &amp; network</h2>
        <p className="page-lead">Relationship distribution, top-linked criminals, and an interactive network graph.</p>
      </div>
      {err ? <div className="alert alert-error">{err}</div> : null}

      <section className="grid-2 analytics-grid">
        <div className="panel chart-panel">
          <div className="panel-header">
            <h3>Relationship mix</h3>
            <span className="pill subtle">All links</span>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel chart-panel">
          <div className="panel-header">
            <h3>Top criminals by link count</h3>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={top} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 10 }} angle={-25} textAnchor="end" height={60} interval={0} />
                <YAxis tick={{ fill: "var(--muted)" }} />
                <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)" }} />
                <Legend />
                <Bar dataKey="supporters" stackId="a" fill="#34d399" name="Supporters" />
                <Bar dataKey="followers" stackId="a" fill="#60a5fa" name="Followers" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Network graph</h3>
          <span className="pill subtle">Pan · zoom · drag nodes</span>
        </div>
        {net ? <NetworkGraph nodes={net.nodes} links={net.links} height={520} /> : null}
      </section>
    </div>
  );
}
