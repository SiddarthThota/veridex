"use client";

import { useEffect, useState } from "react";

interface HealthStatus {
  status: string;
  service: string;
  version: string;
  environment: string;
  timestamp: string;
}

const NAV_ITEMS = [
  { name: "Dashboard", href: "/", icon: "📊", active: true },
  { name: "Agents", href: "/agents", icon: "🤖" },
  { name: "Tools", href: "/tools", icon: "🔧" },
  { name: "Policies", href: "/policies", icon: "📋" },
  { name: "Agent Runs", href: "/runs", icon: "▶️" },
  { name: "Traces", href: "/traces", icon: "🔍" },
  { name: "Approvals", href: "/approvals", icon: "✅" },
  { name: "Security", href: "/security", icon: "🛡️" },
  { name: "Incidents", href: "/incidents", icon: "🚨" },
  { name: "Audit Log", href: "/audit", icon: "📝" },
  { name: "Risk Analytics", href: "/risk", icon: "⚡" },
  { name: "Evaluations", href: "/evaluations", icon: "📈" },
  { name: "Settings", href: "/settings", icon: "⚙️" },
];

export default function Home() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    fetch(`${apiUrl}/api/v1/health`)
      .then((res) => res.json())
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900/50 border-r border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              VERIDEX
            </span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            AI Agent Governance Platform
          </p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                item.active
                  ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.name}</span>
            </a>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                health ? "bg-emerald-400 animate-pulse" : error ? "bg-red-400" : "bg-gray-600"
              }`}
            />
            <span className="text-xs text-gray-500">
              {health ? "Backend Connected" : error ? "Backend Offline" : "Checking..."}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 border-b border-gray-800 flex items-center justify-between px-6">
          <h2 className="text-sm font-medium text-gray-300">Dashboard</h2>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">v0.1.0</span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold">
              V
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Status Banner */}
          <div className="mb-8 p-6 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-cyan-500/10 border border-indigo-500/20">
            <h3 className="text-lg font-semibold mb-2">
              Welcome to Veridex
            </h3>
            <p className="text-sm text-gray-400 max-w-2xl">
              Govern AI Agents Before They Act. This platform provides enterprise-grade
              governance, security, audit, and observability for AI agent operations.
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Active Agents", value: "—", icon: "🤖", color: "indigo" },
              { label: "Agent Runs", value: "—", icon: "▶️", color: "purple" },
              { label: "Blocked Actions", value: "—", icon: "🚫", color: "red" },
              { label: "Pending Approvals", value: "—", icon: "⏳", color: "amber" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="p-5 rounded-xl bg-gray-900/50 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl">{stat.icon}</span>
                  <span className="text-xs text-gray-500 uppercase tracking-wider">
                    {stat.label}
                  </span>
                </div>
                <p className="text-3xl font-bold text-gray-300">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Backend Status Card */}
          <div className="p-5 rounded-xl bg-gray-900/50 border border-gray-800">
            <h4 className="text-sm font-medium text-gray-300 mb-4">
              System Status
            </h4>
            {loading ? (
              <div className="flex items-center gap-3 text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-600 border-t-indigo-400 rounded-full animate-spin" />
                <span className="text-sm">Connecting to backend...</span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-3 text-red-400">
                <span className="text-sm">
                  ⚠️ Backend unavailable: {error}
                </span>
                <span className="text-xs text-gray-500">
                  Start the backend server on port 8000
                </span>
              </div>
            ) : health ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Service", value: health.service },
                  { label: "Version", value: health.version },
                  { label: "Environment", value: health.environment },
                  { label: "Status", value: health.status },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-gray-300">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
