'use client';

import { useState, useEffect } from 'react';
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Download, 
  ExternalLink,
  Sparkles 
} from 'lucide-react';
import { useTopItems } from '@/lib/hooks/use-top-items';
import type { FilterState } from './FilterPanel';
import type { MarketItem } from '@/lib/types/api';

interface ItemsTableProps {
  filters: FilterState;
  isLoading: boolean;
}

type SortField = 'name' | 'unitsSold' | 'salesVelocity' | 'totalRevenue' | 'avgPrice';
type SortDirection = 'asc' | 'desc';

export function ItemsTable({ filters, isLoading: externalLoading }: ItemsTableProps) {
  const { data, isLoading: dataLoading, error } = useTopItems(filters);
  const [sortField, setSortField] = useState<SortField>('totalRevenue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const isLoading = externalLoading || dataLoading;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedItems = data?.items ? [...data.items].sort((a, b) => {
    let aVal: number | string | null = a[sortField];
    let bVal: number | string | null = b[sortField];
    
    // Handle null values
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = (bVal as string).toLowerCase();
    }
    
    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  }) : [];

  const formatGil = (amount: number | undefined | null): string => {
    const safe = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
    if (safe >= 1000000) {
      return `${(safe / 1000000).toFixed(2)}M`;
    } else if (safe >= 1000) {
      return `${(safe / 1000).toFixed(1)}K`;
    }
    return safe.toLocaleString();
  };

  const handleExport = () => {
    if (!data?.items) return;

    const csv = [
      ['Item', 'World', 'Units Sold', 'Sales Velocity', 'Revenue', 'Avg Price', 'Listings'],
      ...data.items.map(item => [
        item.name,
        item.world,
        item.unitsSold.toString(),
        item.salesVelocity.toFixed(1),
        item.totalRevenue.toString(),
        item.avgPrice.toString(),
        item.activeListings.toString(),
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ffxiv-market-analysis-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 text-slate-500" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-4 h-4 text-amber-500" />
      : <ArrowDown className="w-4 h-4 text-amber-500" />;
  };

  if (isLoading) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-slate-400">Analyzing market data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <p className="text-red-400">Error loading data. Please try again.</p>
        </div>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <p className="text-slate-400">No items found matching your filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h2 className="text-white">Top {filters.topN} Most Profitable Items</h2>
          <p className="text-slate-400 text-sm">
            {filters.timeframe === '1d' ? 'Last 24 Hours' : filters.timeframe === '7d' ? 'Last 7 Days' : 'Last 30 Days'} • {filters.worldOrDc === 'all-na' ? 'All NA Regions' : filters.worldOrDc}
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-800/50 border-b border-slate-700">
            <tr>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
                >
                  <span>Item</span>
                  <SortIcon field="name" />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-sm text-slate-300">World/DC</span>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  onClick={() => handleSort('unitsSold')}
                  className="flex items-center gap-2 ml-auto text-sm text-slate-300 hover:text-white transition-colors"
                >
                  <span>Units Sold</span>
                  <SortIcon field="unitsSold" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  onClick={() => handleSort('salesVelocity')}
                  className="flex items-center gap-2 ml-auto text-sm text-slate-300 hover:text-white transition-colors"
                >
                  <span>Velocity</span>
                  <SortIcon field="salesVelocity" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  onClick={() => handleSort('totalRevenue')}
                  className="flex items-center gap-2 ml-auto text-sm text-slate-300 hover:text-white transition-colors"
                >
                  <span>Revenue</span>
                  <SortIcon field="totalRevenue" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  onClick={() => handleSort('avgPrice')}
                  className="flex items-center gap-2 ml-auto text-sm text-slate-300 hover:text-white transition-colors"
                >
                  <span>Avg Price</span>
                  <SortIcon field="avgPrice" />
                </button>
              </th>
              <th className="px-4 py-3 text-center">
                <span className="text-sm text-slate-300">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sortedItems.slice(0, filters.topN).map((item, index) => (
              <tr key={`${item.id}-${item.world}`} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center">
                      <span className="text-xs text-slate-500">#{index + 1}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white" title={`Item ID: ${item.id}`}>
                          {item.name}
                        </p>
                        {item.isCraftable && (
                          <Sparkles className="w-4 h-4 text-amber-500" title="Craftable" />
                        )}
                      </div>
                      <p className="text-slate-400 text-sm">{item.category || 'Other'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-300 text-sm">
                    {item.world.charAt(0).toUpperCase() + item.world.slice(1)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-white">{item.unitsSold.toLocaleString()}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-slate-300 text-sm">{item.salesVelocity.toFixed(1)}/day</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="text-right">
                    <p className="text-amber-500">{formatGil(item.totalRevenue)}</p>
                    <p className="text-slate-400 text-xs">gil</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="text-right">
                    <p className="text-white">{formatGil(item.avgPrice)}</p>
                    {item.minPrice !== null && item.maxPrice !== null && (
                      <p className="text-slate-400 text-xs">{formatGil(item.minPrice)} - {formatGil(item.maxPrice)}</p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <a
                      href={`https://universalis.app/market/${item.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                      title="View on Universalis"
                    >
                      <ExternalLink className="w-4 h-4 text-slate-400 hover:text-white" />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="bg-slate-800/30 px-4 py-3 border-t border-slate-800">
        <p className="text-slate-400 text-sm text-center">
          Showing {Math.min(filters.topN, sortedItems.length)} of {data.totalItems} items
        </p>
      </div>
    </div>
  );
}

