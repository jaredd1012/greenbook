"use client";

import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Modal,
  Progress,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DEFAULT_DOLLARS_PER_POINT, futuresPnlFromPrices } from "@/lib/futuresPnl";

const MORTGAGE_ACCOUNT = "Mortgage";

function localYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type AccountDto = {
  createdAt: string;
  id: number;
  name: string;
};

type IngestResult = {
  account: string;
  createdAt: string;
  duplicate: boolean;
  rawLogId: number;
  tradeInsertedCount: number;
  tradeRequestedCount: number;
  tradeSkippedCount: number;
};

type OptionsTradeDto = {
  account: string;
  avgBuyPrice: number | null;
  avgSellPrice: number | null;
  boughtCount: number | null;
  contract: string;
  contractsYesNo: string | null;
  createdAt: string;
  exitTradeDate: string | null;
  id: number;
  tradeDate: string;
  tradingGrade: string | null;
};

function optionsPnl(t: OptionsTradeDto) {
  if (t.avgBuyPrice === null || t.avgSellPrice === null || t.boughtCount === null) {
    return null;
  }
  return (t.avgSellPrice - t.avgBuyPrice) * 100.0 * t.boughtCount;
}

type TradeDto = {
  account: string;
  closePrice: number;
  closedAt: string;
  durationSeconds: number;
  id: number;
  openPrice: number;
  openedAt: string;
  pnl: number;
  qty: number;
  rawLogId: number;
  side: string;
  symbol: string;
};

type MortgageStatsDto = {
  goalMonthly: number;
  monthKey: string;
  pnlMonthly: number;
  pnlToday?: number;
  pnlWeek?: number;
  ranges?: {
    monthStartYmd: string;
    todayYmd: string;
    weekStartYmd: string;
  };
};

async function fetchAccounts() {
  const res = await fetch("/api/accounts", { method: "GET" });
  if (!res.ok) throw new Error("Failed to fetch accounts");
  return (await res.json()) as { accounts: AccountDto[] };
}

async function fetchMortgageStats() {
  const res = await fetch("/api/options-trades/stats", { method: "GET" });
  if (!res.ok) throw new Error("Failed to fetch mortgage stats");
  return (await res.json()) as MortgageStatsDto;
}

async function fetchOptionsTrades() {
  const res = await fetch(`/api/options-trades?account=${encodeURIComponent(MORTGAGE_ACCOUNT)}`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to fetch options trades");
  return (await res.json()) as { account: string; trades: OptionsTradeDto[] };
}

async function fetchTrades(rawLogId: number) {
  const res = await fetch(`/api/trades?rawLogId=${encodeURIComponent(String(rawLogId))}`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to fetch trades");
  return (await res.json()) as { trades: TradeDto[] };
}

async function postManualTrade(input: {
  account: string;
  closePrice: number;
  closedAt: string;
  dollarsPerPoint: number;
  openPrice: number;
  openedAt: string;
  qty: number;
  side: "LONG" | "SHORT";
  symbol: string;
}) {
  const res = await fetch("/api/trades", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as null | { error?: string };
    throw new Error(data?.error ?? "Failed to add trade");
  }
  return (await res.json()) as { ok: true; rawLogId: number; tradeId: number };
}

async function postAccount(name: string) {
  const res = await fetch("/api/accounts", {
    body: JSON.stringify({ name }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as null | { error?: string };
    throw new Error(data?.error ?? "Failed to create account");
  }
  return (await res.json()) as { accountId?: number; created: boolean; name: string };
}

async function patchOptionsTrade(
  id: number,
  input: { avgSellPrice: number; exitTradeDate: string; tradingGrade?: null | string },
) {
  const res = await fetch(`/api/options-trades/${id}`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as null | { error?: string };
    throw new Error(data?.error ?? "Failed to update options trade");
  }
  return (await res.json()) as { ok: true };
}

async function postOptionsTrade(input: {
  account: string;
  avgBuyPrice: number;
  avgSellPrice: number | null;
  boughtCount: number;
  contract: string;
  contractsYesNo: string | null;
  exitTradeDate: null | string;
  tradeDate: string;
  tradingGrade: string | null;
}) {
  const res = await fetch("/api/options-trades", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as null | { error?: string };
    throw new Error(data?.error ?? "Failed to create options trade");
  }
  return (await res.json()) as { id: number; ok: true };
}

async function postRawLog(account: string, rawText: string) {
  const res = await fetch("/api/raw-logs", {
    body: JSON.stringify({ account, rawText }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as null | { error?: string };
    throw new Error(data?.error ?? "Failed to ingest raw log");
  }

  return (await res.json()) as {
    account: string;
    duplicate: boolean;
    issues: unknown[];
    rawLogId: number;
    tradeInsertedCount: number;
    tradeRequestedCount: number;
    tradeSkippedCount: number;
  };
}

function formatMoneyOrDash(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  });
}

export default function InputClient({ urlAccount: urlAccountFromServer = "" }: { urlAccount?: string }) {
  const queryClient = useQueryClient();

  const [account, setAccount] = useState("");
  const [newAccountName, setNewAccountName] = useState("");

  const [avgBuyPrice, setAvgBuyPrice] = useState("");
  const [boughtCount, setBoughtCount] = useState("");
  const [closeAvgSell, setCloseAvgSell] = useState("");
  const [closeExitDate, setCloseExitDate] = useState(() => localYmd());
  const [closeGrade, setCloseGrade] = useState("");
  const [closeRowId, setCloseRowId] = useState<null | number>(null);
  const [contract, setContract] = useState("");
  const [contractsYesNo, setContractsYesNo] = useState<null | string>(null);
  const [futuresInputMode, setFuturesInputMode] = useState<"manual" | "paste">("paste");
  const [lastResult, setLastResult] = useState<IngestResult | null>(null);
  const [manualClosePrice, setManualClosePrice] = useState("");
  const [manualClosedAt, setManualClosedAt] = useState("");
  const [manualDollarsPerPoint, setManualDollarsPerPoint] = useState(String(DEFAULT_DOLLARS_PER_POINT));
  const [manualOpenPrice, setManualOpenPrice] = useState("");
  const [manualOpenedAt, setManualOpenedAt] = useState("");
  const [manualQty, setManualQty] = useState("");
  const [manualSide, setManualSide] = useState<"LONG" | "SHORT">("LONG");
  const [manualSymbol, setManualSymbol] = useState("");
  const [oneShotExit, setOneShotExit] = useState("");
  const [oneShotSell, setOneShotSell] = useState("");
  const [rawText, setRawText] = useState("");
  const [tradeDate, setTradeDate] = useState(() => localYmd());
  const [tradingGrade, setTradingGrade] = useState("");

  const urlAccount = urlAccountFromServer.trim();

  const accountsQuery = useQuery({
    queryFn: fetchAccounts,
    queryKey: ["accounts"],
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const selectedAccount = account || (urlAccount && accounts.some((a) => a.name === urlAccount) ? urlAccount : "");
  const isMortgage = selectedAccount === MORTGAGE_ACCOUNT;

  const optionsTradesQuery = useQuery({
    enabled: isMortgage,
    queryFn: fetchOptionsTrades,
    queryKey: ["options-trades", MORTGAGE_ACCOUNT],
  });

  const mortgageStatsQuery = useQuery({
    enabled: isMortgage,
    queryFn: fetchMortgageStats,
    queryKey: ["stats", "mortgage"],
  });

  const tradesQuery = useQuery({
    enabled: Boolean(!isMortgage && lastResult?.rawLogId),
    queryFn: () => fetchTrades(lastResult!.rawLogId),
    queryKey: ["trades", "rawLogId", lastResult?.rawLogId],
  });

  const createAccountMutation = useMutation({
    mutationFn: postAccount,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setNewAccountName("");
      if (data.created) {
        setAccount(data.name);
        setLastResult(null);
        setManualClosePrice("");
        setManualClosedAt("");
        setManualOpenPrice("");
        setManualOpenedAt("");
        setManualDollarsPerPoint(String(DEFAULT_DOLLARS_PER_POINT));
        setManualQty("");
        setManualSide("LONG");
        setManualSymbol("");
        setRawText("");
      }
    },
  });

  const closeOptionsMutation = useMutation({
    mutationFn: (input: { avgSellPrice: number; exitTradeDate: string; id: number; tradingGrade?: null | string }) => {
      const { id, ...body } = input;
      return patchOptionsTrade(id, body);
    },
    onSuccess: async () => {
      setCloseRowId(null);
      setCloseAvgSell("");
      setCloseExitDate(localYmd());
      setCloseGrade("");
      await queryClient.invalidateQueries({ queryKey: ["options-trades", MORTGAGE_ACCOUNT] });
      await queryClient.invalidateQueries({ queryKey: ["stats", "mortgage"] });
    },
  });

  const createOptionsMutation = useMutation({
    mutationFn: postOptionsTrade,
    onSuccess: async () => {
      setAvgBuyPrice("");
      setBoughtCount("");
      setContract("");
      setContractsYesNo(null);
      setOneShotExit("");
      setOneShotSell("");
      setTradingGrade("");

      await queryClient.invalidateQueries({ queryKey: ["options-trades", MORTGAGE_ACCOUNT] });
      await queryClient.invalidateQueries({ queryKey: ["stats", "mortgage"] });
    },
  });

  const ingestMutation = useMutation({
    mutationFn: ({ account, rawText }: { account: string; rawText: string }) => postRawLog(account, rawText),
    onSuccess: async (data) => {
      setLastResult({
        account: data.account,
        createdAt: new Date().toISOString(),
        duplicate: data.duplicate,
        rawLogId: data.rawLogId,
        tradeInsertedCount: data.tradeInsertedCount,
        tradeRequestedCount: data.tradeRequestedCount,
        tradeSkippedCount: data.tradeSkippedCount,
      });
      setRawText("");
      await queryClient.invalidateQueries({ queryKey: ["ingest-events"] });
    },
  });

  const manualTradeMutation = useMutation({
    mutationFn: postManualTrade,
    onSuccess: async (data, variables) => {
      setLastResult({
        account: variables.account,
        createdAt: new Date().toISOString(),
        duplicate: false,
        rawLogId: data.rawLogId,
        tradeInsertedCount: 1,
        tradeRequestedCount: 1,
        tradeSkippedCount: 0,
      });
      setManualClosePrice("");
      setManualClosedAt("");
      setManualOpenPrice("");
      setManualOpenedAt("");
      setManualDollarsPerPoint(String(DEFAULT_DOLLARS_PER_POINT));
      setManualQty("");
      setManualSide("LONG");
      setManualSymbol("");
      await queryClient.invalidateQueries({ queryKey: ["ingest-events"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  useEffect(() => {
    if (!lastResult) return;
    const timeout = window.setTimeout(() => setLastResult(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [lastResult]);

  const pickAccount = (name: string) => {
    setAccount(name);
    setLastResult(null);
    setManualClosePrice("");
    setManualClosedAt("");
    setManualOpenPrice("");
    setManualOpenedAt("");
    setManualDollarsPerPoint(String(DEFAULT_DOLLARS_PER_POINT));
    setManualQty("");
    setManualSide("LONG");
    setManualSymbol("");
    setRawText("");
  };

  const selectedAccountId = accounts.find((a) => a.name === selectedAccount)?.id ?? null;

  const trades = tradesQuery.data?.trades ?? [];
  const pnlTotal = trades.reduce((sum, t) => sum + (Number.isFinite(t.pnl) ? t.pnl : 0), 0);

  const derivedManualPnl = useMemo(() => {
    if (isMortgage) {
      return null;
    }
    const o = Number(manualOpenPrice);
    const c = Number(manualClosePrice);
    const q = Number(manualQty);
    const d = Number(manualDollarsPerPoint);
    if (
      !Number.isFinite(o) ||
      !Number.isFinite(c) ||
      !Number.isFinite(q) ||
      !Number.isInteger(q) ||
      q <= 0 ||
      !Number.isFinite(d) ||
      d <= 0
    ) {
      return null;
    }
    return futuresPnlFromPrices(manualSide, o, c, q, d);
  }, [isMortgage, manualClosePrice, manualDollarsPerPoint, manualOpenPrice, manualQty, manualSide]);

  const optionsTradesDisplay = useMemo(() => {
    const list = optionsTradesQuery.data?.trades ?? [];
    return [...list].sort((a, b) => {
      const aOpen = a.avgSellPrice === null;
      const bOpen = b.avgSellPrice === null;
      if (aOpen !== bOpen) {
        return aOpen ? -1 : 1;
      }
      if (a.tradeDate !== b.tradeDate) {
        return a.tradeDate < b.tradeDate ? 1 : -1;
      }
      return b.id - a.id;
    });
  }, [optionsTradesQuery.data?.trades]);
  const closeTarget = useMemo(
    () => (closeRowId == null ? null : optionsTradesDisplay.find((t) => t.id === closeRowId) ?? null),
    [closeRowId, optionsTradesDisplay],
  );
  const monthKey = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  })();
  const thisMonthOptions = optionsTradesDisplay.filter((t) => t.tradeDate.startsWith(monthKey));
  const monthlyGoal = mortgageStatsQuery.data?.goalMonthly ?? 3000;
  const mortgagePnlMonthly = mortgageStatsQuery.data?.pnlMonthly ?? 0;
  const monthlyProgress = monthlyGoal > 0 ? Math.max(0, Math.min(100, (mortgagePnlMonthly / monthlyGoal) * 100)) : 0;

  return (
    <Stack gap="lg" py="lg">
      <div>
        <Title order={2}>Input</Title>
        <Text c="dimmed" mt={4} size="sm">
          {isMortgage
            ? "Manual options log for the Mortgage account. Monthly goal: $3,000."
            : "Paste a raw log to parse, or add a single futures trade manually. Parsed ingests show duplicate handling; manual entry skips the log."}
        </Text>
      </div>

      <Card withBorder padding="md" radius="lg" shadow="sm">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Select
            data={accounts.map((a) => ({ label: a.name, value: a.name }))}
            label="Account"
            onChange={(value) => pickAccount(value ?? "")}
            placeholder="Select an account…"
            value={selectedAccount}
            withAsterisk
          />
          <Group align="end">
            <TextInput
              label="Add account"
              onChange={(e) => setNewAccountName(e.currentTarget.value)}
              placeholder="e.g. Apex-1"
              value={newAccountName}
            />
            <Button
              disabled={!newAccountName.trim() || createAccountMutation.isPending}
              onClick={() => createAccountMutation.mutate(newAccountName)}
              variant="light"
            >
              {createAccountMutation.isPending ? "Adding…" : "Add"}
            </Button>
          </Group>
        </SimpleGrid>

        {selectedAccountId ? (
          <Anchor component={Link} href={`/accounts/${selectedAccountId}`} mt="sm" size="xs">
            Configure this account →
          </Anchor>
        ) : null}
      </Card>

      {isMortgage ? (
        <Stack gap="md">
          <Modal
            onClose={() => {
              setCloseRowId(null);
            }}
            opened={closeRowId !== null}
            title="Close position"
          >
            {closeTarget ? (
              <Stack gap="sm">
                <Text c="dimmed" size="sm">
                  {closeTarget.contract} — entry {closeTarget.tradeDate}
                  {closeTarget.avgBuyPrice != null
                    ? ` @ ${String(closeTarget.avgBuyPrice)}`
                    : null}
                </Text>
                <TextInput
                  inputMode="decimal"
                  label="Avg. sell price"
                  onChange={(e) => setCloseAvgSell(e.currentTarget.value)}
                  value={closeAvgSell}
                />
                <TextInput
                  inputMode="numeric"
                  label="Exit date (YYYY-MM-DD, exit day for PnL)"
                  onChange={(e) => setCloseExitDate(e.currentTarget.value)}
                  value={closeExitDate}
                />
                <TextInput
                  label="Grade (optional, overrides entry)"
                  onChange={(e) => setCloseGrade(e.currentTarget.value)}
                  value={closeGrade}
                />
                {closeOptionsMutation.isError ? (
                  <Text c="red" size="sm">
                    {closeOptionsMutation.error.message}
                  </Text>
                ) : null}
                <Group justify="flex-end" mt="md">
                  <Button onClick={() => setCloseRowId(null)} variant="default">
                    Cancel
                  </Button>
                  <Button
                    disabled={!closeAvgSell.trim() || closeOptionsMutation.isPending}
                    onClick={() => {
                      if (!closeTarget) return;
                      const n = Number(closeAvgSell);
                      if (!Number.isFinite(n)) {
                        return;
                      }
                      const ex = closeExitDate.trim() || localYmd();
                      const o: { avgSellPrice: number; exitTradeDate: string; id: number; tradingGrade?: null | string } = {
                        avgSellPrice: n,
                        exitTradeDate: ex,
                        id: closeTarget.id,
                      };
                      if (closeGrade.trim()) {
                        o.tradingGrade = closeGrade.trim();
                      }
                      closeOptionsMutation.mutate(o);
                    }}
                  >
                    {closeOptionsMutation.isPending ? "Saving…" : "Record exit"}
                  </Button>
                </Group>
              </Stack>
            ) : null}
          </Modal>

          <Card withBorder padding="md" radius="lg" shadow="sm">
            <Group justify="space-between">
              <Text fw={700} size="sm">
                Mortgage progress (this month)
              </Text>
              <Text
                c={mortgagePnlMonthly >= monthlyGoal ? "green" : "dimmed"}
                fw={700}
                size="sm"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatMoneyOrDash(mortgagePnlMonthly)} / {formatMoneyOrDash(monthlyGoal)}
              </Text>
            </Group>
            <Progress mt="sm" value={monthlyProgress} />
            <Text c="dimmed" mt={6} size="xs">
              Progress matches the dashboard mortgage stats (server-calculated for this month).
            </Text>
            {mortgageStatsQuery.isError ? (
              <Text c="red" mt={6} size="xs">
                {(mortgageStatsQuery.error as Error).message}
              </Text>
            ) : null}
          </Card>

          <Card withBorder padding="md" radius="lg" shadow="sm">
            <Text c="dimmed" mb="xs" size="sm">
              Log an <Text component="span" fw={600}>open position</Text> (entry). When you sell, use{" "}
              <Text component="span" fw={600}>
                Close
              </Text>{" "}
              on a row, or use optional fields below to record a full round-trip in one step.
            </Text>
            <Text fw={700} mb="sm" size="sm">
              Add entry
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
              <TextInput
                inputMode="numeric"
                label="Entry date (YYYY-MM-DD)"
                onChange={(e) => setTradeDate(e.currentTarget.value)}
                placeholder="2026-04-25"
                value={tradeDate}
              />
              <TextInput
                label="Contract"
                onChange={(e) => setContract(e.currentTarget.value)}
                placeholder="e.g. SPY 5/17 530C"
                value={contract}
              />
              <TextInput
                inputMode="decimal"
                label="Avg. buy (entry) price"
                onChange={(e) => setAvgBuyPrice(e.currentTarget.value)}
                placeholder="1.25"
                value={avgBuyPrice}
              />
              <Select
                data={[
                  { label: "No", value: "No" },
                  { label: "Yes", value: "Yes" },
                ]}
                label="Contracts (Yes/No)"
                onChange={setContractsYesNo}
                placeholder="Select…"
                value={contractsYesNo}
              />
              <TextInput
                inputMode="numeric"
                label="# Bought"
                onChange={(e) => setBoughtCount(e.currentTarget.value)}
                placeholder="1"
                value={boughtCount}
              />
              <TextInput
                label="Entry grade (optional)"
                onChange={(e) => setTradingGrade(e.currentTarget.value)}
                placeholder="A / B / C…"
                value={tradingGrade}
              />
            </SimpleGrid>

            <Divider label="Optional — same-day or immediate exit" my="md" />
            <SimpleGrid cols={{ base: 1, sm: 2, md: 2 }} spacing="sm">
              <TextInput
                inputMode="decimal"
                label="Avg. sell price (optional)"
                onChange={(e) => setOneShotSell(e.currentTarget.value)}
                placeholder="Leave empty to close later"
                value={oneShotSell}
              />
              <TextInput
                inputMode="numeric"
                label="Exit date (if you filled sell, optional; defaults to entry date)"
                onChange={(e) => setOneShotExit(e.currentTarget.value)}
                placeholder="YYYY-MM-DD"
                value={oneShotExit}
              />
            </SimpleGrid>

            <Group mt="md">
              <Button
                disabled={(() => {
                  if (createOptionsMutation.isPending) return true;
                  if (!tradeDate.trim() || !contract.trim() || !avgBuyPrice.trim() || !boughtCount.trim()) {
                    return true;
                  }
                  const b = Number(avgBuyPrice);
                  const c = Number(boughtCount);
                  if (!Number.isFinite(b) || !Number.isFinite(c) || c <= 0) {
                    return true;
                  }
                  if (oneShotSell.trim() && !Number.isFinite(Number(oneShotSell))) {
                    return true;
                  }
                  if (oneShotExit.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(oneShotExit.trim())) {
                    return true;
                  }
                  return false;
                })()}
                onClick={() => {
                  const buyN = Number(avgBuyPrice);
                  const countN = Number(boughtCount);
                  if (!Number.isFinite(buyN) || !Number.isFinite(countN) || countN <= 0) {
                    return;
                  }
                  const hasOneShot = Boolean(oneShotSell.trim());
                  const sellN = hasOneShot ? Number(oneShotSell) : null;
                  if (hasOneShot && (sellN === null || !Number.isFinite(sellN))) {
                    return;
                  }
                  const ex = hasOneShot ? (oneShotExit.trim() || tradeDate.trim()) : null;
                  if (ex && !/^\d{4}-\d{2}-\d{2}$/.test(ex)) {
                    return;
                  }
                  createOptionsMutation.mutate({
                    account: MORTGAGE_ACCOUNT,
                    avgBuyPrice: buyN,
                    avgSellPrice: hasOneShot && sellN !== null ? sellN : null,
                    boughtCount: countN,
                    contract: contract.trim(),
                    contractsYesNo,
                    exitTradeDate: ex,
                    tradeDate: tradeDate.trim(),
                    tradingGrade: tradingGrade.trim() ? tradingGrade : null,
                  });
                }}
              >
                {createOptionsMutation.isPending ? "Saving…" : "Save entry"}
              </Button>
              {createOptionsMutation.isError ? (
                <Text c="red" size="sm">
                  {createOptionsMutation.error.message}
                </Text>
              ) : null}
            </Group>
          </Card>

          <Card withBorder padding="md" radius="lg" shadow="sm">
            <Group justify="space-between" mb="sm">
              <Text c="dimmed" fw={600} size="xs">
                Rows (this month: {thisMonthOptions.length}, total: {optionsTradesDisplay.length})
              </Text>
            </Group>

            {optionsTradesQuery.isError ? (
              <Alert color="red" title="Options trades error">
                {(optionsTradesQuery.error as Error).message}
              </Alert>
            ) : null}

            {optionsTradesQuery.isLoading ? <Text c="dimmed">Loading…</Text> : null}
            {!optionsTradesQuery.isLoading && optionsTradesDisplay.length === 0 ? (
              <Text c="dimmed">No rows yet.</Text>
            ) : null}

            {optionsTradesDisplay.length > 0 ? (
              <Table highlightOnHover striped withRowBorders withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Entry</Table.Th>
                    <Table.Th>Exit (PnL day)</Table.Th>
                    <Table.Th>Contract</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Avg. buy</Table.Th>
                    <Table.Th>Contracts</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}># Bought</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Avg. sell</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>PnL</Table.Th>
                    <Table.Th>Grade</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}> </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {optionsTradesDisplay.map((t) => {
                    const open = t.avgSellPrice === null;
                    const pnl = optionsPnl(t);
                    return (
                      <Table.Tr key={t.id}>
                        <Table.Td>
                          {open ? (
                            <Badge color="orange" variant="light">
                              Open
                            </Badge>
                          ) : (
                            <Badge color="green" variant="light">
                              Closed
                            </Badge>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{t.tradeDate}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">
                            {open
                              ? "—"
                              : t.exitTradeDate
                                ? t.exitTradeDate
                                : t.tradeDate}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text fw={600} size="sm">
                            {t.contract}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {t.avgBuyPrice === null ? "—" : t.avgBuyPrice}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{t.contractsYesNo ?? "—"}</Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {t.boughtCount ?? "—"}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {t.avgSellPrice === null ? "—" : t.avgSellPrice}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text
                            c={pnl === null ? undefined : pnl >= 0 ? "green" : "red"}
                            fw={700}
                            size="sm"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {pnl === null
                              ? "—"
                              : pnl.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{t.tradingGrade ?? "—"}</Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          {open ? (
                            <Button
                              onClick={() => {
                                setCloseAvgSell("");
                                setCloseExitDate(localYmd());
                                setCloseGrade("");
                                setCloseRowId(t.id);
                              }}
                              size="xs"
                              variant="light"
                            >
                              Close
                            </Button>
                          ) : null}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            ) : null}
          </Card>
        </Stack>
      ) : (
        <Grid>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card withBorder padding="md" radius="lg" shadow="sm">
              <Group align="center" justify="space-between" mb="md" wrap="wrap">
                <SegmentedControl
                  data={[
                    { label: "Paste log", value: "paste" },
                    { label: "Manual entry", value: "manual" },
                  ]}
                  onChange={(v) => setFuturesInputMode(v as "manual" | "paste")}
                  value={futuresInputMode}
                />
                {futuresInputMode === "paste" ? (
                  <Button disabled={!rawText} onClick={() => setRawText("")} size="xs" variant="subtle">
                    Clear
                  </Button>
                ) : null}
              </Group>

              {futuresInputMode === "paste" ? (
                <>
                  <Text c="dimmed" fw={600} mb="xs" size="xs">
                    Raw log
                  </Text>
                  <Textarea
                    autosize
                    label="Raw text"
                    minRows={14}
                    onChange={(e) => setRawText(e.currentTarget.value)}
                    placeholder="Paste the raw trade log text here…"
                    value={rawText}
                  />

                  <Group mt="md">
                    <Button
                      disabled={!selectedAccount || !rawText.trim() || ingestMutation.isPending}
                      onClick={() => ingestMutation.mutate({ account: selectedAccount, rawText })}
                    >
                      {ingestMutation.isPending ? "Saving…" : "Parse & save"}
                    </Button>

                    {ingestMutation.isError ? (
                      <Text c="red" size="sm">
                        {ingestMutation.error.message}
                      </Text>
                    ) : null}

                    {ingestMutation.isSuccess ? (
                      <Text
                        c={ingestMutation.data.duplicate || ingestMutation.data.tradeSkippedCount > 0 ? "yellow" : "dimmed"}
                        size="sm"
                      >
                        {ingestMutation.data.duplicate ? "Rejected (duplicate raw log)." : "Added."} Inserted{" "}
                        {ingestMutation.data.tradeInsertedCount}/{ingestMutation.data.tradeRequestedCount} trades
                        {ingestMutation.data.tradeSkippedCount > 0
                          ? ` (skipped ${ingestMutation.data.tradeSkippedCount} duplicates)`
                          : ""}
                        .
                      </Text>
                    ) : null}
                  </Group>
                </>
              ) : (
                <Stack gap="sm">
                  <Text c="dimmed" size="sm">
                    PnL = (favorable price move in index points) × qty × dollars per point. Adjust dollars/point to match
                    your product (e.g. ES 50, NQ 20, MES 5).
                  </Text>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput
                      label="Symbol"
                      onChange={(e) => setManualSymbol(e.currentTarget.value)}
                      placeholder="e.g. ESZ5"
                      value={manualSymbol}
                    />
                    <Select
                      data={[
                        { label: "LONG", value: "LONG" },
                        { label: "SHORT", value: "SHORT" },
                      ]}
                      label="Side"
                      onChange={(v) => v && setManualSide(v as "LONG" | "SHORT")}
                      value={manualSide}
                    />
                    <TextInput
                      inputMode="numeric"
                      label="Qty (contracts)"
                      onChange={(e) => setManualQty(e.currentTarget.value)}
                      placeholder="1"
                      value={manualQty}
                    />
                    <TextInput
                      inputMode="decimal"
                      label="Dollars per point"
                      onChange={(e) => setManualDollarsPerPoint(e.currentTarget.value)}
                      placeholder="50"
                      value={manualDollarsPerPoint}
                    />
                    <TextInput
                      inputMode="decimal"
                      label="Open price"
                      onChange={(e) => setManualOpenPrice(e.currentTarget.value)}
                      placeholder="0.00"
                      value={manualOpenPrice}
                    />
                    <TextInput
                      inputMode="decimal"
                      label="Close price"
                      onChange={(e) => setManualClosePrice(e.currentTarget.value)}
                      placeholder="0.00"
                      value={manualClosePrice}
                    />
                    <TextInput
                      label="Opened (local)"
                      onChange={(e) => setManualOpenedAt(e.currentTarget.value)}
                      type="datetime-local"
                      value={manualOpenedAt}
                    />
                    <TextInput
                      label="Closed (local)"
                      onChange={(e) => setManualClosedAt(e.currentTarget.value)}
                      type="datetime-local"
                      value={manualClosedAt}
                    />
                  </SimpleGrid>
                  <Text size="sm">
                    <Text component="span" c="dimmed">
                      Derived PnL:{" "}
                    </Text>
                    <Text
                      component="span"
                      c={derivedManualPnl === null ? "dimmed" : derivedManualPnl >= 0 ? "green" : "red"}
                      fw={700}
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {derivedManualPnl === null
                        ? "—"
                        : formatMoneyOrDash(derivedManualPnl)}
                    </Text>
                  </Text>
                  <Group mt="xs">
                    <Button
                      disabled={
                        !selectedAccount || derivedManualPnl === null || manualTradeMutation.isPending
                      }
                      loading={manualTradeMutation.isPending}
                      onClick={() => {
                        if (!selectedAccount || derivedManualPnl === null) return;
                        const qtyN = Number(manualQty);
                        const o = Number(manualOpenPrice);
                        const c = Number(manualClosePrice);
                        const dpp = Number(manualDollarsPerPoint);
                        if (
                          !manualSymbol.trim() ||
                          !Number.isFinite(dpp) ||
                          dpp <= 0 ||
                          !Number.isFinite(qtyN) ||
                          !Number.isInteger(qtyN) ||
                          qtyN <= 0 ||
                          !Number.isFinite(o) ||
                          !Number.isFinite(c) ||
                          !manualOpenedAt ||
                          !manualClosedAt
                        ) {
                          return;
                        }
                        const openedAt = new Date(manualOpenedAt);
                        const closedAt = new Date(manualClosedAt);
                        if (Number.isNaN(openedAt.getTime()) || Number.isNaN(closedAt.getTime()) || closedAt < openedAt) {
                          return;
                        }
                        manualTradeMutation.mutate({
                          account: selectedAccount,
                          closePrice: c,
                          closedAt: closedAt.toISOString(),
                          dollarsPerPoint: dpp,
                          openPrice: o,
                          openedAt: openedAt.toISOString(),
                          qty: qtyN,
                          side: manualSide,
                          symbol: manualSymbol.trim(),
                        });
                      }}
                    >
                      Add trade
                    </Button>
                    {manualTradeMutation.isError ? (
                      <Text c="red" size="sm">
                        {manualTradeMutation.error.message}
                      </Text>
                    ) : null}
                  </Group>
                </Stack>
              )}

              {lastResult ? (
                <Alert
                  color={lastResult.duplicate ? "yellow" : "green"}
                  mt="md"
                  title={
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={600} size="sm">
                        {lastResult.duplicate ? "Rejected" : "Added"} • {lastResult.account} • Log #{lastResult.rawLogId}
                      </Text>
                      <Badge color={lastResult.duplicate ? "yellow" : "green"} variant="light">
                        {lastResult.duplicate ? "duplicate" : "added"}
                      </Badge>
                    </Group>
                  }
                  withCloseButton
                  onClose={() => setLastResult(null)}
                >
                  <Text c="dimmed" size="xs">
                    {new Date(lastResult.createdAt).toLocaleString()} • Inserted {lastResult.tradeInsertedCount}/
                    {lastResult.tradeRequestedCount}
                    {lastResult.tradeSkippedCount > 0 ? ` (skipped ${lastResult.tradeSkippedCount})` : ""}
                  </Text>
                </Alert>
              ) : null}
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <Card withBorder padding="md" radius="lg" shadow="sm">
              <Group justify="space-between" mb="sm">
                <Text c="dimmed" fw={600} size="xs">
                  Trades (most recent ingest)
                </Text>
                <Text c="dimmed" size="xs" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {!lastResult ? "No ingests yet" : tradesQuery.isLoading ? "Loading…" : `${trades.length} loaded`} • PnL
                  total:{" "}
                  <Text component="span" c={pnlTotal >= 0 ? "green" : "red"} fw={700}>
                    {pnlTotal.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                  </Text>
                </Text>
              </Group>

              {tradesQuery.isError ? (
                <Alert color="red" title="Trades error">
                  {(tradesQuery.error as Error).message}
                </Alert>
              ) : null}

              {!lastResult ? (
                <Text c="dimmed">Parse a log or add a trade manually to see it here.</Text>
              ) : null}

              {lastResult && !tradesQuery.isLoading && trades.length === 0 ? (
                <Text c="dimmed">No trades for raw log #{lastResult.rawLogId}.</Text>
              ) : null}

              {trades.length > 0 ? (
                <Table highlightOnHover striped withRowBorders withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Symbol</Table.Th>
                      <Table.Th>Side</Table.Th>
                      <Table.Th>Qty</Table.Th>
                      <Table.Th>Opened</Table.Th>
                      <Table.Th>Closed</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>PnL</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {trades.map((t) => (
                      <Table.Tr key={t.id}>
                        <Table.Td>
                          <Text fw={600} size="sm">
                            {t.symbol}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{t.side}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{t.qty}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{new Date(t.openedAt).toLocaleString()}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{new Date(t.closedAt).toLocaleString()}</Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text
                            c={t.pnl >= 0 ? "green" : "red"}
                            fw={700}
                            size="sm"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {t.pnl.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : null}
            </Card>
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}
