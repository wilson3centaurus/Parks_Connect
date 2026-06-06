export function calculateRevenueDiscrepancy(expectedAmount, collectedAmount) {
  const expected = Number(expectedAmount || 0);
  const collected = Number(collectedAmount || 0);

  if (!Number.isFinite(expected) || !Number.isFinite(collected) || expected <= 0) {
    return {
      expected: Math.max(expected, 0),
      collected: Math.max(collected, 0),
      difference: 0,
      discrepancyRatio: 0,
      exceedsThreshold: false
    };
  }

  const difference = collected - expected;
  const discrepancyRatio = Math.abs(difference) / expected;

  return {
    expected,
    collected,
    difference,
    discrepancyRatio,
    exceedsThreshold: discrepancyRatio > 0.05
  };
}
