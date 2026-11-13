/**
 * Quantitative Risk Engine & Scoring Workbench (Phase 9.5).
 *
 * Route: /risk
 * Page Access: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR, VIEWER
 * Config Mutation Access: ADMIN, SECURITY_ANALYST (canManageRiskConfig)
 * Risk Simulation Access: All 5 roles
 */

"use client";

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useRisk } from "@/lib/risk/use-risk";
import { RiskHeader } from "@/components/risk/risk-header";
import { RiskAssessmentTable } from "@/components/risk/risk-assessment-table";
import { RiskAssessmentDrawer } from "@/components/risk/risk-assessment-drawer";
import { AgentRiskProfileGrid } from "@/components/risk/agent-risk-profile-grid";
import { RiskConfigPublisher } from "@/components/risk/risk-config-publisher";
import { RiskSimulationPanel } from "@/components/risk/risk-simulation-panel";

export default function RiskPage() {
  const {
    activeTab,
    setActiveTab,

    // 1. Assessments
    assessments,
    assessmentsTotal,
    totalAssessmentPages,
    assessmentPage,
    assessmentPageSize,
    riskLevelFilter,
    agentFilter,
    toolFilter,
    startDateFilter,
    endDateFilter,
    assessmentsLoading,
    assessmentsError,
    selectedAssessment,
    assessmentDetailLoading,
    setAssessmentPage,
    setAssessmentPageSize,
    setRiskLevelFilter,
    setAgentFilter,
    setToolFilter,
    setStartDateFilter,
    setEndDateFilter,
    selectAssessment,
    refreshAssessments,

    // 2. Agent Profiles
    agentsList,
    agentsTotal,
    totalAgentPages,
    agentPage,
    agentsLoading,
    agentProfiles,
    profileLoadingStates,
    profileErrors,
    expandedAgentId,
    expandedAgentAssessments,
    expandedAgentLoading,
    setAgentPage,
    expandAgent,
    retryProfile,
    refreshAgents,

    // 3. Risk Configuration
    activeConfig,
    proposedConfig,
    setProposedConfig,
    configLoading,
    configSubmitting,
    configError,
    configSuccess,
    publishConfig,
    loadConfigFromSnapshot,

    // 4. Simulation
    cachedAgents,
    cachedTools,
    loadToolVersions,
    simulationLoading,
    simulationResult,
    simulationError,
    simulateRisk,
    clearSimulationState,
  } = useRisk();

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header & Sub-Navigation */}
        <RiskHeader
          activeTab={activeTab}
          onTabChange={setActiveTab}
          assessmentsTotal={assessmentsTotal}
          activeVersionNumber={activeConfig?.current_version?.version_number}
        />

        {/* View 1: Risk Assessments Explorer */}
        {activeTab === "assessments" && (
          <div>
            <RiskAssessmentTable
              assessments={assessments}
              total={assessmentsTotal}
              totalPages={totalAssessmentPages}
              page={assessmentPage}
              pageSize={assessmentPageSize}
              riskLevelFilter={riskLevelFilter}
              agentFilter={agentFilter}
              toolFilter={toolFilter}
              startDateFilter={startDateFilter}
              endDateFilter={endDateFilter}
              loading={assessmentsLoading}
              error={assessmentsError}
              onRiskLevelChange={setRiskLevelFilter}
              onAgentFilterChange={setAgentFilter}
              onToolFilterChange={setToolFilter}
              onStartDateChange={setStartDateFilter}
              onEndDateChange={setEndDateFilter}
              onPageChange={setAssessmentPage}
              onPageSizeChange={setAssessmentPageSize}
              onSelectAssessment={selectAssessment}
              onResetFilters={() => {
                setRiskLevelFilter("ALL");
                setAgentFilter("");
                setToolFilter("");
                setStartDateFilter("");
                setEndDateFilter("");
              }}
              onRetry={refreshAssessments}
            />

            {/* Assessment Detail Drawer */}
            <RiskAssessmentDrawer
              assessment={selectedAssessment}
              loading={assessmentDetailLoading}
              onClose={() => selectAssessment(null)}
              onLoadAsTemplate={(snapshot) => {
                loadConfigFromSnapshot(snapshot);
                selectAssessment(null);
              }}
            />
          </div>
        )}

        {/* View 2: Agent Risk Profiles */}
        {activeTab === "profiles" && (
          <AgentRiskProfileGrid
            agents={agentsList}
            total={agentsTotal}
            totalPages={totalAgentPages}
            page={agentPage}
            loading={agentsLoading}
            profiles={agentProfiles}
            loadingStates={profileLoadingStates}
            profileErrors={profileErrors}
            expandedAgentId={expandedAgentId}
            expandedAgentAssessments={expandedAgentAssessments}
            expandedAgentLoading={expandedAgentLoading}
            onPageChange={setAgentPage}
            onExpandAgent={expandAgent}
            onRetryProfile={retryProfile}
            onRefresh={refreshAgents}
          />
        )}

        {/* View 3: Scoring Configuration */}
        {activeTab === "config" && (
          <RiskConfigPublisher
            activeConfig={activeConfig}
            proposedConfig={proposedConfig}
            onChangeProposed={setProposedConfig}
            onPublish={publishConfig}
            loading={configLoading}
            submitting={configSubmitting}
            error={configError}
            success={configSuccess}
          />
        )}

        {/* View 4: Risk Simulation */}
        {activeTab === "simulation" && (
          <RiskSimulationPanel
            agents={cachedAgents}
            tools={cachedTools}
            loadToolVersions={loadToolVersions}
            onEvaluate={simulateRisk}
            loading={simulationLoading}
            result={simulationResult}
            error={simulationError}
            onClear={clearSimulationState}
          />
        )}
      </div>
    </AppShell>
  );
}
