/**
 * React hook for fetching top items from the API
 */
import useSWR from 'swr';
import type { TopItemsResponse } from '../types/api';
import type { FilterState } from '@/components/FilterPanel';

const fetcher = async (url: string): Promise<TopItemsResponse> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch top items');
  }
  return response.json();
};

export function useTopItems(params: FilterState) {
  // Build query string
  const searchParams = new URLSearchParams();
  
  if (params.worldOrDc) searchParams.set('worldOrDc', params.worldOrDc);
  if (params.timeframe) searchParams.set('timeframe', params.timeframe);
  if (params.categories && params.categories.length > 0) {
    searchParams.set('categories', params.categories.join(','));
  }
  
  // Convert itemType to craftableOnly/nonCraftableOnly for API compatibility
  if (params.itemType === 'craftable') {
    searchParams.set('craftableOnly', 'true');
  } else if (params.itemType === 'non-craftable') {
    searchParams.set('nonCraftableOnly', 'true');
  }
  
  if (params.topN !== undefined) {
    searchParams.set('topN', params.topN.toString());
  }
  // UI is locked to bestToSell for now
  searchParams.set('rankingMetric', 'bestToSell');

  const url = `/api/top-items?${searchParams.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<TopItemsResponse>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
    }
  );

  return {
    data,
    error,
    isLoading,
    refetch: mutate,
  };
}
