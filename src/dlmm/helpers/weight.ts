import { BN } from "@coral-xyz/anchor";
import gaussian, { Gaussian } from "gaussian";
import { BASIS_POINT_MAX } from "../constants";
import Decimal from "decimal.js";
import {
  toAmountAskSide,
  toAmountBidSide,
  toAmountBothSide,
} from "./weightToAmounts";
import { Mint } from "@solana/spl-token";
import { BinLiquidityDistribution, Clock } from "../types";

export function getPriceOfBinByBinId(binId: number, binStep: number): Decimal {
  const binStepNum = new Decimal(binStep).div(new Decimal(BASIS_POINT_MAX));
  return new Decimal(1).add(new Decimal(binStepNum)).pow(new Decimal(binId));
}

/// Build a gaussian distribution from the bins, with active bin as the mean.
function buildGaussianFromBins(activeBin: number, binIds: number[]) {
  const smallestBin = Math.min(...binIds);
  const largestBin = Math.max(...binIds);

  // Define the Gaussian distribution. The mean will be active bin when active bin is within the bin ids. Else, use left or right most bin id as the mean.
  let mean = 0;
  const isAroundActiveBin = binIds.find((bid) => bid == activeBin);
  // The liquidity will be distributed surrounding active bin
  if (isAroundActiveBin) {
    mean = activeBin;
  }
  // The liquidity will be distributed to the right side of the active bin.
  else if (activeBin < smallestBin) {
    mean = smallestBin;
  }
  // The liquidity will be distributed to the left side of the active bin.
  else {
    mean = largestBin;
  }

  const TWO_STANDARD_DEVIATION = 4;
  const stdDev = (largestBin - smallestBin) / TWO_STANDARD_DEVIATION;
  const variance = Math.max(stdDev ** 2, 1);

  return gaussian(mean, variance);
}

/// Find the probability of the bin id over the gaussian. The probability ranged from 0 - 1 and will be used as liquidity allocation for that particular bin.
function generateBinLiquidityAllocation(
  gaussian: Gaussian,
  binIds: number[],
  invert: boolean,
) {
  const allocations = binIds.map((bid) =>
    invert ? 1 / gaussian.pdf(bid) : gaussian.pdf(bid),
  );
  const totalAllocations = allocations.reduce((acc, v) => acc + v, 0);
  // Gaussian impossible to cover 100%, normalized it to have total of 100%
  return allocations.map((a) => a / totalAllocations);
}

/// Convert liquidity allocation from 0..1 to 0..10000 bps unit. The sum of allocations must be 1. Return BPS and the loss after conversion.
function computeAllocationBps(allocations: number[]): {
  bpsAllocations: BN[];
  pLoss: BN;
} {
  let totalAllocation = new BN(0);
  const bpsAllocations: BN[] = [];

  for (const allocation of allocations) {
    const allocBps = new BN(allocation * 10000);
    bpsAllocations.push(allocBps);
    totalAllocation = totalAllocation.add(allocBps);
  }

  const pLoss = new BN(10000).sub(totalAllocation);
  return {
    bpsAllocations,
    pLoss,
  };
}
/** private */

export function toWeightDistribution(
  amountX: BN,
  amountY: BN,
  distributions: {
    binId: number;
    xAmountBpsOfTotal: BN;
    yAmountBpsOfTotal: BN;
  }[],
  binStep: number,
): { binId: number; weight: number }[] {
  // get all quote amount
  let totalQuote = new BN(0);
  const precision = 1_000_000_000_000;
  const quoteDistributions = distributions.map((bin) => {
    const price = new BN(
      getPriceOfBinByBinId(bin.binId, binStep)
        .mul(precision)
        .floor()
        .toString(),
    );
    const quoteValue = amountX
      .mul(new BN(bin.xAmountBpsOfTotal))
      .mul(new BN(price))
      .div(new BN(BASIS_POINT_MAX))
      .div(new BN(precision));
    const quoteAmount = quoteValue.add(
      amountY.mul(new BN(bin.yAmountBpsOfTotal)).div(new BN(BASIS_POINT_MAX)),
    );
    totalQuote = totalQuote.add(quoteAmount);
    return {
      binId: bin.binId,
      quoteAmount,
    };
  });

  if (totalQuote.eq(new BN(0))) {
    return [];
  }

  const distributionWeights = quoteDistributions
    .map((bin) => {
      const weight = Math.floor(
        bin.quoteAmount.mul(new BN(65535)).div(totalQuote).toNumber(),
      );
      return {
        binId: bin.binId,
        weight,
      };
    })
    .filter((item) => item.weight > 0);

  return distributionWeights;
}

/**
 * Calculates a spot-concentrated liquidity distribution across bins.
 *
 * **Distribution Shape**: Step-like distribution with active bin receiving reduced weight (0.5x).
 *
 * **Use Case**: Market making around current price with moderate concentration.
 * Best for medium volatility environments where you want liquidity focused near the spot price
 * but still want reasonable coverage on both sides.
 *
 * **Mathematical Model**:
 * - Bins below active bin (bid side): Contains only token Y
 * - Bins above active bin (ask side): Contains only token X
 * - Active bin: Contains both tokens with 50% allocation weight (0.5 capacity vs 1.0 for others)
 * - Distribution formula: `BPS = 10000 / (binCount + 0.5)` where 0.5 represents active bin
 *
 * **Liquidity Profile**:
 * ```
 *   Y-only  │  Both  │  X-only
 *   ████████│██████  │████████
 *   binId<  │   =    │  binId>
 *   active  │ active │ active
 * ```
 *
 * **Risk**: Medium impermanent loss - balanced exposure across range.
 *
 * @param activeBin - The ID of the currently active bin (current price)
 * @param binIds - Array of bin IDs where liquidity will be distributed
 *
 * @returns Array of distribution objects containing:
 * - `binId`: The bin identifier
 * - `distributionX`: Percentage (0-100) of total token X for this bin
 * - `distributionY`: Percentage (0-100) of total token Y for this bin
 */
export function calculateSpotDistribution(
  activeBin: number,
  binIds: number[],
): BinLiquidityDistribution[] {
  // NOTE: OLD IMPLEMENTATION - KEPT FOR FUTURE USE
  // Returns { binId, xAmountBpsOfTotal: BN, yAmountBpsOfTotal: BN } format
  // To restore old format, uncomment below and change return type
  /*
  if (!binIds.includes(activeBin)) {
    const { div: dist, mod: rem } = new BN(10_000).divmod(
      new BN(binIds.length)
    );
    const loss = rem.isZero() ? new BN(0) : new BN(1);

    const distributions =
      binIds[0] < activeBin
        ? binIds.map((binId) => ({
            binId,
            xAmountBpsOfTotal: new BN(0),
            yAmountBpsOfTotal: dist,
          }))
        : binIds.map((binId) => ({
            binId,
            xAmountBpsOfTotal: dist,
            yAmountBpsOfTotal: new BN(0),
          }));

    // Add the loss to the left most bin
    if (binIds[0] < activeBin) {
      distributions[0].yAmountBpsOfTotal.add(loss);
    }
    // Add the loss to the right most bin
    else {
      distributions[binIds.length - 1].xAmountBpsOfTotal.add(loss);
    }

    return distributions;
  }

  const binYCount = binIds.filter((binId) => binId < activeBin).length;
  const binXCount = binIds.filter((binId) => binId > activeBin).length;

  const totalYBinCapacity = binYCount + 0.5;
  const totalXBinCapacity = binXCount + 0.5;

  const yBinBps = new BN(10_000 / totalYBinCapacity);
  const yActiveBinBps = new BN(10_000).sub(yBinBps.mul(new BN(binYCount)));

  const xBinBps = new BN(10_000 / totalXBinCapacity);
  const xActiveBinBps = new BN(10_000).sub(xBinBps.mul(new BN(binXCount)));

  return binIds.map((binId) => {
    const isYBin = binId < activeBin;
    const isXBin = binId > activeBin;
    const isActiveBin = binId === activeBin;

    if (isYBin) {
      return {
        binId,
        xAmountBpsOfTotal: new BN(0),
        yAmountBpsOfTotal: yBinBps,
      };
    }

    if (isXBin) {
      return {
        binId,
        xAmountBpsOfTotal: xBinBps,
        yAmountBpsOfTotal: new BN(0),
      };
    }

    if (isActiveBin) {
      return {
        binId,
        xAmountBpsOfTotal: xActiveBinBps,
        yAmountBpsOfTotal: yActiveBinBps,
      };
    }
  });
  */

  // NEW IMPLEMENTATION - Returns BinLiquidityDistribution format for contract
  // distributionX/Y are percentages (0-100) instead of BPS (0-10000)

  if (!binIds.includes(activeBin)) {
    const { div: dist, mod: rem } = new BN(10_000).divmod(
      new BN(binIds.length),
    );
    const loss = rem.isZero() ? new BN(0) : new BN(1);

    const distributions =
      binIds[0] < activeBin
        ? binIds.map((binId) => ({
            binId,
            distributionX: 0,
            distributionY: Math.floor(dist.toNumber() / 100),
          }))
        : binIds.map((binId) => ({
            binId,
            distributionX: Math.floor(dist.toNumber() / 100),
            distributionY: 0,
          }));

    // Add the loss to the left most bin
    if (binIds[0] < activeBin) {
      distributions[0].distributionY += Math.floor(loss.toNumber() / 100);
    }
    // Add the loss to the right most bin
    else {
      distributions[binIds.length - 1].distributionX += Math.floor(
        loss.toNumber() / 100,
      );
    }

    return distributions;
  }

  const binYCount = binIds.filter((binId) => binId < activeBin).length;
  const binXCount = binIds.filter((binId) => binId > activeBin).length;

  const totalYBinCapacity = binYCount + 0.5;
  const totalXBinCapacity = binXCount + 0.5;

  const yBinBps = new BN(10_000 / totalYBinCapacity);
  const yActiveBinBps = new BN(10_000).sub(yBinBps.mul(new BN(binYCount)));

  const xBinBps = new BN(10_000 / totalXBinCapacity);
  const xActiveBinBps = new BN(10_000).sub(xBinBps.mul(new BN(binXCount)));

  return binIds.map((binId) => {
    const isYBin = binId < activeBin;
    const isXBin = binId > activeBin;
    const isActiveBin = binId === activeBin;

    if (isYBin) {
      return {
        binId,
        distributionX: 0,
        distributionY: Math.floor(yBinBps.toNumber() / 100),
      };
    }

    if (isXBin) {
      return {
        binId,
        distributionX: Math.floor(xBinBps.toNumber() / 100),
        distributionY: 0,
      };
    }

    if (isActiveBin) {
      return {
        binId,
        distributionX: Math.floor(xActiveBinBps.toNumber() / 100),
        distributionY: Math.floor(yActiveBinBps.toNumber() / 100),
      };
    }
  });
}

/**
 * Calculates a bid-ask spread liquidity distribution using inverted Gaussian curve.
 *
 * **Distribution Shape**: U-shaped curve (inverted bell curve) with more liquidity at edges.
 *
 * **Use Case**: Wide range coverage with uniform liquidity provision.
 * Best for high volatility environments or when you want to provide liquidity across
 * a broad price range without over-concentrating in the center. Reduces impermanent loss
 * by spreading liquidity more evenly.
 *
 * **Mathematical Model**:
 * - Uses inverted Gaussian PDF: `allocation[i] = 1 / gaussian.pdf(binId[i])`
 * - Center bins (near active) receive MINIMUM allocation
 * - Edge bins (far from active) receive MAXIMUM allocation
 * - Variance calculated as: `σ² = ((maxBin - minBin) / 4)²`
 * - Each side (X and Y) normalized independently to 10000 BPS
 *
 * **Liquidity Profile**:
 * ```
 *   Y-only  │  Both  │  X-only
 *   ████████│██      │████████  ← More at edges
 *   ████    │████    │████      ← Less in center
 *   binId<  │   =    │  binId>
 *   active  │ active │ active
 * ```
 *
 * **Risk**: Lower impermanent loss - distributed exposure reduces concentration risk.
 *
 * @param activeBin - The ID of the currently active bin (current price)
 * @param binIds - Array of bin IDs where liquidity will be distributed
 *
 * @returns Array of distribution objects containing:
 * - `binId`: The bin identifier
 * - `distributionX`: Percentage (0-100) of total token X for this bin
 * - `distributionY`: Percentage (0-100) of total token Y for this bin
 */
export function calculateBidAskDistribution(
  activeBin: number,
  binIds: number[],
): BinLiquidityDistribution[] {
  // NOTE: OLD IMPLEMENTATION - KEPT FOR FUTURE USE
  // Returns { binId, xAmountBpsOfTotal: BN, yAmountBpsOfTotal: BN } format
  // To restore old format, uncomment below and change return type
  /*
  const smallestBin = Math.min(...binIds);
  const largestBin = Math.max(...binIds);

  const rightOnly = activeBin < smallestBin;
  const leftOnly = activeBin > largestBin;

  const gaussian = buildGaussianFromBins(activeBin, binIds);
  const allocations = generateBinLiquidityAllocation(gaussian, binIds, true);

  // To the right of active bin, liquidity distribution consists of only token X.
  if (rightOnly) {
    const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
    const binDistributions = binIds.map((bid, idx) => ({
      binId: bid,
      xAmountBpsOfTotal: bpsAllocations[idx],
      yAmountBpsOfTotal: new BN(0),
    }));
    const idx = binDistributions.length - 1;
    binDistributions[idx].xAmountBpsOfTotal =
      binDistributions[idx].xAmountBpsOfTotal.add(pLoss);
    return binDistributions;
  }

  // To the left of active bin, liquidity distribution consists of only token Y.
  if (leftOnly) {
    const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
    const binDistributions = binIds.map((bid, idx) => ({
      binId: bid,
      xAmountBpsOfTotal: new BN(0),
      yAmountBpsOfTotal: bpsAllocations[idx],
    }));
    binDistributions[0].yAmountBpsOfTotal =
      binDistributions[0].yAmountBpsOfTotal.add(pLoss);
    return binDistributions;
  }

  // Find total X, and Y bps allocations for normalization.
  const [totalXAllocation, totalYAllocation] = allocations.reduce(
    ([xAcc, yAcc], allocation, idx) => {
      const binId = binIds[idx];
      if (binId > activeBin) {
        return [xAcc + allocation, yAcc];
      } else if (binId < activeBin) {
        return [xAcc, yAcc + allocation];
      } else {
        const half = allocation / 2;
        return [xAcc + half, yAcc + half];
      }
    },
    [0, 0]
  );

  // Normalize and convert to BPS
  const [normXAllocations, normYAllocations] = allocations.reduce<[BN[], BN[]]>(
    ([xAllocations, yAllocations], allocation, idx) => {
      const binId = binIds[idx];
      if (binId > activeBin) {
        const distX = new BN((allocation * 10000) / totalXAllocation);
        xAllocations.push(distX);
      }
      if (binId < activeBin) {
        const distY = new BN((allocation * 10000) / totalYAllocation);
        yAllocations.push(distY);
      }
      if (binId == activeBin) {
        const half = allocation / 2;
        const distX = new BN((half * 10000) / totalXAllocation);
        const distY = new BN((half * 10000) / totalYAllocation);
        xAllocations.push(distX);
        yAllocations.push(distY);
      }
      return [xAllocations, yAllocations];
    },
    [[], []]
  );

  const totalXNormAllocations = normXAllocations.reduce(
    (acc, v) => acc.add(v),
    new BN(0)
  );
  const totalYNormAllocations = normYAllocations.reduce(
    (acc, v) => acc.add(v),
    new BN(0)
  );

  const xPLoss = new BN(10000).sub(totalXNormAllocations);
  const yPLoss = new BN(10000).sub(totalYNormAllocations);

  const distributions = binIds.map((binId) => {
    if (binId === activeBin) {
      return {
        binId,
        xAmountBpsOfTotal: normXAllocations.shift(),
        yAmountBpsOfTotal: normYAllocations.shift(),
      };
    }

    if (binId > activeBin) {
      return {
        binId,
        xAmountBpsOfTotal: normXAllocations.shift(),
        yAmountBpsOfTotal: new BN(0),
      };
    }

    if (binId < activeBin) {
      return {
        binId,
        xAmountBpsOfTotal: new BN(0),
        yAmountBpsOfTotal: normYAllocations.shift(),
      };
    }
  });

  if (!yPLoss.isZero()) {
    distributions[0].yAmountBpsOfTotal =
      distributions[0].yAmountBpsOfTotal.add(yPLoss);
  }

  if (!xPLoss.isZero()) {
    const last = distributions.length - 1;
    distributions[last].xAmountBpsOfTotal =
      distributions[last].xAmountBpsOfTotal.add(xPLoss);
  }

  return distributions;
  */

  // NEW IMPLEMENTATION - Returns BinLiquidityDistribution format for contract
  // distributionX/Y are percentages (0-100) instead of BPS (0-10000)

  const smallestBin = Math.min(...binIds);
  const largestBin = Math.max(...binIds);

  const rightOnly = activeBin < smallestBin;
  const leftOnly = activeBin > largestBin;

  const gaussian = buildGaussianFromBins(activeBin, binIds);
  const allocations = generateBinLiquidityAllocation(gaussian, binIds, true);

  // To the right of active bin, liquidity distribution consists of only token X.
  if (rightOnly) {
    const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
    const binDistributions = binIds.map((bid, idx) => ({
      binId: bid,
      distributionX: Math.floor(bpsAllocations[idx].toNumber() / 100),
      distributionY: 0,
    }));
    const idx = binDistributions.length - 1;
    binDistributions[idx].distributionX += Math.floor(pLoss.toNumber() / 100);
    return binDistributions;
  }

  // To the left of active bin, liquidity distribution consists of only token Y.
  if (leftOnly) {
    const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
    const binDistributions = binIds.map((bid, idx) => ({
      binId: bid,
      distributionX: 0,
      distributionY: Math.floor(bpsAllocations[idx].toNumber() / 100),
    }));
    binDistributions[0].distributionY += Math.floor(pLoss.toNumber() / 100);
    return binDistributions;
  }

  // Find total X, and Y bps allocations for normalization.
  const [totalXAllocation, totalYAllocation] = allocations.reduce(
    ([xAcc, yAcc], allocation, idx) => {
      const binId = binIds[idx];
      if (binId > activeBin) {
        return [xAcc + allocation, yAcc];
      } else if (binId < activeBin) {
        return [xAcc, yAcc + allocation];
      } else {
        const half = allocation / 2;
        return [xAcc + half, yAcc + half];
      }
    },
    [0, 0],
  );

  // Normalize and convert to percentage (0-100)
  const [normXAllocations, normYAllocations] = allocations.reduce<
    [number[], number[]]
  >(
    ([xAllocations, yAllocations], allocation, idx) => {
      const binId = binIds[idx];
      if (binId > activeBin) {
        const distX = Math.floor((allocation * 100) / totalXAllocation);
        xAllocations.push(distX);
      }
      if (binId < activeBin) {
        const distY = Math.floor((allocation * 100) / totalYAllocation);
        yAllocations.push(distY);
      }
      if (binId == activeBin) {
        const half = allocation / 2;
        const distX = Math.floor((half * 100) / totalXAllocation);
        const distY = Math.floor((half * 100) / totalYAllocation);
        xAllocations.push(distX);
        yAllocations.push(distY);
      }
      return [xAllocations, yAllocations];
    },
    [[], []],
  );

  const totalXNormAllocations = normXAllocations.reduce((acc, v) => acc + v, 0);
  const totalYNormAllocations = normYAllocations.reduce((acc, v) => acc + v, 0);

  const xPLoss = 100 - totalXNormAllocations;
  const yPLoss = 100 - totalYNormAllocations;

  const distributions = binIds.map((binId) => {
    if (binId === activeBin) {
      return {
        binId,
        distributionX: normXAllocations.shift(),
        distributionY: normYAllocations.shift(),
      };
    }

    if (binId > activeBin) {
      return {
        binId,
        distributionX: normXAllocations.shift(),
        distributionY: 0,
      };
    }

    if (binId < activeBin) {
      return {
        binId,
        distributionX: 0,
        distributionY: normYAllocations.shift(),
      };
    }
  });

  if (yPLoss !== 0) {
    distributions[0].distributionY += yPLoss;
  }

  if (xPLoss !== 0) {
    const last = distributions.length - 1;
    distributions[last].distributionX += xPLoss;
  }

  return distributions;
}

/**
 * Calculates a normal (Gaussian) liquidity distribution concentrated at center.
 *
 * **Distribution Shape**: Bell curve with maximum liquidity at active bin.
 *
 * **Use Case**: Tight liquidity provision around current price.
 * Best for low volatility environments or stable pairs where price is expected to stay
 * within a narrow range. Maximizes capital efficiency and fee capture at spot price,
 * but carries higher impermanent loss risk if price moves significantly.
 *
 * **Mathematical Model**:
 * - Uses Gaussian PDF directly: `allocation[i] = gaussian.pdf(binId[i])`
 * - Center bin (active) receives MAXIMUM allocation (all remaining BPS)
 * - Edge bins receive MINIMUM allocation
 * - Variance calculated as: `σ² = ((maxBin - minBin) / 4)²`
 * - Active bin gets remainder: `activeBPS = 10000 - sum(sideBins)`
 *
 * **Liquidity Profile**:
 * ```
 *   Y-only  │  Both  │  X-only
 *   ██      │████████│██        ← Peak at center
 *   ████    │████████│████      ← Decreases to edges
 *   binId<  │   =    │  binId>
 *   active  │ active │ active
 * ```
 *
 * **Risk**: Higher impermanent loss - concentrated position amplifies price movement impact.
 *
 * @param activeBin - The ID of the currently active bin (current price)
 * @param binIds - Array of bin IDs where liquidity will be distributed
 *
 * @returns Array of distribution objects containing:
 * - `binId`: The bin identifier
 * - `distributionX`: Percentage (0-100) of total token X for this bin
 * - `distributionY`: Percentage (0-100) of total token Y for this bin
 */
export function calculateNormalDistribution(
  activeBin: number,
  binIds: number[],
): BinLiquidityDistribution[] {
  // NOTE: OLD IMPLEMENTATION - KEPT FOR FUTURE USE
  // Returns { binId, xAmountBpsOfTotal: BN, yAmountBpsOfTotal: BN } format
  // To restore old format, uncomment below and change return type
  /*
  const smallestBin = Math.min(...binIds);
  const largestBin = Math.max(...binIds);

  const rightOnly = activeBin < smallestBin;
  const leftOnly = activeBin > largestBin;

  const gaussian = buildGaussianFromBins(activeBin, binIds);
  const allocations = generateBinLiquidityAllocation(gaussian, binIds, false);

  // To the right of active bin, liquidity distribution consists of only token X.
  if (rightOnly) {
    const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
    const binDistributions = binIds.map((bid, idx) => ({
      binId: bid,
      xAmountBpsOfTotal: bpsAllocations[idx],
      yAmountBpsOfTotal: new BN(0),
    }));
    // When contains only X token, bin closest to active bin will be index 0.
    // Add back the precision loss
    binDistributions[0].xAmountBpsOfTotal =
      binDistributions[0].xAmountBpsOfTotal.add(pLoss);
    return binDistributions;
  }

  // To the left of active bin, liquidity distribution consists of only token Y.
  if (leftOnly) {
    const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
    const binDistributions = binIds.map((bid, idx) => ({
      binId: bid,
      xAmountBpsOfTotal: new BN(0),
      yAmountBpsOfTotal: bpsAllocations[idx],
    }));
    // When contains only Y token, bin closest to active bin will be last index.
    // Add back the precision loss
    const idx = binDistributions.length - 1;
    binDistributions[idx].yAmountBpsOfTotal =
      binDistributions[idx].yAmountBpsOfTotal.add(pLoss);
    return binDistributions;
  }

  // The liquidity distribution consists of token X and Y. Allocations from gaussian only says how much liquidity percentage per bin over the full bin range.
  // Normalize liquidity allocation percentage into X - 100%, Y - 100%.

  // Find total X, and Y bps allocations for normalization.
  const [totalXAllocation, totalYAllocation] = allocations.reduce(
    ([xAcc, yAcc], allocation, idx) => {
      const binId = binIds[idx];
      if (binId > activeBin) {
        return [xAcc + allocation, yAcc];
      } else if (binId < activeBin) {
        return [xAcc, yAcc + allocation];
      } else {
        const half = allocation / 2;
        return [xAcc + half, yAcc + half];
      }
    },
    [0, 0]
  );

  // Normalize and convert to BPS
  const [normXAllocations, normYAllocations] = allocations.reduce(
    ([xAllocations, yAllocations], allocation, idx) => {
      const binId = binIds[idx];
      if (binId > activeBin) {
        const distX = new BN((allocation * 10000) / totalXAllocation);
        xAllocations.push(distX);
      }
      if (binId < activeBin) {
        const distY = new BN((allocation * 10000) / totalYAllocation);
        yAllocations.push(distY);
      }
      return [xAllocations, yAllocations];
    },
    [[], []]
  );

  const normXActiveBinAllocation = normXAllocations.reduce(
    (maxBps, bps) => maxBps.sub(bps),
    new BN(10_000)
  );
  const normYActiveBinAllocation = normYAllocations.reduce(
    (maxBps, bps) => maxBps.sub(bps),
    new BN(10_000)
  );

  return binIds.map((binId) => {
    if (binId === activeBin) {
      return {
        binId,
        xAmountBpsOfTotal: normXActiveBinAllocation,
        yAmountBpsOfTotal: normYActiveBinAllocation,
      };
    }

    if (binId > activeBin) {
      return {
        binId,
        xAmountBpsOfTotal: normXAllocations.shift(),
        yAmountBpsOfTotal: new BN(0),
      };
    }

    if (binId < activeBin) {
      return {
        binId,
        xAmountBpsOfTotal: new BN(0),
        yAmountBpsOfTotal: normYAllocations.shift(),
      };
    }
  });
  */

  // NEW IMPLEMENTATION - Returns BinLiquidityDistribution format for contract
  // distributionX/Y are percentages (0-100) instead of BPS (0-10000)

  const smallestBin = Math.min(...binIds);
  const largestBin = Math.max(...binIds);

  const rightOnly = activeBin < smallestBin;
  const leftOnly = activeBin > largestBin;

  const gaussian = buildGaussianFromBins(activeBin, binIds);
  const allocations = generateBinLiquidityAllocation(gaussian, binIds, false);

  // To the right of active bin, liquidity distribution consists of only token X.
  if (rightOnly) {
    const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
    const binDistributions = binIds.map((bid, idx) => ({
      binId: bid,
      distributionX: Math.floor(bpsAllocations[idx].toNumber() / 100),
      distributionY: 0,
    }));
    // When contains only X token, bin closest to active bin will be index 0.
    // Add back the precision loss
    binDistributions[0].distributionX += Math.floor(pLoss.toNumber() / 100);
    return binDistributions;
  }

  // To the left of active bin, liquidity distribution consists of only token Y.
  if (leftOnly) {
    const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
    const binDistributions = binIds.map((bid, idx) => ({
      binId: bid,
      distributionX: 0,
      distributionY: Math.floor(bpsAllocations[idx].toNumber() / 100),
    }));
    // When contains only Y token, bin closest to active bin will be last index.
    // Add back the precision loss
    const idx = binDistributions.length - 1;
    binDistributions[idx].distributionY += Math.floor(pLoss.toNumber() / 100);
    return binDistributions;
  }

  // The liquidity distribution consists of token X and Y. Allocations from gaussian only says how much liquidity percentage per bin over the full bin range.
  // Normalize liquidity allocation percentage into X - 100%, Y - 100%.

  // Find total X, and Y allocations for normalization.
  const [totalXAllocation, totalYAllocation] = allocations.reduce(
    ([xAcc, yAcc], allocation, idx) => {
      const binId = binIds[idx];
      if (binId > activeBin) {
        return [xAcc + allocation, yAcc];
      } else if (binId < activeBin) {
        return [xAcc, yAcc + allocation];
      } else {
        const half = allocation / 2;
        return [xAcc + half, yAcc + half];
      }
    },
    [0, 0],
  );

  // Normalize and convert to percentage (0-100)
  const [normXAllocations, normYAllocations] = allocations.reduce<
    [number[], number[]]
  >(
    ([xAllocations, yAllocations], allocation, idx) => {
      const binId = binIds[idx];
      if (binId > activeBin) {
        const distX = Math.floor((allocation * 100) / totalXAllocation);
        xAllocations.push(distX);
      }
      if (binId < activeBin) {
        const distY = Math.floor((allocation * 100) / totalYAllocation);
        yAllocations.push(distY);
      }
      return [xAllocations, yAllocations];
    },
    [[], []],
  );

  const normXActiveBinAllocation = normXAllocations.reduce(
    (maxPercent, percent) => maxPercent - percent,
    100,
  );
  const normYActiveBinAllocation = normYAllocations.reduce(
    (maxPercent, percent) => maxPercent - percent,
    100,
  );

  return binIds.map((binId) => {
    if (binId === activeBin) {
      return {
        binId,
        distributionX: normXActiveBinAllocation,
        distributionY: normYActiveBinAllocation,
      };
    }

    if (binId > activeBin) {
      return {
        binId,
        distributionX: normXAllocations.shift(),
        distributionY: 0,
      };
    }

    if (binId < activeBin) {
      return {
        binId,
        distributionX: 0,
        distributionY: normYAllocations.shift(),
      };
    }
  });
}

/**
 * Converts a weight distribution into token amounts for one side (either bid or ask).
 *
 * @param amount - The total amount of liquidity to distribute.
 * @param distributions - The array of weight distributions for each bin.
 * @param binStep - The step interval between bin ids.
 * @param activeId - The id of the active bin.
 * @param depositForY - Flag indicating if the deposit is for token Y (bid side).
 * @param mint - Mint information for the token. Mint Y if depositForY is true, else Mint X. Get from DLMM instance.
 * @param clock - Clock instance for the current epoch. Get from DLMM instance.
 * @returns An array of objects containing binId and amount for each bin.
 */

export function fromWeightDistributionToAmountOneSide(
  amount: BN,
  distributions: { binId: number; weight: number }[],
  binStep: number,
  activeId: number,
  depositForY: boolean,
  mint: Mint,
  clock: Clock,
): { binId: number; amount: BN }[] {
  if (depositForY) {
    return toAmountBidSide(activeId, amount, distributions, mint, clock);
  } else {
    return toAmountAskSide(
      activeId,
      binStep,
      amount,
      distributions,
      mint,
      clock,
    );
  }
}

/**
 * Converts a weight distribution into token amounts for both bid and ask sides.
 *
 * @param amountX - The total amount of token X to distribute.
 * @param amountY - The total amount of token Y to distribute.
 * @param distributions - The array of weight distributions for each bin.
 * @param binStep - The step interval between bin ids.
 * @param activeId - The id of the active bin.
 * @param amountXInActiveBin - The amount of token X in the active bin.
 * @param amountYInActiveBin - The amount of token Y in the active bin.
 * @param mintX - Mint information for token X. Get from DLMM instance.
 * @param mintY - Mint information for token Y. Get from DLMM instance.
 * @param clock - Clock instance for the current epoch. Get from DLMM instance.
 * @returns An array of objects containing binId, amountX, and amountY for each bin.
 */
export function fromWeightDistributionToAmount(
  amountX: BN,
  amountY: BN,
  distributions: { binId: number; weight: number }[],
  binStep: number,
  activeId: number,
  amountXInActiveBin: BN,
  amountYInActiveBin: BN,
  mintX: Mint,
  mintY: Mint,
  clock: Clock,
): { binId: number; amountX: BN; amountY: BN }[] {
  // sort distribution
  var distributions = distributions.sort((n1, n2) => {
    return n1.binId - n2.binId;
  });

  if (distributions.length == 0) {
    return [];
  }

  // only bid side
  if (activeId > distributions[distributions.length - 1].binId) {
    let amounts = toAmountBidSide(
      activeId,
      amountY,
      distributions,
      mintY,
      clock,
    );
    return amounts.map((bin) => {
      return {
        binId: bin.binId,
        amountX: new BN(0),
        amountY: new BN(bin.amount.toString()),
      };
    });
  }

  // only ask side
  if (activeId < distributions[0].binId) {
    let amounts = toAmountAskSide(
      activeId,
      binStep,
      amountX,
      distributions,
      mintX,
      clock,
    );
    return amounts.map((bin) => {
      return {
        binId: bin.binId,
        amountX: new BN(bin.amount.toString()),
        amountY: new BN(0),
      };
    });
  }
  return toAmountBothSide(
    activeId,
    binStep,
    amountX,
    amountY,
    amountXInActiveBin,
    amountYInActiveBin,
    distributions,
    mintX,
    mintY,
    clock,
  );
}
