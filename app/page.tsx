'use client';

import { useState } from 'react';
import { FilterPanel } from '@/components/FilterPanel';
import { MetricCards } from '@/components/MetricCards';
import { ItemsTable } from '@/components/ItemsTable';
import { InfoPanel } from '@/components/InfoPanel';
import { TrendingUp } from 'lucide-react';
import type { FilterState } from '@/components/FilterPanel';
import { useTopItems } from '@/lib/hooks/use-top-items';

export default function Home() {
  const [filters, setFilters] = useState<FilterState>({
    worldOrDc: 'all-na',
    timeframe: '7d',
    categories: [],
    itemType: 'all',
    topN: 25,
  });

  const { isLoading, refetch } = useTopItems(filters);

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleAnalyze = () => {
    refetch();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white text-xl font-semibold">FFXIV Market Analyzer</h1>
              <p className="text-slate-400 text-sm">Find the most profitable items to sell</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-[1920px] mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Left: Filter Panel */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <FilterPanel
              filters={filters}
              onFilterChange={handleFilterChange}
              onAnalyze={handleAnalyze}
              isLoading={isLoading}
            />
          </div>

          {/* Right: Results */}
          <div className="space-y-6">
            <MetricCards filters={filters} />
            <ItemsTable filters={filters} isLoading={isLoading} />
          </div>
        </div>
      </div>

      {/* Info Panel */}
      <InfoPanel />
    </div>
  );
}
