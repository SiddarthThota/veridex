/**
 * Native Responsive SVG 4-Vector Risk Decomposition Component (Phase 9.5).
 *
 * Visualizes the 4 normalized risk vectors (Tool, Data, Agent, Context)
 * using native SVG meters and a multi-dimensional polygon without external charting packages.
 */

"use client";

import React from "react";
import type { SubscoresBreakdown } from "@/types/risk";
import { getVectorDescription } from "@/lib/risk/risk-formatters";

interface RiskVectorBreakdownProps {
  subscores: SubscoresBreakdown;
  compact?: boolean;
}

export function RiskVectorBreakdown({ subscores, compact = false }: RiskVectorBreakdownProps) {
  const vectors = [
    { key: "tool" as const, label: "Tool", val: Math.round(subscores.tool || 0), color: "#38bdf8" }, // Sky
    { key: "data" as const, label: "Data", val: Math.round(subscores.data || 0), color: "#a855f7" }, // Purple
    { key: "agent" as const, label: "Agent", val: Math.round(subscores.agent || 0), color: "#f59e0b" }, // Amber
    { key: "context" as const, label: "Context", val: Math.round(subscores.context || 0), color: "#f43f5e" }, // Rose
  ];

  // SVG Radar coordinates for 4 vectors (Diamond layout: Top, Right, Bottom, Left)
  // Center is (100, 100), Radius max is 70
  const cx = 100;
  const cy = 100;
  const rMax = 70;

  const getCoordinates = (value: number, angleIndex: number) => {
    const fraction = Math.min(100, Math.max(0, value)) / 100;
    const r = fraction * rMax;
    // 0: Top (0 rad / -pi/2), 1: Right (pi/2), 2: Bottom (pi), 3: Left (3pi/2)
    const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
    const angle = angles[angleIndex];
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const points = vectors
    .map((v, i) => {
      const { x, y } = getCoordinates(v.val, i);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {vectors.map((v) => (
          <div key={v.key} className="space-y-1">
            <div className="flex justify-between text-gray-400">
              <span>{v.label}:</span>
              <span className="font-mono font-semibold text-white">{v.val}</span>
            </div>
            <div className="w-full bg-gray-950 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${v.val}%`, backgroundColor: v.color }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center p-4 rounded-xl bg-gray-950/60 border border-gray-800/80">
      {/* Left: Native SVG Radar Graphic */}
      <div className="md:col-span-5 flex flex-col items-center justify-center">
        <svg viewBox="0 0 200 200" className="w-48 h-48 drop-shadow-sm">
          {/* Background concentric reference grids */}
          <polygon
            points="100,30 170,100 100,170 30,100"
            fill="none"
            stroke="#1f2937"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <polygon
            points="100,65 135,100 100,135 65,100"
            fill="none"
            stroke="#1f2937"
            strokeWidth="1"
            strokeDasharray="2 2"
          />

          {/* Axes */}
          <line x1="100" y1="30" x2="100" y2="170" stroke="#374151" strokeWidth="1" />
          <line x1="30" y1="100" x2="170" y2="100" stroke="#374151" strokeWidth="1" />

          {/* Data Polygon */}
          <polygon
            points={points}
            fill="rgba(99, 102, 241, 0.25)"
            stroke="#6366f1"
            strokeWidth="2"
            className="transition-all duration-700 ease-out"
          />

          {/* Vertex Dots */}
          {vectors.map((v, i) => {
            const { x, y } = getCoordinates(v.val, i);
            return (
              <circle
                key={v.key}
                cx={x}
                cy={y}
                r="4"
                fill={v.color}
                stroke="#030712"
                strokeWidth="1.5"
              />
            );
          })}

          {/* Axis Labels */}
          <text x="100" y="22" textAnchor="middle" fill="#9ca3af" fontSize="9" fontWeight="600">
            TOOL
          </text>
          <text x="178" y="103" textAnchor="start" fill="#9ca3af" fontSize="9" fontWeight="600">
            DATA
          </text>
          <text x="100" y="186" textAnchor="middle" fill="#9ca3af" fontSize="9" fontWeight="600">
            AGENT
          </text>
          <text x="22" y="103" textAnchor="end" fill="#9ca3af" fontSize="9" fontWeight="600">
            CONTEXT
          </text>
        </svg>
        <span className="text-[10px] text-gray-500 mt-1 font-mono">
          4-Vector Composite Perimeter
        </span>
      </div>

      {/* Right: Detailed Vector Bars & Descriptions */}
      <div className="md:col-span-7 space-y-3.5">
        {vectors.map((v) => {
          const desc = getVectorDescription(v.key);
          return (
            <div key={v.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-200">{desc.title}</span>
                <span className="font-mono font-bold" style={{ color: v.color }}>
                  {v.val} / 100
                </span>
              </div>
              <div className="w-full bg-gray-900 rounded-full h-2 overflow-hidden border border-gray-800">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${v.val}%`, backgroundColor: v.color }}
                />
              </div>
              <p className="text-[11px] text-gray-400 leading-tight">{desc.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

