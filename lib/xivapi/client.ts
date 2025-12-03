/**
 * XIVAPI client for fetching item metadata and recipe data
 * Documentation: https://xivapi.com/docs
 */

const BASE_URL = 'https://xivapi.com';

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

export interface XIVAPIItem {
  ID: number;
  Name: string;
  ItemKind?: {
    Name: string;
  };
  ItemUICategory?: {
    Name: string;
  };
  Icon?: string;
  Recipe?: {
    ID: number;
  };
  ClassJobCategory?: {
    Name: string;
  };
}

export interface XIVAPIRecipe {
  ID: number;
  ItemResult: {
    ID: number;
    Name: string;
  };
  AmountResult: number;
  Ingredients: Array<{
    ItemIngredient: {
      ID: number;
      Name: string;
    };
    AmountIngredient: number;
  }>;
}

/**
 * Fetch item data from XIVAPI
 */
export async function fetchItemData(itemId: number): Promise<XIVAPIItem | null> {
  try {
    const url = `${BASE_URL}/Item/${itemId}?columns=ID,Name,ItemKind.Name,ItemUICategory.Name,Icon,Recipe.ID,ClassJobCategory.Name`;
    const response = await rateLimitedFetch(url);
    const data = await response.json();
    return data as XIVAPIItem;
  } catch (error) {
    console.warn(`Failed to fetch item ${itemId} from XIVAPI:`, error);
    return null;
  }
}

/**
 * Fetch recipe data from XIVAPI
 */
export async function fetchRecipeData(recipeId: number): Promise<XIVAPIRecipe | null> {
  try {
    const url = `${BASE_URL}/Recipe/${recipeId}?columns=ID,ItemResult.ID,ItemResult.Name,AmountResult,Ingredients.ItemIngredient.ID,Ingredients.ItemIngredient.Name,Ingredients.AmountIngredient`;
    const response = await rateLimitedFetch(url);
    const data = await response.json();
    return data as XIVAPIRecipe;
  } catch (error) {
    console.warn(`Failed to fetch recipe ${recipeId} from XIVAPI:`, error);
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
    const itemId = ingredient.ItemIngredient?.ID;
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

