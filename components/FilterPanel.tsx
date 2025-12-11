'use client';

import { Filter, Play, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export interface FilterState {
  worldOrDc: string;
  timeframe: '1d' | '7d' | '30d';
  categories: string[];
  itemType: 'all' | 'craftable' | 'non-craftable';
  topN: number;
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
  'Cloth',
  'Leather',
  'Bone',
  'Metal',
  'Stone',
  'Reagent',
  'Meal',
  'Medicine',
  'Materia',
  'Crystal',
  'Catalyst',
  'Miscellany',
  'Other',
];

const TOP_N_OPTIONS = [10, 25, 50, 100];

export function FilterPanel({ filters, onFilterChange, onAnalyze, isLoading }: FilterPanelProps) {
  const [showCategories, setShowCategories] = useState(false);

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
          <h2 className="text-white font-medium">Find Profitable Items</h2>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* World / Data Center */}
        <div>
          <label className="text-sm text-slate-300 mb-2 block">Location</label>
          <select
            value={filters.worldOrDc}
            onChange={(e) => onFilterChange({ worldOrDc: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {Object.entries(WORLDS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Timeframe */}
        <div>
          <label className="text-sm text-slate-300 mb-2 block">Time Period</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: '1d', label: '24 Hours' },
              { value: '7d', label: '7 Days' },
              { value: '30d', label: '30 Days' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => onFilterChange({ timeframe: option.value as FilterState['timeframe'] })}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  filters.timeframe === option.value
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Item Type (craftable vs non-craftable) */}
        <div>
          <label className="text-sm text-slate-300 mb-2 block">Item Type</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'all', label: 'All' },
              { value: 'craftable', label: 'Craftable' },
              { value: 'non-craftable', label: 'Other' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => onFilterChange({ itemType: option.value as FilterState['itemType'] })}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  filters.itemType === option.value
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Show Top N */}
        <div>
          <label className="text-sm text-slate-300 mb-2 block">Show Top</label>
          <div className="grid grid-cols-4 gap-2">
            {TOP_N_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => onFilterChange({ topN: n })}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  filters.topN === n
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Categories (collapsible, optional) */}
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowCategories(!showCategories)}
            className="w-full px-3 py-2.5 bg-slate-800/50 hover:bg-slate-800 flex items-center justify-between transition-colors"
          >
            <span className="text-sm text-slate-300">
              Filter by Category
              {filters.categories.length > 0 && (
                <span className="ml-2 text-amber-500">({filters.categories.length} selected)</span>
              )}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform ${showCategories ? 'rotate-180' : ''}`}
            />
          </button>
          {showCategories && (
            <div className="p-3 bg-slate-900/50 space-y-2">
              <button
                onClick={() => onFilterChange({ categories: [] })}
                className="text-xs text-amber-500 hover:text-amber-400 underline"
              >
                Clear All
              </button>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((category) => (
                  <label key={category} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={filters.categories.includes(category)}
                      onChange={() => toggleCategory(category)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
                    />
                    <span className="text-xs text-slate-300 group-hover:text-white transition-colors">
                      {category}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analyze Button */}
      <div className="p-4 border-t border-slate-800">
        <button
          onClick={onAnalyze}
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:from-slate-700 disabled:to-slate-800 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              <span>Find Best Items</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
