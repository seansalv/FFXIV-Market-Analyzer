'use client';

import { Filter, Play, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export interface FilterState {
  worldOrDc: string;
  timeframe: '1d' | '7d' | '30d';
  categories: string[];
  craftableOnly: boolean;
  nonCraftableOnly: boolean;
  minSalesVelocity: number;
  minRevenue: number;
  maxListings: number | null;
  minPrice: number;
  topN: number;
  rankingMetric: 'revenue' | 'volume' | 'avgPrice' | 'profit' | 'roi';
}

interface FilterPanelProps {
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  onAnalyze: () => void;
  isLoading: boolean;
}

const WORLDS = {
  'all-na': 'All NA Regions',
  // Aether DC
  'aether': 'Aether (Data Center)',
  'adamantoise': 'Adamantoise',
  'cactuar': 'Cactuar',
  'faerie': 'Faerie',
  'gilgamesh': 'Gilgamesh',
  'jenova': 'Jenova',
  'midgardsormr': 'Midgardsormr',
  'sargatanas': 'Sargatanas',
  'siren': 'Siren',
  // Primal DC
  'primal': 'Primal (Data Center)',
  'behemoth': 'Behemoth',
  'excalibur': 'Excalibur',
  'exodus': 'Exodus',
  'famfrit': 'Famfrit',
  'hyperion': 'Hyperion',
  'lamia': 'Lamia',
  'leviathan': 'Leviathan',
  'ultros': 'Ultros',
  // Crystal DC
  'crystal': 'Crystal (Data Center)',
  'balmung': 'Balmung',
  'brynhildr': 'Brynhildr',
  'coeurl': 'Coeurl',
  'diabolos': 'Diabolos',
  'goblin': 'Goblin',
  'malboro': 'Malboro',
  'mateus': 'Mateus',
  'zalera': 'Zalera',
  // Dynamis DC
  'dynamis': 'Dynamis (Data Center)',
  'halicarnassus': 'Halicarnassus',
  'maduin': 'Maduin',
  'marilith': 'Marilith',
  'seraph': 'Seraph',
};

const CATEGORIES = [
  'Consumables',
  'Crafting Materials',
  'Materia',
  'Gear',
  'Housing',
  'Furnishings',
  'Minions & Mounts',
  'Dyes',
  'Crystals & Clusters',
  'Other',
];

export function FilterPanel({ filters, onFilterChange, onAnalyze, isLoading }: FilterPanelProps) {
  const [expandedSections, setExpandedSections] = useState({
    location: true,
    time: true,
    categories: true,
    craftable: true,
    thresholds: true,
    ranking: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleCategory = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter(c => c !== category)
      : [...filters.categories, category];
    onFilterChange({ categories: newCategories });
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-amber-500" />
          <h2 className="text-white">Filters</h2>
        </div>
      </div>

      <div className="p-4 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
        {/* World / Data Center */}
        <FilterSection
          title="Location"
          expanded={expandedSections.location}
          onToggle={() => toggleSection('location')}
        >
          <select
            value={filters.worldOrDc}
            onChange={(e) => onFilterChange({ worldOrDc: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {Object.entries(WORLDS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </FilterSection>

        {/* Timeframe */}
        <FilterSection
          title="Timeframe"
          expanded={expandedSections.time}
          onToggle={() => toggleSection('time')}
        >
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: '1d', label: '1 Day' },
              { value: '7d', label: '7 Days' },
              { value: '30d', label: '30 Days' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => onFilterChange({ timeframe: option.value as FilterState['timeframe'] })}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  filters.timeframe === option.value
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Categories */}
        <FilterSection
          title="Item Categories"
          expanded={expandedSections.categories}
          onToggle={() => toggleSection('categories')}
        >
          <div className="space-y-2">
            <button
              onClick={() => onFilterChange({ categories: [] })}
              className="text-xs text-amber-500 hover:text-amber-400 underline"
            >
              Clear All
            </button>
            {CATEGORIES.map((category) => (
              <label key={category} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filters.categories.includes(category)}
                  onChange={() => toggleCategory(category)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
                />
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                  {category}
                </span>
              </label>
            ))}
          </div>
        </FilterSection>

        {/* Craftable Status */}
        <FilterSection
          title="Craftable Status"
          expanded={expandedSections.craftable}
          onToggle={() => toggleSection('craftable')}
        >
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.craftableOnly}
                onChange={(e) => onFilterChange({ 
                  craftableOnly: e.target.checked,
                  nonCraftableOnly: e.target.checked ? false : filters.nonCraftableOnly
                })}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
              />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                Craftable Items Only
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.nonCraftableOnly}
                onChange={(e) => onFilterChange({ 
                  nonCraftableOnly: e.target.checked,
                  craftableOnly: e.target.checked ? false : filters.craftableOnly
                })}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
              />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                Non-Craftable Items Only
              </span>
            </label>
          </div>
        </FilterSection>

        {/* Thresholds */}
        <FilterSection
          title="Thresholds"
          expanded={expandedSections.thresholds}
          onToggle={() => toggleSection('thresholds')}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Min Sales Velocity (units/day)</label>
              <input
                type="number"
                value={filters.minSalesVelocity}
                onChange={(e) => onFilterChange({ minSalesVelocity: Number(e.target.value) })}
                min="0"
                step="0.1"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Min Revenue (gil)</label>
              <input
                type="number"
                value={filters.minRevenue}
                onChange={(e) => onFilterChange({ minRevenue: Number(e.target.value) })}
                min="0"
                step="1000"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Max Listings (optional)</label>
              <input
                type="number"
                value={filters.maxListings ?? ''}
                onChange={(e) => onFilterChange({ maxListings: e.target.value ? Number(e.target.value) : null })}
                min="0"
                placeholder="No limit"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Min Price (gil)</label>
              <input
                type="number"
                value={filters.minPrice}
                onChange={(e) => onFilterChange({ minPrice: Number(e.target.value) })}
                min="0"
                step="100"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </FilterSection>

        {/* Ranking */}
        <FilterSection
          title="Ranking & Display"
          expanded={expandedSections.ranking}
          onToggle={() => toggleSection('ranking')}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Rank By</label>
              <select
                value={filters.rankingMetric}
                onChange={(e) => onFilterChange({ rankingMetric: e.target.value as FilterState['rankingMetric'] })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="revenue">Total Revenue</option>
                <option value="volume">Units Sold</option>
                <option value="avgPrice">Average Price</option>
                <option value="profit">Profit per Unit</option>
                <option value="roi">ROI / Margin %</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Show Top N Items</label>
              <input
                type="number"
                value={filters.topN}
                onChange={(e) => onFilterChange({ topN: Number(e.target.value) })}
                min="5"
                max="100"
                step="5"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </FilterSection>
      </div>

      {/* Analyze Button */}
      <div className="p-4 border-t border-slate-800">
        <button
          onClick={onAnalyze}
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:from-slate-700 disabled:to-slate-800 disabled:cursor-not-allowed text-white py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              <span>Run Analysis</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface FilterSectionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function FilterSection({ title, expanded, onToggle, children }: FilterSectionProps) {
  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 bg-slate-800/50 hover:bg-slate-800 flex items-center justify-between transition-colors"
      >
        <span className="text-sm text-white">{title}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      {expanded && (
        <div className="p-3 bg-slate-900/50">
          {children}
        </div>
      )}
    </div>
  );
}

