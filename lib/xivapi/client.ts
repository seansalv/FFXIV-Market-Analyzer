/**
 * XIVAPI v2 client for fetching item metadata and recipe data
 * Documentation: https://v2.xivapi.com/api/docs
 * Rate limit: 20 requests per second per IP
 */

const BASE_URL = 'https://v2.xivapi.com/api';
const RATE_LIMIT_RPS = 20; // 20 requests per second
const MAX_CONCURRENT = 5; // Maximum concurrent requests
const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 3;

// Token bucket rate limiter for concurrent requests
class TokenBucketRateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;
  private activeRequests: number = 0;

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate; // tokens per second
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1 && this.activeRequests < MAX_CONCURRENT) {
        this.tokens -= 1;
        this.activeRequests++;
        return;
      }
      // Wait a bit before trying again
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  release() {
    this.activeRequests--;
  }
}

const rateLimiter = new TokenBucketRateLimiter(RATE_LIMIT_RPS, RATE_LIMIT_RPS);

async function rateLimitedFetch(url: string, retries = MAX_RETRIES): Promise<Response> {
  await rateLimiter.acquire();
  let released = false;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      released = true;
      rateLimiter.release();
      
      if (response.status === 429 && retries > 0) {
        // Rate limited - wait and retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * 2));
        return rateLimitedFetch(url, retries - 1);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    released = true;
    rateLimiter.release();
    return response;
  } catch (error) {
    if (!released) {
      rateLimiter.release();
    }
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return rateLimitedFetch(url, retries - 1);
    }
    throw error;
  }
}

// v2 API response structure
interface XIVAPIv2Response<T> {
  schema: string;
  version: string;
  row_id: number;
  fields: T;
}

interface XIVAPIv2NestedRef {
  value: number;
  sheet: string;
  row_id: number;
  fields?: {
    Name?: string;
    [key: string]: any;
  };
}

export interface XIVAPIItem {
  ID: number;
  Name: string;
  ItemKind?: XIVAPIv2NestedRef;
  ItemUICategory?: XIVAPIv2NestedRef;
  Icon?: string;
  Recipe?: XIVAPIv2NestedRef;
  ClassJobCategory?: XIVAPIv2NestedRef;
}

export interface XIVAPIRecipe {
  ID: number;
  ItemResult?: XIVAPIv2NestedRef;
  AmountResult: number;
  Ingredients: Array<{
    ItemIngredient?: XIVAPIv2NestedRef;
    AmountIngredient: number;
  }>;
}

/**
 * Fetch item data from XIVAPI v2
 * v2 API format: GET /sheet/Item/{id}?fields=ID,Name,ItemKind.Name,...
 */
export async function fetchItemData(itemId: number): Promise<XIVAPIItem | null> {
  try {
    const url = `${BASE_URL}/sheet/Item/${itemId}?fields=ID,Name,ItemKind.Name,ItemUICategory.Name,Icon,Recipe,ClassJobCategory.Name&language=en`;
    const response = await rateLimitedFetch(url);
    const data: XIVAPIv2Response<XIVAPIItem> = await response.json();
    
    // v2 returns data in a 'fields' object
    if (!data.fields) {
      return null;
    }
    
    return data.fields;
  } catch (error) {
    console.warn(`Failed to fetch item ${itemId} from XIVAPI v2:`, error);
    return null;
  }
}

/**
 * Fetch multiple items in a single batch request from XIVAPI v2
 * v2 API format: GET /sheet/Item?rows={comma-separated-ids}&fields=...
 * Returns a Map of itemId -> XIVAPIItem for successful fetches
 */
export async function fetchItemDataBatch(itemIds: number[]): Promise<Map<number, XIVAPIItem>> {
  if (itemIds.length === 0) {
    return new Map();
  }

  const result = new Map<number, XIVAPIItem>();
  
  try {
    // Build comma-separated list of item IDs
    const rowsParam = itemIds.join(',');
    const url = `${BASE_URL}/sheet/Item?rows=${rowsParam}&fields=ID,Name,ItemKind.Name,ItemUICategory.Name,Icon,Recipe,ClassJobCategory.Name&language=en`;
    
    const response = await rateLimitedFetch(url);
    const data = await response.json();
    
    // v2 batch endpoint returns: { schema, version, rows: [{ row_id, fields }, ...] }
    if (data.rows && Array.isArray(data.rows)) {
      for (const row of data.rows) {
        if (row.fields && row.row_id) {
          result.set(row.row_id, row.fields as XIVAPIItem);
        }
      }
    } else if (Array.isArray(data)) {
      // Fallback: direct array format
      for (const row of data) {
        if (row.fields && row.row_id) {
          result.set(row.row_id, row.fields as XIVAPIItem);
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to fetch batch of ${itemIds.length} items from XIVAPI v2:`, error);
  }
  
  return result;
}

/**
 * Fetch recipe data from XIVAPI v2
 * v2 API format: GET /sheet/Recipe/{id}?fields=...
 */
export async function fetchRecipeData(recipeId: number): Promise<XIVAPIRecipe | null> {
  try {
    const url = `${BASE_URL}/sheet/Recipe/${recipeId}?fields=ID,ItemResult,AmountResult,Ingredients.ItemIngredient,Ingredients.AmountIngredient&language=en`;
    const response = await rateLimitedFetch(url);
    const data: XIVAPIv2Response<XIVAPIRecipe> = await response.json();
    
    // v2 returns data in a 'fields' object
    if (!data.fields) {
      return null;
    }
    
    return data.fields;
  } catch (error) {
    console.warn(`Failed to fetch recipe ${recipeId} from XIVAPI v2:`, error);
    return null;
  }
}

/**
 * Fetch multiple recipes in a single batch request from XIVAPI v2
 * v2 API format: GET /sheet/Recipe?rows={comma-separated-ids}&fields=...
 * Returns a Map of recipeId -> XIVAPIRecipe for successful fetches
 */
export async function fetchRecipeDataBatch(recipeIds: number[]): Promise<Map<number, XIVAPIRecipe>> {
  if (recipeIds.length === 0) {
    return new Map();
  }

  const result = new Map<number, XIVAPIRecipe>();
  
  try {
    const rowsParam = recipeIds.join(',');
    const url = `${BASE_URL}/sheet/Recipe?rows=${rowsParam}&fields=ID,ItemResult,AmountResult,Ingredients.ItemIngredient,Ingredients.AmountIngredient&language=en`;
    
    const response = await rateLimitedFetch(url);
    const data = await response.json();
    
    // v2 batch endpoint returns: { schema, version, rows: [{ row_id, fields }, ...] }
    if (data.rows && Array.isArray(data.rows)) {
      for (const row of data.rows) {
        if (row.fields && row.row_id) {
          result.set(row.row_id, row.fields as XIVAPIRecipe);
        }
      }
    } else if (Array.isArray(data)) {
      // Fallback: direct array format
      for (const row of data) {
        if (row.fields && row.row_id) {
          result.set(row.row_id, row.fields as XIVAPIRecipe);
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to fetch batch of ${recipeIds.length} recipes from XIVAPI v2:`, error);
  }
  
  return result;
}

/**
 * Calculate material cost for a recipe
 * This is a simplified version - in production you'd want to:
 * 1. Look up current market prices for each ingredient
 * 2. Account for crystal costs
 * 3. Handle HQ vs NQ materials
 */
export async function calculateMaterialCost(
  recipe: XIVAPIRecipe,
  getIngredientPrice: (itemId: number) => Promise<number | null>
): Promise<number> {
  let totalCost = 0;

  for (const ingredient of recipe.Ingredients || []) {
    // v2 API: ItemIngredient is a nested ref with row_id/value
    const itemId = ingredient.ItemIngredient?.row_id || ingredient.ItemIngredient?.value;
    const quantity = ingredient.AmountIngredient || 0;

    if (itemId && quantity > 0) {
      // Try to get current market price
      const price = await getIngredientPrice(itemId);
      if (price) {
        totalCost += price * quantity;
      }
      // If price not available, skip this ingredient (or use a default)
    }
  }

  return totalCost;
}

