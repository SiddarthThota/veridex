/**
 * Governance Policy Management & Simulation Workbench (Phase 9.5).
 *
 * Route: /policies
 * Page Access: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR, VIEWER
 * Mutation Access: ADMIN, SECURITY_ANALYST (canManagePolicies)
 * Simulation Access: ADMIN, SECURITY_ANALYST, AUDITOR, AGENT_OPERATOR (canSimulatePolicies)
 * Note: VIEWER is strictly forbidden from simulation (HTTP 403 prevention).
 */

"use client";

import React, { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { usePolicies } from "@/lib/policies/use-policies";
import { PoliciesHeader } from "@/components/policies/policies-header";
import { PolicyRegistryTable } from "@/components/policies/policy-registry-table";
import { PolicyDetailView } from "@/components/policies/policy-detail-view";
import { PolicySimulationPanel } from "@/components/policies/policy-simulation-panel";
import { PolicyModal } from "@/components/policies/policy-modal";
import type {
  PolicyCreate,
  PolicyResponse,
  PolicyRuleCreate,
  PolicyRuleUpdate,
  PolicyUpdate,
} from "@/types/policies";

export default function PoliciesPage() {
  const {
    items,
    total,
    totalPages,
    page,
    pageSize,
    typeFilter,
    statusFilter,
    searchQuery,
    loading,
    error,
    setTypeFilter,
    setStatusFilter,
    setSearchQuery,
    setPage,
    setPageSize,
    refresh,

    selectedPolicy,
    selectedLoading,
    versions,
    selectedVersion,
    selectPolicy,
    selectVersion,

    submitting,
    mutationError,
    mutationSuccess,
    clearMutationState,
    createPolicy,
    updatePolicy,
    updatePolicyStatus,
    archivePolicy,
    branchDraftVersion,
    publishVersion,
    createRule,
    updateRule,
    deleteRule,

    simulating,
    simulationResult,
    simulationError,
    simulatePolicy,
    clearSimulationState,
  } = usePolicies();

  const [activeTab, setActiveTab] = useState<"registry" | "detail" | "simulation">("registry");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<PolicyResponse | null>(null);

  const handleSelectPolicy = async (policyId: string) => {
    await selectPolicy(policyId);
    setActiveTab("detail");
  };

  const handleOpenNewPolicy = () => {
    setEditingPolicy(null);
    setModalOpen(true);
  };

  const handleOpenEditPolicy = (policy: PolicyResponse) => {
    setEditingPolicy(policy);
    setModalOpen(true);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header & Sub-Navigation */}
        <PoliciesHeader
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasSelectedPolicy={Boolean(selectedPolicy)}
          onNewPolicy={handleOpenNewPolicy}
          totalCount={total}
        />

        {/* Global Mutation Notification Banner */}
        {mutationSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
            <span>{mutationSuccess}</span>
            <button
              type="button"
              onClick={clearMutationState}
              className="text-xs font-semibold underline hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {mutationError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
            <span>{mutationError}</span>
            <button
              type="button"
              onClick={clearMutationState}
              className="text-xs font-semibold underline hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* View 1: Policy Registry */}
        {activeTab === "registry" && (
          <PolicyRegistryTable
            items={items}
            total={total}
            totalPages={totalPages}
            page={page}
            pageSize={pageSize}
            typeFilter={typeFilter}
            statusFilter={statusFilter}
            searchQuery={searchQuery}
            loading={loading}
            error={error}
            onTypeFilterChange={setTypeFilter}
            onStatusFilterChange={setStatusFilter}
            onSearchChange={setSearchQuery}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onSelectPolicy={handleSelectPolicy}
            onEditPolicy={handleOpenEditPolicy}
            onNewPolicy={handleOpenNewPolicy}
            onRetry={refresh}
          />
        )}

        {/* View 2: Policy Detail & Versioning */}
        {activeTab === "detail" && selectedPolicy && (
          <div>
            {selectedLoading ? (
              <div className="p-12 text-center text-xs text-gray-500">
                Loading policy details and version snapshots...
              </div>
            ) : (
              <PolicyDetailView
                policy={selectedPolicy}
                versions={versions}
                selectedVersion={selectedVersion}
                submitting={submitting}
                onSelectVersion={selectVersion}
                onBranchDraft={async (changelog) => branchDraftVersion(selectedPolicy.id, changelog)}
                onPublishVersion={async (versionId) => publishVersion(selectedPolicy.id, versionId)}
                onUpdateStatus={async (newStatus) => updatePolicyStatus(selectedPolicy.id, newStatus)}
                onArchive={async () => {
                  const ok = await archivePolicy(selectedPolicy.id);
                  if (ok) setActiveTab("registry");
                  return ok;
                }}
                onSaveRule={async (versionId, ruleData, ruleId) => {
                  if (ruleId) {
                    return updateRule(selectedPolicy.id, versionId, ruleId, ruleData as PolicyRuleUpdate);
                  }
                  return createRule(selectedPolicy.id, versionId, ruleData as PolicyRuleCreate);
                }}
                onDeleteRule={async (versionId, ruleId) => deleteRule(selectedPolicy.id, versionId, ruleId)}
                onBack={() => setActiveTab("registry")}
              />
            )}
          </div>
        )}

        {/* View 3: Dry-Run Simulation Studio */}
        {activeTab === "simulation" && (
          <PolicySimulationPanel
            onSimulate={simulatePolicy}
            simulating={simulating}
            result={simulationResult}
            error={simulationError}
            onClear={clearSimulationState}
          />
        )}

        {/* Policy Authoring/Edit Container Modal */}
        {modalOpen && (
          <PolicyModal
            initialPolicy={editingPolicy}
            submitting={submitting}
            onClose={() => {
              setModalOpen(false);
              setEditingPolicy(null);
            }}
            onSave={async (data) => {
              if (editingPolicy) {
                return updatePolicy(editingPolicy.id, data as PolicyUpdate);
              }
              return createPolicy(data as PolicyCreate);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
