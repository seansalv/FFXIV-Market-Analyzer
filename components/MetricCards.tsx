'use client';

import { TrendingUp, Package, DollarSign, Activity } from 'lucide-react';
import { useTopItems } from '@/lib/hooks/use-top-items';
import type { FilterState } from './FilterPanel';

interface MetricCardsProps {
  filters: FilterState;
}

export function MetricCards({ filters }: MetricCardsProps) {
  const { data, isLoading } = useTopItems(filters);

  const formatGil = (amount: number): string => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(2)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toString();
  };

  const metrics = data?.metrics || {
    totalItems: 0,
    totalRevenue: 0,
    avgSalesVelocity: 0,
  };

  const cards = [
    {
      icon: Package,
      label: 'Items Analyzed',
      value: metrics.totalItems.toLocaleString(),
      color: 'from-blue-500 to-cyan-600',
    },
    {
      icon: DollarSign,
      label: 'Total Revenue',
      value: `${formatGil(metrics.totalRevenue)} gil`,
      color: 'from-amber-500 to-orange-600',
    },
    {
      icon: Activity,
      label: 'Avg Sales Velocity',
      value: `${metrics.avgSalesVelocity.toFixed(1)}/day`,
      color: 'from-purple-500 to-pink-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div
            key={index}
            className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 bg-gradient-to-br ${card.color} rounded-lg`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-slate-400 text-sm">{card.label}</p>
              <p className="text-white text-2xl">
                {isLoading ? '...' : card.value}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

