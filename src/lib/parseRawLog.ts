import { z } from "zod";

const SideSchema = z.enum(["LONG", "SHORT"]);

export type ParsedTrade = z.infer<typeof ParsedTradeSchema>;

export const ParsedTradeSchema = z.object({
  closePrice: z.number(),
  closedAt: z.date(),
  durationSeconds: z.number().int().nonnegative(),
  openPrice: z.number(),
  openedAt: z.date(),
  pnl: z.number(),
  qty: z.number().int().positive(),
  side: SideSchema,
  symbol: z.string().min(1),
});

export type ParseIssue = {
  blockIndex: number;
  message: string;
  rawBlock: string;
};

export type ParseResult = {
  issues: ParseIssue[];
  trades: ParsedTrade[];
};

const MonthSchema = z.enum([
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]);

function monthToIndex(month: z.infer<typeof MonthSchema>) {
  const monthToIndexMap: Record<z.infer<typeof MonthSchema>, number> = {
    Apr: 3,
    Aug: 7,
    Dec: 11,
    Feb: 1,
    Jan: 0,
    Jul: 6,
    Jun: 5,
    Mar: 2,
    May: 4,
    Nov: 10,
    Oct: 9,
    Sep: 8,
  };

  return monthToIndexMap[month];
}

function parseMoney(value: string) {
  const normalized = value.replaceAll(",", "").trim();
  if (!normalized) return null;

  // Supports: 27019.75, $27019.75, +$51.50, -$0.50, $-0.50
  const cleaned = normalized.startsWith("$") ? normalized.slice(1) : normalized;
  const match = cleaned.match(/^([+-])?(\d+(\.\d+)?)$/);
  if (match) {
    const sign = match[1] === "-" ? -1 : 1;
    const amount = Number(match[2]);
    if (!Number.isFinite(amount)) return null;
    return sign * amount;
  }

  const matchAlt = normalized.match(/^([+-])?\$?(\d+(\.\d+)?)$/);
  if (!matchAlt) return null;

  const sign = matchAlt[1] === "-" ? -1 : 1;
  const amount = Number(matchAlt[2]);
  if (!Number.isFinite(amount)) return null;

  return sign * amount;
}

function parseDurationSeconds(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Supports: HH:MM:SS or MM:SS
  const clockMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clockMatch) {
    const a = Number(clockMatch[1]);
    const b = Number(clockMatch[2]);
    const c = clockMatch[3] !== undefined ? Number(clockMatch[3]) : null;

    if (![a, b, c ?? 0].every((n) => Number.isInteger(n) && n >= 0)) return null;
    if (b > 59) return null;
    if (c !== null && c > 59) return null;

    const seconds = c === null ? a * 60 + b : a * 3600 + b * 60 + c;
    return seconds;
  }

  let totalSeconds = 0;

  const minutesMatch = trimmed.match(/(\d+)\s*m\b/i);
  if (minutesMatch) totalSeconds += Number(minutesMatch[1]) * 60;

  const secondsMatch = trimmed.match(/(\d+)\s*sec\b/i);
  if (secondsMatch) totalSeconds += Number(secondsMatch[1]);

  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return null;
  if (totalSeconds === 0 && !secondsMatch && !minutesMatch) return null;

  return totalSeconds;
}

function parseDateTimeNoYear(value: string, year: number) {
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i,
  );
  if (!match) return null;

  const month = MonthSchema.safeParse(match[1][0].toUpperCase() + match[1].slice(1).toLowerCase());
  if (!month.success) return null;

  const day = Number(match[2]);
  const hour12 = Number(match[3]);
  const minute = Number(match[4]);
  const second = Number(match[5]);
  const ampm = match[6].toUpperCase();

  if (day < 1 || day > 31) return null;
  if (hour12 < 1 || hour12 > 12) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  let hour24 = hour12 % 12;
  if (ampm === "PM") hour24 += 12;

  return new Date(year, monthToIndex(month.data), day, hour24, minute, second);
}

function parseDateTimeWithYear(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(\d{4})\s+@\s+(\d{1,2}):(\d{2}):(\d{2})\s+(am|pm)$/i,
  );
  if (!match) return null;

  const monthName = match[1].toLowerCase();
  const monthIndexMap: Record<string, number> = {
    april: 3,
    august: 7,
    december: 11,
    february: 1,
    january: 0,
    july: 6,
    june: 5,
    march: 2,
    may: 4,
    november: 10,
    october: 9,
    september: 8,
  };

  const monthIndex = monthIndexMap[monthName];
  if (monthIndex === undefined) return null;

  const day = Number(match[2]);
  const year = Number(match[3]);
  const hour12 = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const ampm = match[7].toUpperCase();

  if (day < 1 || day > 31) return null;
  if (!Number.isInteger(year) || year < 1970 || year > 2100) return null;
  if (hour12 < 1 || hour12 > 12) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  let hour24 = hour12 % 12;
  if (ampm === "PM") hour24 += 12;

  return new Date(year, monthIndex, day, hour24, minute, second);
}

function looksLikeSymbol(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[A-Z]{1,8}[A-Z0-9]{0,4}$/.test(trimmed);
}

function normalizeSymbol(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) return trimmed.slice(1);
  return trimmed;
}

function parseSideWord(value: string) {
  const trimmed = value.trim().toUpperCase();
  if (trimmed === "LONG") return "LONG" as const;
  if (trimmed === "SHORT") return "SHORT" as const;
  return null;
}

function parseTradeTokensExportStyle(tokens: string[]) {
  // Example:
  // tradeId, /MNQ, 1, April 23 2026 @ 7:05:36 am, April 23 2026 @ 7:07:08 am,
  // 00:01:31, 27,019.75, 26,994.00, $51.50, $-0.50, $-0.74, Short
  if (tokens.length < 11) return null;

  if (!/^\d{6,}$/.test(tokens[0])) return null;

  const symbolRaw = tokens[1];
  const symbol = normalizeSymbol(symbolRaw);
  if (!looksLikeSymbol(symbol)) return null;

  const qty = Number(tokens[2]);
  if (!Number.isInteger(qty) || qty <= 0) return null;

  const openedAt = parseDateTimeWithYear(tokens[3]);
  const closedAt = parseDateTimeWithYear(tokens[4]);
  const durationSeconds = parseDurationSeconds(tokens[5]);
  const openPrice = parseMoney(tokens[6]);
  const closePrice = parseMoney(tokens[7]);

  if (!openedAt || !closedAt) return null;
  if (durationSeconds === null) return null;
  if (openPrice === null || closePrice === null) return null;

  const moneyParts: number[] = [];
  let side: "LONG" | "SHORT" | null = null;

  for (let idx = 8; idx < tokens.length; idx += 1) {
    const maybeSide = parseSideWord(tokens[idx]);
    if (maybeSide) {
      side = maybeSide;
      break;
    }

    const m = parseMoney(tokens[idx]);
    if (m === null) return null;
    moneyParts.push(m);
  }

  if (!side) return null;
  if (moneyParts.length < 1) return null;

  const pnl = moneyParts.reduce((sum, n) => sum + n, 0);

  const parsed = ParsedTradeSchema.safeParse({
    closePrice,
    closedAt,
    durationSeconds,
    openPrice,
    openedAt,
    pnl,
    qty,
    side,
    symbol,
  });

  if (!parsed.success) return null;
  return parsed.data;
}

function parseTradeTokensSymbolFirst(tokens: string[], year: number) {
  if (tokens.length < 9) return null;

  const symbol = tokens[0];
  if (!looksLikeSymbol(symbol)) return null;

  const qty = Number(tokens[1]);
  if (!Number.isInteger(qty) || qty <= 0) return null;

  const openedAt = parseDateTimeNoYear(tokens[2], year);
  const openPrice = parseMoney(tokens[3]);
  const side = SideSchema.safeParse(tokens[4]);
  const durationSeconds = parseDurationSeconds(tokens[5]);
  const closedAt = parseDateTimeNoYear(tokens[6], year);
  const closePrice = parseMoney(tokens[7]);
  const pnl = parseMoney(tokens[8]);

  if (!openedAt || !closedAt) return null;
  if (openPrice === null || closePrice === null || pnl === null) return null;
  if (!side.success) return null;
  if (durationSeconds === null) return null;

  const parsed = ParsedTradeSchema.safeParse({
    closePrice,
    closedAt,
    durationSeconds,
    openPrice,
    openedAt,
    pnl,
    qty,
    side: side.data,
    symbol,
  });

  if (!parsed.success) return null;

  return parsed.data;
}

function parseTradeTokensSymbolLast(tokens: string[], year: number) {
  if (tokens.length < 9) return null;

  const symbol = tokens[8];
  if (!looksLikeSymbol(symbol)) return null;

  const qty = Number(tokens[0]);
  if (!Number.isInteger(qty) || qty <= 0) return null;

  const openedAt = parseDateTimeNoYear(tokens[1], year);
  const openPrice = parseMoney(tokens[2]);
  const side = SideSchema.safeParse(tokens[3]);
  const durationSeconds = parseDurationSeconds(tokens[4]);
  const closedAt = parseDateTimeNoYear(tokens[5], year);
  const closePrice = parseMoney(tokens[6]);
  const pnl = parseMoney(tokens[7]);

  if (!openedAt || !closedAt) return null;
  if (openPrice === null || closePrice === null || pnl === null) return null;
  if (!side.success) return null;
  if (durationSeconds === null) return null;

  const parsed = ParsedTradeSchema.safeParse({
    closePrice,
    closedAt,
    durationSeconds,
    openPrice,
    openedAt,
    pnl,
    qty,
    side: side.data,
    symbol,
  });

  if (!parsed.success) return null;

  return parsed.data;
}

export function parseRawLog(rawText: string, now = new Date()): ParseResult {
  const normalized = rawText.replaceAll("\r\n", "\n").trim();
  if (!normalized) return { issues: [], trades: [] };

  const year = now.getFullYear();
  const tokens = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const trades: ParsedTrade[] = [];
  const issues: ParseIssue[] = [];

  let i = 0;
  let recordIndex = 0;

  while (i < tokens.length) {
    const t = tokens[i];
    const next = tokens[i + 1];

    // Format C (export-style with year and trade id):
    // tradeId, /SYMBOL, qty, openedAt, closedAt, HH:MM:SS, openPrice, closePrice, $..., $..., ..., Long/Short
    if (/^\d{6,}$/.test(t) && typeof next === "string" && next.startsWith("/")) {
      // Find side token within the next ~20 tokens to bound the slice.
      const maxLookahead = Math.min(tokens.length, i + 24);
      let endExclusive = -1;
      for (let j = i + 8; j < maxLookahead; j += 1) {
        if (parseSideWord(tokens[j])) {
          endExclusive = j + 1;
          break;
        }
      }

      if (endExclusive !== -1) {
        const slice = tokens.slice(i, endExclusive);
        const parsed = parseTradeTokensExportStyle(slice);
        if (parsed) {
          trades.push(parsed);
          i = endExclusive;
          recordIndex += 1;
          continue;
        }
      }
    }

    // Format A (symbol-first):
    // SYMBOL, qty, openedAt, openPrice, side, duration, closedAt, closePrice, pnl
    if (looksLikeSymbol(t) && next !== undefined) {
      const qtyCandidate = Number(next);
      if (Number.isInteger(qtyCandidate) && qtyCandidate > 0) {
        const slice = tokens.slice(i, i + 9);
        const parsed = parseTradeTokensSymbolFirst(slice, year);
        if (parsed) {
          trades.push(parsed);
          i += 9;
          recordIndex += 1;
          continue;
        }
      }
    }

    // Format B (symbol-last):
    // qty, openedAt, openPrice, side, duration, closedAt, closePrice, pnl, SYMBOL
    const qtyCandidate = Number(t);
    if (Number.isInteger(qtyCandidate) && qtyCandidate > 0) {
      const slice = tokens.slice(i, i + 9);
      const parsed = parseTradeTokensSymbolLast(slice, year);
      if (parsed) {
        trades.push(parsed);
        i += 9;
        recordIndex += 1;
        continue;
      }
    }

    issues.push({
      blockIndex: recordIndex,
      message:
        "Could not parse record. Expected either: SYMBOL, qty, open datetime, open price, LONG/SHORT, duration, close datetime, close price, pnl; or qty..pnl..SYMBOL.",
      rawBlock: t,
    });
    i += 1;
  }

  return { issues, trades };
}

