/**
 * Universalis API client with rate limiting and retry logic
 * Rate limit: 10 requests per second
 * Documentation: https://universalis.app/docs/index.html
 */

import type { UniversalisMarketData } from '../types/api';

const BASE_URL = process.env.UNIVERSALIS_API_URL || 'https://universalis.app/api/v2';
const RATE_LIMIT_RPS = 10; // Requests per second
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Simple rate limiter using a queue
class RateLimiter {
  private queue: Array<() => void> = [];
  private processing = false;
  private lastRequestTime = 0;
  private minInterval = 1000 / RATE_LIMIT_RPS; // 100ms between requests

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < this.minInterval) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.minInterval - timeSinceLastRequest)
        );
      }

      const task = this.queue.shift();
      if (task) {
        this.lastRequestTime = Date.now();
        task();
      }
    }

    this.processing = false;
  }
}

const rateLimiter = new RateLimiter();

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES
): Promise<Response> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FFXIV-Market-Analyzer/1.0',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limited - wait longer
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * 2));
        if (retries > 0) {
          return fetchWithRetry(url, retries - 1);
        }
      }
      // Log the URL for debugging 404 errors
      if (response.status === 404) {
        console.error(`404 Not Found for URL: ${url}`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText} - URL: ${url}`);
    }

    return response;
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return fetchWithRetry(url, retries - 1);
    }
    throw error;
  }
}

/**
 * Fetch market data for a single item on a specific world or data center
 */
export async function fetchMarketData(
  worldOrDc: string,
  itemId: number
): Promise<UniversalisMarketData> {
  const url = `${BASE_URL}/${worldOrDc.toLowerCase()}/${itemId}`;

  return rateLimiter.execute(async () => {
    const response = await fetchWithRetry(url);
    const data = await response.json();
    return data as UniversalisMarketData;
  });
}

/**
 * Fetch market data for multiple items on a specific world or data center
 * Universalis supports up to 100 items per request via the market-board endpoint
 */
export async function fetchMarketDataBatch(
  worldOrDc: string,
  itemIds: number[]
): Promise<Record<number, UniversalisMarketData>> {
  if (itemIds.length === 0) {
    return {};
  }

  if (itemIds.length > 100) {
    // Split into batches of 100
    const batches: number[][] = [];
    for (let i = 0; i < itemIds.length; i += 100) {
      batches.push(itemIds.slice(i, i + 100));
    }

    const results: Record<number, UniversalisMarketData> = {};
    for (const batch of batches) {
      const batchResults = await fetchMarketDataBatch(worldOrDc, batch);
      Object.assign(results, batchResults);
    }
    return results;
  }

  // Universalis API v2 batch endpoint: /api/v2/market-board/{worldOrDc}?items={itemIds}
  const itemsParam = itemIds.join(',');
  const worldName = worldOrDc.toLowerCase();
  const url = `${BASE_URL}/market-board/${worldName}?items=${itemsParam}`;

  return rateLimiter.execute(async () => {
    try {
      const response = await fetchWithRetry(url);
      const data = await response.json();
      
      // The batch endpoint returns an object with item IDs as keys
      // If no data exists for items, they may not be in the response
      if (!data || typeof data !== 'object') {
        return {};
      }
      
      // Filter out any null/undefined entries
      const result: Record<number, UniversalisMarketData> = {};
      for (const [key, value] of Object.entries(data)) {
        const itemId = parseInt(key, 10);
        if (!isNaN(itemId) && value && typeof value === 'object') {
          result[itemId] = value as UniversalisMarketData;
        }
      }
      
      return result;
    } catch (error) {
      // If batch endpoint fails, fall back to individual requests
      console.warn(`   ⚠ Batch request failed for ${worldName}, trying individual requests...`);
      const results: Record<number, UniversalisMarketData> = {};
      
      for (const itemId of itemIds) {
        try {
          const itemData = await fetchMarketData(worldOrDc, itemId);
          results[itemId] = itemData;
          // Small delay between individual requests
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          // Skip items that don't exist or have no data
          console.warn(`   ⚠ Skipping item ${itemId} (no data available)`);
        }
      }
      
      return results;
    }
  });
}

/**
 * Fetch all marketable item IDs from Universalis
 * This returns ALL items that can be sold on the marketboard
 */
export async function getAllMarketableItemIds(): Promise<number[]> {
  const url = `${BASE_URL}/marketable`;
  
  return rateLimiter.execute(async () => {
    const response = await fetchWithRetry(url);
    const data = await response.json();
    
    if (Array.isArray(data)) {
      return data.map(id => typeof id === 'number' ? id : parseInt(id, 10)).filter(id => !isNaN(id));
    }
    
    throw new Error('Invalid response from Universalis marketable endpoint');
  });
}

/**
 * Get list of popular item IDs to track
 * For backwards compatibility and testing with a smaller subset
 */
export function getPopularItemIds(): number[] {
  // Popular marketable items to track
  // Use getAllMarketableItemIds() to get ALL items instead
  return [
    // Grade 8 Tinctures (Crafting/Gathering)
    36113, // Grade 8 Tincture of Strength
    36114, // Grade 8 Tincture of Dexterity  
    36115, // Grade 8 Tincture of Vitality
    36116, // Grade 8 Tincture of Intelligence
    36117, // Grade 8 Tincture of Mind
    
    // Crafting Materials
    39888, // Chondrite Ingot
    39887, // Chondrite Ore
    36652, // Rarefied Chondrite Ingot
    
    // Materia
    10386, // Savage Aim Materia X
    10387, // Savage Might Materia X
  ];
}

