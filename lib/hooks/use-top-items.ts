/**
 * React hook for fetching top items from the API
 */
import useSWR from 'swr';
import type { TopItemsQueryParams, TopItemsResponse } from '../types/api';

const fetcher = async (url: string): Promise<TopItemsResponse> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch top items');
  }
  return response.json();
};

export function useTopItems(params: TopItemsQueryParams) {
  // Build query string
  const searchParams = new URLSearchParams();
  
  if (params.worldOrDc) searchParams.set('worldOrDc', params.worldOrDc);
  if (params.timeframe) searchParams.set('timeframe', params.timeframe);
  if (params.categories && params.categories.length > 0) {
    searchParams.set('categories', params.categories.join(','));
  }
  if (params.craftableOnly) searchParams.set('craftableOnly', 'true');
  if (params.nonCraftableOnly) searchParams.set('nonCraftableOnly', 'true');
  if (params.minSalesVelocity !== undefined) {
    searchParams.set('minSalesVelocity', params.minSalesVelocity.toString());
  }
  if (params.minRevenue !== undefined) {
    searchParams.set('minRevenue', params.minRevenue.toString());
  }
  if (params.maxListings !== null && params.maxListings !== undefined) {
    searchParams.set('maxListings', params.maxListings.toString());
  }
  if (params.minPrice !== undefined) {
    searchParams.set('minPrice', params.minPrice.toString());
  }
  if (params.topN !== undefined) {
    searchParams.set('topN', params.topN.toString());
  }
  if (params.rankingMetric) {
    searchParams.set('rankingMetric', params.rankingMetric);
  }

  const url = `/api/top-items?${searchParams.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<TopItemsResponse>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000, // Cache for 5 seconds
    }
  );

  return {
    data,
    error,
    isLoading,
    refetch: mutate,
  };
}

