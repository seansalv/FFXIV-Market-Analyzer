'use client';

import { Info, X } from 'lucide-react';
import { useState } from 'react';

export function InfoPanel() {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-3 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 rounded-full shadow-lg transition-all z-50"
        title="View metric explanations"
      >
        <Info className="w-6 h-6 text-white" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-amber-500" />
            <h2 className="text-white">Metric Explanations</h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400 hover:text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <MetricExplanation
            title="Units Sold"
            description="The total number of individual items sold during the selected timeframe. Higher values indicate consistent demand."
            example="1,547 units sold in 7 days"
          />

          <MetricExplanation
            title="Sales Velocity"
            description="Average units sold per day. This metric helps identify fast-moving items. Formula: Units Sold ÷ Days in Timeframe"
            example="221.0 units/day = 1,547 units ÷ 7 days"
          />

          <MetricExplanation
            title="Total Revenue"
            description="The total gil generated from all sales in the timeframe. Calculated by multiplying each sale price by quantity and summing."
            example="92.82M gil from 1,547 sales at ~60K avg price"
          />

          <MetricExplanation
            title="Average Price"
            description="Mean sale price across all transactions. Helps understand typical market value. The range shows min-max prices observed."
            example="60,000 gil average (58K - 65K range)"
          />

          <MetricExplanation
            title="Profit per Unit"
            description="Estimated profit for craftable items. Calculated as: Average Sale Price - Material Cost. Requires recipe data. Non-craftables show N/A."
            example="+12,500 gil (60K sale - 47.5K materials)"
          />

          <MetricExplanation
            title="Margin %"
            description="Profit margin as percentage of sale price. Formula: (Profit ÷ Sale Price) × 100. Higher margins mean better profitability relative to investment."
            example="20.8% = (12,500 ÷ 60,000) × 100"
          />

          <MetricExplanation
            title="Active Listings"
            description="Current number of items listed on the marketboard. Lower listings may indicate less competition or supply constraints."
            example="45 listings currently available"
          />

          <div className="pt-4 border-t border-slate-800">
            <h3 className="text-white mb-3">Ranking Strategies</h3>
            <div className="space-y-3">
              <RankingStrategy
                name="Total Revenue"
                description="Best for finding the highest-grossing items. Ideal for identifying what's moving the most gil overall."
              />
              <RankingStrategy
                name="Units Sold"
                description="Best for high-volume crafters. Shows items with consistent demand regardless of individual profit."
              />
              <RankingStrategy
                name="Average Price"
                description="Best for premium items. Identifies expensive items that might have lower volume but high per-sale value."
              />
              <RankingStrategy
                name="Profit per Unit"
                description="Best for maximizing per-craft returns. Shows which craftables give the most profit per item made."
              />
              <RankingStrategy
                name="ROI / Margin %"
                description="Best for capital efficiency. Shows which items give the best percentage return on materials invested."
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800">
            <h3 className="text-white mb-2">About the Data</h3>
            <p className="text-slate-400 text-sm">
              All market data is sourced from the Universalis API, which crowdsources real marketboard information from FFXIV players.
              Data accuracy depends on how recently the market was scanned. For best results, consider timeframes that match your crafting/trading strategy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricExplanationProps {
  title: string;
  description: string;
  example: string;
}

function MetricExplanation({ title, description, example }: MetricExplanationProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-white">{title}</h3>
      <p className="text-slate-300 text-sm">{description}</p>
      <div className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg">
        <p className="text-amber-400 text-sm">Example: {example}</p>
      </div>
    </div>
  );
}

interface RankingStrategyProps {
  name: string;
  description: string;
}

function RankingStrategy({ name, description }: RankingStrategyProps) {
  return (
    <div className="px-3 py-2 bg-slate-800/30 rounded-lg">
      <p className="text-amber-500 text-sm mb-1">{name}</p>
      <p className="text-slate-400 text-sm">{description}</p>
    </div>
  );
}

