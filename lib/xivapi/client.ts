/**
 * XIVAPI v2 client for fetching item metadata and recipe data
 * Documentation: https://v2.xivapi.com/api/docs
 */

const BASE_URL = 'https://v2.xivapi.com/api';

// Simple rate limiter for XIVAPI (they have rate limits too)
const requestQueue: Array<() => void> = [];
let processing = false;
const minInterval = 100; // 100ms between requests (10 req/s)

async function rateLimitedFetch(url: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        resolve(response);
      } catch (error) {
        reject(error);
      }
    });
    processQueue();
  });
}

async function processQueue() {
  if (processing || requestQueue.length === 0) return;
  processing = true;

  while (requestQueue.length > 0) {
    const task = requestQueue.shift();
    if (task) {
      await task();
      await new Promise((resolve) => setTimeout(resolve, minInterval));
    }
  }

  processing = false;
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
    const url = `${BASE_URL}/sheet/Item/${itemId}?fields=ID,Name,ItemKind.Name,ItemUICategory.Name,Icon,Recipe.ID,ClassJobCategory.Name&language=en`;
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
    const url = `${BASE_URL}/sheet/Item?rows=${rowsParam}&fields=ID,Name,ItemKind.Name,ItemUICategory.Name,Icon,Recipe.ID,ClassJobCategory.Name&language=en`;
    
    const response = await rateLimitedFetch(url);
    const data = await response.json();
    
    // v2 batch endpoint returns an array of row objects
    // Each row has: { schema, version, row_id, fields: {...} }
    if (Array.isArray(data)) {
      for (const row of data) {
        if (row.fields && row.row_id) {
          result.set(row.row_id, row.fields as XIVAPIItem);
        }
      }
    } else if (data.fields && Array.isArray(data.fields)) {
      // Alternative response format: { fields: [...] }
      for (const row of data.fields) {
        if (row.row_id && row.fields) {
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
    const url = `${BASE_URL}/sheet/Recipe/${recipeId}?fields=ID,ItemResult.ID,ItemResult.Name,AmountResult,Ingredients.ItemIngredient.ID,Ingredients.ItemIngredient.Name,Ingredients.AmountIngredient&language=en`;
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

