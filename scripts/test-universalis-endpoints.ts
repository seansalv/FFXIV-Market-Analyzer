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
const TEST_CONFIGS = [
  {
    name: 'Current format (world with query param)',
    url: (world: string, items: string) => `${BASE_URL}/${world}?items=${items}`,
  },
  {
    name: 'Data center with query param',
    url: (world: string, items: string) => `${BASE_URL}/primal?items=${items}`, // Test with DC
  },
  {
    name: 'Market batch endpoint (path)',
    url: (world: string, items: string) => `${BASE_URL}/market/batch/${world}/${items}`,
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

async function testEndpoint(config: typeof TEST_CONFIGS[0], world: string, itemIds: number[]) {
  const itemsParam = itemIds.join(',');
  const url = config.url(world, itemsParam);
  
  console.log(`\n🧪 Testing: ${config.name}`);
  console.log(`   URL: ${url}`);
  
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FFXIV-Market-Analyzer/1.0',
      },
    });
    const duration = Date.now() - startTime;
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Duration: ${duration}ms`);
    
    if (response.ok) {
      const data = await response.json();
      const dataKeys = Object.keys(data);
      console.log(`   ✅ SUCCESS! Response keys: ${dataKeys.length}`);
      
      // Show sample of what we got back
      if (dataKeys.length > 0) {
        const firstKey = dataKeys[0];
        const firstItem = data[firstKey];
        console.log(`   Sample item (${firstKey}):`, {
          hasListings: !!firstItem.listings,
          hasHistory: !!firstItem.recentHistory,
          listingCount: firstItem.listings?.length || 0,
          historyCount: firstItem.recentHistory?.length || 0,
        });
      }
      
      // Check if we got data for the items we requested
      const requestedIds = new Set(itemIds.map(String));
      const receivedIds = new Set(dataKeys);
      const matched = itemIds.filter(id => receivedIds.has(String(id)));
      console.log(`   Matched items: ${matched.length}/${itemIds.length}`);
      
      return { success: true, data, url, matchedCount: matched.length };
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

