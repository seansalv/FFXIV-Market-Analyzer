/**
 * Test script to find the correct Universalis API batch endpoint format
 * 
 * Usage:
 *   npm run test:endpoints
 * 
 * This script tests various endpoint formats and shows which ones work
 */

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.UNIVERSALIS_API_URL || 'https://universalis.app/api/v2';

// Curated list of known FFXIV item IDs that are commonly traded
// These are items that definitely exist and are marketable
const KNOWN_ITEM_IDS = [
  // Grade 8 Tinctures (very popular, always have market data)
  36113, // Grade 8 Tincture of Strength
  36114, // Grade 8 Tincture of Dexterity
  36115, // Grade 8 Tincture of Vitality
  36116, // Grade 8 Tincture of Intelligence
  36117, // Grade 8 Tincture of Mind
  
  // Materia (always in demand)
  10386, // Savage Aim Materia X
  10387, // Savage Might Materia X
  10388, // Heaven's Eye Materia X
  10389, // Quickarm Materia X
  10390, // Quicktongue Materia X
  
  // Common crafting materials (Endwalker)
  39888, // Chondrite Ingot
  39887, // Chondrite Ore
  36652, // Rarefied Chondrite Ingot
  39889, // Chondrite Nugget
  
  // Food items (popular consumables)
  36220, // Crystalline Crozier
  36221, // Crystalline War Quiche
  36222, // Crystalline Tea
  
  // Housing items (commonly traded)
  36118, // Grade 8 Tincture of Strength (HQ)
  
  // Basic materials (always available)
  2,    // Cotton Boll
  3,    // Undyed Cotton Cloth
  4,    // Cotton Yarn
  5,    // Cotton Thread
  6,    // Cotton Cloth
  
  // More common items
  19,   // Bronze Ingot
  20,   // Iron Ingot
  21,   // Steel Ingot
];

// Test configurations - add more as needed
type TestConfig = {
  name: string;
  url: (world: string, items: string) => string;
  method?: 'GET' | 'POST';
  body?: (world: string, items: string) => any;
};

const TEST_CONFIGS: TestConfig[] = [
  {
    name: '✅ CORRECT: Official format (comma-separated in path)',
    url: (world: string, items: string) => `${BASE_URL}/${world}/${items}`,
    method: 'GET',
  },
  {
    name: 'Current format (world with query param)',
    url: (world: string, items: string) => `${BASE_URL}/${world}?items=${items}`,
  },
  {
    name: 'Data center with query param',
    url: (world: string, items: string) => `${BASE_URL}/primal?items=${items}`, // Test with DC
  },
  {
    name: 'Market batch endpoint (POST)',
    url: (world: string, items: string) => `${BASE_URL}/market/batch`,
    method: 'POST',
    body: (world: string, items: string) => ({
      world: world,
      items: items.split(',').map(id => parseInt(id, 10)),
    }),
  },
  {
    name: 'Market endpoint with query param',
    url: (world: string, items: string) => `${BASE_URL}/market/${world}?items=${items}`,
  },
  {
    name: 'World endpoint with items path',
    url: (world: string, items: string) => `${BASE_URL}/${world}/items/${items}`,
  },
  {
    name: 'World endpoint with items as path segments',
    url: (world: string, items: string) => `${BASE_URL}/${world}/items?ids=${items}`,
  },
];

async function testEndpoint(config: TestConfig, world: string, itemIds: number[]) {
  const itemsParam = itemIds.join(',');
  const url = config.url(world, itemsParam);
  
  console.log(`\n🧪 Testing: ${config.name}`);
  console.log(`   URL: ${url}`);
  if (config.method === 'POST') {
    console.log(`   Method: POST`);
    console.log(`   Body: ${JSON.stringify(config.body?.(world, itemsParam))}`);
  }
  
  try {
    const startTime = Date.now();
    const fetchOptions: RequestInit = {
      headers: {
        'User-Agent': 'FFXIV-Market-Analyzer/1.0',
      },
    };
    
    if (config.method === 'POST') {
      fetchOptions.method = 'POST';
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'Content-Type': 'application/json',
      };
      fetchOptions.body = JSON.stringify(config.body?.(world, itemsParam));
    }
    
    const response = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Duration: ${duration}ms`);
    
    if (response.ok) {
      const data = await response.json();
      const dataKeys = Object.keys(data);
      console.log(`   ✅ SUCCESS! Response keys: ${dataKeys.length}`);
      console.log(`   Top-level keys: ${dataKeys.slice(0, 10).join(', ')}${dataKeys.length > 10 ? '...' : ''}`);
      
      // Show full response structure
      console.log(`   Full response structure:`);
      console.log(`   ${JSON.stringify(data, null, 2).split('\n').slice(0, 50).join('\n   ')}${JSON.stringify(data, null, 2).split('\n').length > 50 ? '\n   ... (truncated)' : ''}`);
      
      // Check if response has item IDs as top-level keys
      const requestedIds = new Set(itemIds.map(String));
      const receivedIds = new Set(dataKeys);
      const matched = itemIds.filter(id => receivedIds.has(String(id)));
      
      // Also check if items are nested (e.g., data.items or data.itemIDs)
      let nestedItems: any = null;
      if (data.items && typeof data.items === 'object') {
        nestedItems = data.items;
        const nestedKeys = Object.keys(nestedItems);
        const nestedMatched = itemIds.filter(id => nestedKeys.includes(String(id)));
        console.log(`   Found nested 'items' object with ${nestedKeys.length} keys`);
        console.log(`   Nested matched items: ${nestedMatched.length}/${itemIds.length}`);
      }
      if (data.itemIDs && Array.isArray(data.itemIDs)) {
        console.log(`   Found 'itemIDs' array with ${data.itemIDs.length} items`);
        const arrayMatched = itemIds.filter(id => data.itemIDs.includes(id));
        console.log(`   Array matched items: ${arrayMatched.length}/${itemIds.length}`);
      }
      
      // Show sample of what we got back
      if (dataKeys.length > 0) {
        const firstKey = dataKeys[0];
        const firstItem = data[firstKey];
        if (firstItem && typeof firstItem === 'object') {
          console.log(`   Sample item structure (${firstKey}):`, {
            keys: Object.keys(firstItem).slice(0, 10),
            hasListings: !!firstItem.listings,
            hasHistory: !!firstItem.recentHistory,
            listingCount: firstItem.listings?.length || 0,
            historyCount: firstItem.recentHistory?.length || 0,
          });
        } else {
          console.log(`   Sample value (${firstKey}): ${typeof firstItem} = ${JSON.stringify(firstItem).substring(0, 100)}`);
        }
      }
      
      console.log(`   Matched items (top-level): ${matched.length}/${itemIds.length}`);
      
      return { success: true, data, url, matchedCount: matched.length, nestedItems };
    } else {
      const text = await response.text();
      console.log(`   ❌ FAILED: ${text.substring(0, 200)}`);
      return { success: false, error: `${response.status}: ${text.substring(0, 100)}`, url };
    }
  } catch (error: any) {
    console.log(`   ❌ ERROR: ${error.message}`);
    return { success: false, error: error.message, url };
  }
}

async function testSingleItem(world: string, itemId: number) {
  const url = `${BASE_URL}/${world}/${itemId}`;
  console.log(`\n📋 Reference: Single item endpoint (this is what works)`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Status: ${response.status}`);
      console.log(`   Response structure:`, {
        hasListings: !!data.listings,
        hasHistory: !!data.recentHistory,
        listingCount: data.listings?.length || 0,
        historyCount: data.recentHistory?.length || 0,
        keys: Object.keys(data).slice(0, 10),
      });
      return data;
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  return null;
}

async function main() {
  console.log('🔍 Testing Universalis API Batch Endpoint Formats\n');
  console.log('='.repeat(60));
  
  // Test with a small set of items and a known world
  const testWorld = 'ultros'; // Lowercase world name
  const testItems = KNOWN_ITEM_IDS.slice(0, 10); // Use first 10 for testing
  
  console.log(`Test parameters:`);
  console.log(`  World: ${testWorld}`);
  console.log(`  Items: ${testItems.join(', ')} (${testItems.length} items)`);
  console.log(`  Base URL: ${BASE_URL}\n`);
  console.log(`Available test items (${KNOWN_ITEM_IDS.length} total):`);
  console.log(`  ${KNOWN_ITEM_IDS.join(', ')}\n`);
  
  // First, test a single item to see what the correct response structure looks like
  await new Promise(resolve => setTimeout(resolve, 1000));
  const singleItemResponse = await testSingleItem(testWorld, testItems[0]);
  
  const results: Array<{ config: string; result: any }> = [];
  
  // Test each configuration
  for (const config of TEST_CONFIGS) {
    // Add a small delay between requests to be respectful (1 second)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const result = await testEndpoint(config, testWorld, testItems);
    results.push({ config: config.name, result });
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 SUMMARY:\n');
  
  const successful = results.filter(r => r.result.success);
  const failed = results.filter(r => !r.result.success);
  
  if (successful.length > 0) {
    console.log('✅ Working endpoints:');
    successful.forEach(({ config, result }) => {
      console.log(`   - ${config}`);
      console.log(`     URL pattern: ${result.url.split('?')[0]}?items={itemIds}`);
      console.log(`     Matched items: ${result.matchedCount}/${testItems.length}`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed endpoints:');
    failed.forEach(({ config, result }) => {
      console.log(`   - ${config}`);
      console.log(`     Error: ${result.error}`);
    });
  }
  
  if (successful.length === 0) {
    console.log('\n⚠️  No working batch endpoints found. Individual requests may be required.');
    console.log('   The current fallback to individual requests is working, but slower.');
  } else {
    const best = successful[0];
    console.log(`\n💡 Recommended format: ${best.config}`);
    console.log(`   URL pattern: ${best.result.url.split('?')[0]}?items={itemIds}`);
    console.log(`\n   To use this, update lib/universalis/client.ts line ~150:`);
    console.log(`   const url = \`\${BASE_URL}/\${worldName}?items=\${itemsParam}\`;`);
    console.log(`   // Change to the working pattern above`);
  }
}

main().catch(console.error);

