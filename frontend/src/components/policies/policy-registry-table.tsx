/**
 * Policy Registry Table Component (Phase 9.5).
 *
 * Provides paginated inventory, client-side page search, status filtering,
 * priority indicators, and role-governed actions.
 */

"use client";

import React from "react";
import type { PolicyResponse } from "@/types/policies";
import type { FilterPolicyStatus, FilterPolicyType } from "@/lib/policies/use-policies";
import { formatPriority } from "@/lib/policies/policies-formatters";
import {
  PolicyActionBadge,
  PolicyStatusBadge,
  PolicyTypeBadge,
} from "./policy-status-badge";
import { RoleGuard } from "@/components/auth/role-guard";
import { canManagePolicies } from "@/lib/permissions";

interface PolicyRegistryTableProps {
  items: PolicyResponse[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  typeFilter: FilterPolicyType;
  statusFilter: FilterPolicyStatus;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  onTypeFilterChange: (type: FilterPolicyType) => void;
  onStatusFilterChange: (status: FilterPolicyStatus) => void;
  onSearchChange: (query: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSelectPolicy: (policyId: string) => void;
  onEditPolicy: (policy: PolicyResponse) => void;
  onNewPolicy: () => void;
  onRetry: () => void;
}

export function PolicyRegistryTable({
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
  onTypeFilterChange,
  onStatusFilterChange,
  onSearchChange,
  onPageChange,
  onPageSizeChange,
  onSelectPolicy,
  onEditPolicy,
  onNewPolicy,
  onRetry,
}: PolicyRegistryTableProps) {
  return (
    <div className="space-y-4">
      {/* Search, Type Filter, & Status Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-gray-900/60 border border-gray-800">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Keyword Search */}
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search page by name or slug..."
              className="w-full bg-gray-950 border border-gray-800 text-gray-200 text-xs rounded-lg pl-8 pr-3 py-2 focus:border-indigo-500 focus:outline-none"
            />
            <span className="absolute left-2.5 top-2 text-gray-500 text-xs">🔍</span>
          </div>
          <span className="text-[11px] text-gray-500 italic hidden sm:inline">
            (Filtering currently loaded page)
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Policy Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value as FilterPolicyType)}
            className="bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded-lg px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Types</option>
            <option value="SECURITY">Security</option>
            <option value="OPERATIONAL">Operational</option>
            <option value="COMPLIANCE">Compliance</option>
            <option value="FINANCIAL">Financial</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as FilterPolicyStatus)}
            className="bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded-lg px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </select>

          {/* New Policy Button */}
          <RoleGuard check={canManagePolicies}>
            <button
              type="button"
              onClick={onNewPolicy}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-sm shadow-indigo-600/30"
            >
              + New Policy
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-semibold underline hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900/60 shadow-xs">
        <table className="w-full text-left text-xs text-gray-300">
          <thead className="bg-gray-950/80 text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-800">
            <tr>
              <th className="py-3 px-4 font-semibold">Policy Name & Slug</th>
              <th className="py-3 px-4 font-semibold">Type</th>
              <th className="py-3 px-4 font-semibold">Priority</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Default Action</th>
              <th className="py-3 px-4 font-semibold">Version</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/80">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={7} className="py-4 px-4">
                    <div className="h-4 bg-gray-800/60 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-800/40 rounded w-1/3" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-500">
                  No governance policies match your current filter criteria.
                </td>
              </tr>
            ) : (
              items.map((policy) => {
                const priorityInfo = formatPriority(policy.priority);
                return (
                  <tr
                    key={policy.id}
                    onClick={() => onSelectPolicy(policy.id)}
                    className="hover:bg-gray-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white group-hover:text-indigo-400 transition-colors">
                        {policy.name}
                      </div>
                      <div className="font-mono text-[11px] text-gray-500">{policy.slug}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <PolicyTypeBadge type={policy.policy_type} />
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={priorityInfo.tone}>{priorityInfo.label}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <PolicyStatusBadge status={policy.status} />
                    </td>
                    <td className="py-3.5 px-4">
                      <PolicyActionBadge action={policy.default_action} />
                    </td>
                    <td className="py-3.5 px-4 font-mono text-gray-300">
                      {policy.current_version ? (
                        <span className="text-emerald-400 font-medium">
                          v{policy.current_version.version_number}
                        </span>
                      ) : (
                        <span className="text-gray-500">Draft v1</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onSelectPolicy(policy.id)}
                          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium"
                        >
                          View
                        </button>
                        <RoleGuard check={canManagePolicies}>
                          <button
                            type="button"
                            onClick={() => onEditPolicy(policy)}
                            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs"
                          >
                            Edit
                          </button>
                        </RoleGuard>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-gray-400">
        <div>
          Showing {items.length} of {total} policies (Page {page} of {totalPages})
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
              className="bg-gray-900 border border-gray-800 text-gray-300 rounded px-2 py-1 text-xs focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-2.5 py-1 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-2.5 py-1 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

