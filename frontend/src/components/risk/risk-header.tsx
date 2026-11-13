/**
 * Risk Workbench Header & Sub-Navigation (Phase 9.5).
 */

"use client";

import React from "react";
import { RiskIcon } from "@/components/ui/icons";

interface RiskHeaderProps {
  activeTab: "assessments" | "profiles" | "config" | "simulation";
  onTabChange: (tab: "assessments" | "profiles" | "config" | "simulation") => void;
  assessmentsTotal: number;
  activeVersionNumber?: number | null;
}

export function RiskHeader({
  activeTab,
  onTabChange,
  assessmentsTotal,
  activeVersionNumber,
}: RiskHeaderProps) {
  return (
    <div className="space-y-4 pb-6 border-b border-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <RiskIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Quantitative Risk Engine & Scoring</span>
              {activeVersionNumber && (
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">
                  Config v{activeVersionNumber}
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Multi-vector risk scoring, empirical agent trust tracking, threshold gating, and simulation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-gray-400 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">
            {assessmentsTotal} Total Audited Invocations
          </span>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 pt-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => onTabChange("assessments")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === "assessments"
              ? "bg-gray-800 text-white shadow-xs"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-900"
          }`}
        >
          Risk Explorer (Assessments)
        </button>

        <button
          type="button"
          onClick={() => onTabChange("profiles")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === "profiles"
              ? "bg-gray-800 text-white shadow-xs"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-900"
          }`}
        >
          Agent Trust Profiles
        </button>

        <button
          type="button"
          onClick={() => onTabChange("config")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === "config"
              ? "bg-gray-800 text-white shadow-xs"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-900"
          }`}
        >
          Scoring Configuration
        </button>

        <button
          type="button"
          onClick={() => onTabChange("simulation")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === "simulation"
              ? "bg-gray-800 text-white shadow-xs"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-900"
          }`}
        >
          Risk Simulation Playground
        </button>
      </div>
    </div>
  );
}

