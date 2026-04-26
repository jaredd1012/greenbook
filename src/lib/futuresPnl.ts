/**
 * Unrealized/closed PnL in **account currency** (USD) for index futures when you know
 * dollars per **full index point** per contract (e.g. ES = 50, NQ = 20, MES = 5).
 */
export function futuresPnlFromPrices(
  side: "LONG" | "SHORT",
  openPrice: number,
  closePrice: number,
  qty: number,
  dollarsPerPoint: number,
) {
  const points = side === "LONG" ? closePrice - openPrice : openPrice - closePrice;
  return points * qty * dollarsPerPoint;
}

export const DEFAULT_DOLLARS_PER_POINT = 50;
