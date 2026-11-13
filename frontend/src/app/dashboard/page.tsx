"use client";

/**
 * Security Operations Center (SecOps) Analytics Dashboard (Phase 9.3).
 *
 * Route: /dashboard
 * Access: ADMIN, SECURITY_ANALYST, AUDITOR
 *
 * Consolidates live telemetry across the six audited v0.8.0 analytics endpoints:
 * 1. Overview KPIs: Volumetric counts, decision ratios, and approval resolutions (/overview)
 * 2. Activity Trends: Multi-series time-series curves with hourly/daily granularity (/trends)
 * 3. Risk Distribution: Tier counters, average/min/max scores, and 10-decile histogram (/risk-distribution)
 * 4. Agent Analytics: Paginated fleet throughput, historical denial rate, trust, duration (/agents)
 * 5. Tool Utilization: Paginated tool invocations, success/failure/timeout executions, latency (/tools)
 * 6. Anomaly Monitoring: Read-only sliding-window detector findings (/anomalies)
 */

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useAnalyticsDashboard } from "@/lib/analytics/use-analytics";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { OverviewKpiGrid } from "@/components/dashboard/overview-kpi-grid";
import { GovernanceTrendsChart } from "@/components/dashboard/governance-trends-chart";
import { RiskDistributionCard } from "@/components/dashboard/risk-distribution-card";
import { AgentAnalyticsTable } from "@/components/dashboard/agent-analytics-table";
import { ToolAnalyticsTable } from "@/components/dashboard/tool-analytics-table";
import { AnomalyPanel } from "@/components/dashboard/anomaly-panel";

export default function DashboardPage() {
  const {
    range,
    setPreset,
    setCustomInterval,
    setGranularity,
    agentPage,
    setAgentPage,
    toolPage,
    setToolPage,
    autoRefreshInterval,
    setAutoRefreshInterval,
    lastUpdated,
    isRefreshing,
    refreshAll,
    overview,
    trends,
    risk,
    agents,
    tools,
    anomalies,
  } = useAnalyticsDashboard();

  return (
    <AppShell>
      <div className="space-y-6">
        {/* 1. Dashboard Header & Refresh Controls */}
        <DashboardHeader
          lastUpdated={lastUpdated}
          isRefreshing={isRefreshing}
          onRefresh={refreshAll}
          autoRefreshInterval={autoRefreshInterval}
          onSetAutoRefresh={setAutoRefreshInterval}
        />

        {/* 2. Global Horizon & Granularity Filter Bar */}
        <DashboardFilters
          range={range}
          onSetPreset={setPreset}
          onSetCustomRange={setCustomInterval}
          onSetGranularity={setGranularity}
        />

        {/* 3. High-Level Governance Overview KPI Grid (13 Response Fields) */}
        <OverviewKpiGrid overview={overview} onRetry={refreshAll} />

        {/* 4. Trends Time-Series Chart + Risk Distribution Histogram */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GovernanceTrendsChart trends={trends} onRetry={refreshAll} />
          <RiskDistributionCard risk={risk} onRetry={refreshAll} />
        </div>

        {/* 5. Sliding-Window Anomaly Monitoring Findings Panel */}
        <AnomalyPanel anomalies={anomalies} onRetry={refreshAll} />

        {/* 6. Operational Agent Fleet & Governed Tools Analytics Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AgentAnalyticsTable
            agents={agents}
            currentPage={agentPage}
            onPageChange={setAgentPage}
            onRetry={refreshAll}
          />
          <ToolAnalyticsTable
            tools={tools}
            currentPage={toolPage}
            onPageChange={setToolPage}
            onRetry={refreshAll}
          />
        </div>
      </div>
    </AppShell>
  );
}
