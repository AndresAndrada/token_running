/**
 * Test script to validate token sale calculations
 * Simulates the logic in the Rust program
 */

// Constants
const LAMPORTS_PER_SOL = 1_000_000_000;

// Helper function to scale Pyth price (same as scale_price in Rust)
function scalePythPrice(rawPrice, expo) {
  return rawPrice * Math.pow(10, expo);
}

// Test scenarios
function testTokenSaleCalculations() {
  console.log('=== TOKEN SALE CALCULATION VALIDATION ===\n');

  // Test case 1: SOL at $100, token at $0.01
  console.log('Test Case 1: SOL=$100, Token=$0.01');
  testScenario({
    solAmountLamports: 0.5 * LAMPORTS_PER_SOL, // 0.5 SOL
    solPriceUsd: 100,
    tokenPriceCents: 1, // $0.01
    pythRawPrice: 100000000, // $100 with expo -6
    pythExpo: -6,
  });

  console.log('\n' + '='.repeat(50) + '\n');

  // Test case 2: SOL at $150, token at $0.05
  console.log('Test Case 2: SOL=$150, Token=$0.05');
  testScenario({
    solAmountLamports: 1.0 * LAMPORTS_PER_SOL, // 1.0 SOL
    solPriceUsd: 150,
    tokenPriceCents: 5, // $0.05
    pythRawPrice: 150000000, // $150 with expo -6
    pythExpo: -6,
  });

  console.log('\n' + '='.repeat(50) + '\n');

  // Test case 3: Edge case with small amounts
  console.log('Test Case 3: Small amounts - SOL=$80, Token=$0.001');
  testScenario({
    solAmountLamports: 0.1 * LAMPORTS_PER_SOL, // 0.1 SOL
    solPriceUsd: 80,
    tokenPriceCents: 0.1, // $0.001 (stored as 0.1 cents)
    pythRawPrice: 80000000, // $80 with expo -6
    pythExpo: -6,
  });
}

function testScenario(params) {
  const {
    solAmountLamports,
    solPriceUsd,
    tokenPriceCents,
    pythRawPrice,
    pythExpo,
  } = params;

  // Step 1: Parse Pyth price (simulate read_pyth_price)
  console.log(`1. Pyth Raw Price: ${pythRawPrice}, Expo: ${pythExpo}`);

  // Step 2: Scale the price (simulate scale_price)
  const scaledSolUsdPrice = scalePythPrice(pythRawPrice, pythExpo);
  console.log(`2. Scaled SOL/USD Price: $${scaledSolUsdPrice}`);

  // Step 3: Convert lamports to SOL
  const solAmount = solAmountLamports / LAMPORTS_PER_SOL;
  console.log(
    `3. SOL Amount: ${solAmount} SOL (${solAmountLamports} lamports)`
  );

  // Step 4: Convert SOL to USD value
  const usdValue = solAmount * scaledSolUsdPrice;
  console.log(`4. USD Value: $${usdValue.toFixed(6)}`);

  // Step 5: Get token price in USD
  const tokenPriceUsd = tokenPriceCents / 100.0;
  console.log(`5. Token Price: $${tokenPriceUsd} (${tokenPriceCents} cents)`);

  // Step 6: Calculate tokens to mint
  const tokensToMint = Math.floor(usdValue / tokenPriceUsd);
  console.log(`6. Tokens to Mint: ${tokensToMint}`);

  // Step 7: Calculate remaining USD (if any)
  const usedUsd = tokensToMint * tokenPriceUsd;
  const remainingUsd = usdValue - usedUsd;
  console.log(
    `7. Used USD: $${usedUsd.toFixed(6)}, Remaining: $${remainingUsd.toFixed(
      6
    )}`
  );

  // Step 8: Efficiency calculation
  const efficiency = (usedUsd / usdValue) * 100;
  console.log(`8. Purchase Efficiency: ${efficiency.toFixed(2)}%`);

  // Summary
  console.log(`\nSUMMARY:`);
  console.log(`- Buyer pays: ${solAmount} SOL ($${usdValue.toFixed(6)})`);
  console.log(`- Buyer receives: ${tokensToMint} tokens`);
  console.log(`- Cost per token: $${tokenPriceUsd}`);
  console.log(`- Unused value: $${remainingUsd.toFixed(6)}`);
}

// Additional validation functions
function validatePythPriceRange() {
  console.log('\n=== PYTH PRICE VALIDATION ===\n');

  // Test various Pyth price formats
  const testPrices = [
    { raw: 100000000, expo: -6, expected: 100 }, // $100
    { raw: 15050000, expo: -5, expected: 150.5 }, // $150.50
    { raw: 8012, expo: -2, expected: 80.12 }, // $80.12
    { raw: 9999999, expo: -5, expected: 99.99999 }, // $99.99999
  ];

  testPrices.forEach((test, index) => {
    const scaled = scalePythPrice(test.raw, test.expo);
    const passed = Math.abs(scaled - test.expected) < 0.000001;
    console.log(
      `Test ${index + 1}: Raw=${test.raw}, Expo=${
        test.expo
      } -> $${scaled} (Expected: $${test.expected}) ${passed ? '✓' : '✗'}`
    );
  });
}

function validateEdgeCases() {
  console.log('\n=== EDGE CASE VALIDATION ===\n');

  // Test minimum purchase amounts
  console.log('Minimum purchase test (1 lamport):');
  testScenario({
    solAmountLamports: 1, // 1 lamport
    solPriceUsd: 100,
    tokenPriceCents: 1,
    pythRawPrice: 100000000,
    pythExpo: -6,
  });

  console.log('\n' + '-'.repeat(30) + '\n');

  // Test when USD value is less than token price
  console.log('Insufficient funds test:');
  testScenario({
    solAmountLamports: 0.001 * LAMPORTS_PER_SOL, // 0.001 SOL
    solPriceUsd: 100, // $100/SOL -> $0.1 total
    tokenPriceCents: 50, // $0.50 per token (more than available)
    pythRawPrice: 100000000,
    pythExpo: -6,
  });
}

// Run all tests
testTokenSaleCalculations();
validatePythPriceRange();
validateEdgeCases();
