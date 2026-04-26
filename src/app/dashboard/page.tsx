"use client";

import {
  Alert,
  Anchor,
  Badge,
  Card,
  Group,
  Progress,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

type AccountDto = {
  createdAt: string;
  id: number;
  name: string;
};

type AccountStatsDto = {
  accountId: number;
  balance: number;
  createdAt: string;
  eligible: boolean;
  lastWithdrawalAt: string | null;
  monthlyPnlGoal: number | null;
  name: string;
  pnlMonth: number;
  pnlWeek: number;
  totalWins: number;
  winMinPnl: number;
  weeklyPnlGoal: number | null;
  winsSinceLastWithdrawal: number;
  withdrawBalanceThreshold: number | null;
  withdrawMinWinCount: number | null;
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

type PnlStatsDto = {
  account: string | null;
  goals: {
    monthly: number | null;
    weekly: number | null;
  };
  ranges: {
    monthStart: string;
    todayStart: string;
    weekStart: string;
    yearStart: string;
  };
  totals: {
    allTime: number;
    month: number;
    today: number;
    week: number;
    year: number;
  };
};

type MortgageStatsDto = {
  goalMonthly: number;
  monthKey: string;
  pnlMonthly: number;
  pnlToday: number;
  pnlWeek: number;
  ranges: {
    monthStartYmd: string;
    todayYmd: string;
    weekStartYmd: string;
  };
};

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

const MORTGAGE_OPTIONS_ACCOUNT = "Mortgage";

async function fetchAccounts() {
  const res = await fetch("/api/accounts", { method: "GET" });
  if (!res.ok) throw new Error("Failed to fetch accounts");
  return (await res.json()) as { accounts: AccountDto[] };
}

async function fetchPnl(account: string | null) {
  const url = account ? `/api/stats/pnl?account=${encodeURIComponent(account)}` : "/api/stats/pnl";
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error("Failed to fetch PnL stats");
  return (await res.json()) as PnlStatsDto;
}

async function fetchAccountStats() {
  const res = await fetch("/api/stats/accounts", { method: "GET" });
  if (!res.ok) throw new Error("Failed to fetch account stats");
  return (await res.json()) as { accounts: AccountStatsDto[] };
}

async function fetchMortgageStats() {
  const res = await fetch("/api/options-trades/stats", { method: "GET" });
  if (!res.ok) throw new Error("Failed to fetch mortgage stats");
  return (await res.json()) as MortgageStatsDto;
}

async function fetchOptionsTrades() {
  const res = await fetch(
    `/api/options-trades?account=${encodeURIComponent(MORTGAGE_OPTIONS_ACCOUNT)}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error("Failed to fetch options trades");
  return (await res.json()) as { account: string; trades: OptionsTradeDto[] };
}

async function fetchTradesForAccount(account: string) {
  const res = await fetch(`/api/trades?account=${encodeURIComponent(account)}`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to fetch trades");
  return (await res.json()) as { trades: TradeDto[] };
}

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  });
}

function optionsRowPnl(t: OptionsTradeDto) {
  if (t.avgBuyPrice === null || t.avgSellPrice === null || t.boughtCount === null) {
    return null;
  }
  return (t.avgSellPrice - t.avgBuyPrice) * 100.0 * t.boughtCount;
}

function StatCard({
  hint,
  label,
  value,
}: {
  hint?: string;
  label: string;
  value: number;
}) {
  const positive = value >= 0;
  return (
    <Card withBorder padding="md" radius="lg" shadow="sm">
      <Text c="dimmed" fw={600} size="xs">
        {label}
      </Text>
      {hint ? (
        <Text c="dimmed" size="xs">
          {hint}
        </Text>
      ) : null}
      <Text
        c={positive ? "green" : "red"}
        fw={700}
        mt={hint ? 4 : 6}
        size="xl"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatMoney(value)}
      </Text>
    </Card>
  );
}

export default function DashboardPage() {
  const [account, setAccount] = useState<string | null>(null);
  const [goalMode, setGoalMode] = useState<"futures" | "mortgage">("futures");

  const accountsQuery = useQuery({
    queryFn: fetchAccounts,
    queryKey: ["accounts"],
  });

  const accountStatsQuery = useQuery({
    queryFn: fetchAccountStats,
    queryKey: ["stats", "accounts"],
  });

  const pnlQuery = useQuery({
    enabled: goalMode === "futures",
    queryFn: () => fetchPnl(account),
    queryKey: ["stats", "pnl", account],
  });

  const mortgageQuery = useQuery({
    enabled: goalMode === "mortgage",
    queryFn: fetchMortgageStats,
    queryKey: ["stats", "mortgage"],
  });

  const optionsTradesQuery = useQuery({
    enabled: goalMode === "mortgage",
    queryFn: fetchOptionsTrades,
    queryKey: ["options-trades", MORTGAGE_OPTIONS_ACCOUNT],
  });

  const tradesQuery = useQuery({
    enabled: Boolean(account) && goalMode === "futures",
    queryFn: () => fetchTradesForAccount(account!),
    queryKey: ["trades", "account", account],
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const accountsFutures = accounts.filter((a) => a.name !== "Mortgage");
  const accountStats = accountStatsQuery.data?.accounts ?? [];
  const eligibleAccounts = accountStats.filter((a) => a.eligible);
  const eligibleAccountsForView = account
    ? eligibleAccounts.filter((a) => a.name === account)
    : eligibleAccounts;
  const title = useMemo(() => {
    if (goalMode === "mortgage") {
      return "Mortgage (options)";
    }
    if (account) {
      return `Good Morning, ${account}`;
    }
    return "Good Morning";
  }, [account, goalMode]);

  const weeklyGoal = pnlQuery.data?.goals.weekly ?? null;
  const monthlyGoal = pnlQuery.data?.goals.monthly ?? null;
  const weekPnl = pnlQuery.data?.totals.week ?? 0;
  const monthPnl = pnlQuery.data?.totals.month ?? 0;

  const weeklyProgress =
    weeklyGoal && weeklyGoal > 0 ? Math.max(0, Math.min(100, (weekPnl / weeklyGoal) * 100)) : null;
  const monthlyProgress =
    monthlyGoal && monthlyGoal > 0 ? Math.max(0, Math.min(100, (monthPnl / monthlyGoal) * 100)) : null;

  const mortgageGoalMonthly = mortgageQuery.data?.goalMonthly ?? 3000;
  const mortgagePnlMonthly = mortgageQuery.data?.pnlMonthly ?? 0;
  const mortgageProgress =
    mortgageGoalMonthly > 0 ? Math.max(0, Math.min(100, (mortgagePnlMonthly / mortgageGoalMonthly) * 100)) : 0;

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

  return (
    <Stack gap="lg" py="lg">
      <Group align="flex-end" justify="space-between" wrap="wrap">
        <div>
          <Title order={2}>{title}</Title>
          <Text c="dimmed" mt={4} size="sm">
            {goalMode === "mortgage"
              ? "Monthly goal progress, options PnL for today and this week, then your options trade log."
              : account
                ? "Futures trades for this account and PnL for today and this week."
                : "PnL summaries for today, this week, and this month."}
          </Text>
        </div>

        <Group align="flex-end" gap="sm" wrap="wrap">
          <SegmentedControl
            data={[
              { label: "Futures", value: "futures" },
              { label: "Mortgage pay", value: "mortgage" },
            ]}
            onChange={(value) => {
              const mode = value as "futures" | "mortgage";
              setGoalMode(mode);
              if (mode === "mortgage") {
                setAccount(null);
              }
            }}
            value={goalMode}
          />
          {goalMode === "futures" ? (
            <Select
              data={[
                { label: "All accounts", value: "" },
                ...accountsFutures.map((a) => ({ label: a.name, value: a.name })),
              ]}
              label="Account filter"
              onChange={(value) => setAccount(value ? value : null)}
              value={account ?? ""}
              w={260}
            />
          ) : null}
        </Group>
      </Group>

      {goalMode === "futures" && pnlQuery.isError ? (
        <Alert color="red" title="PnL stats error">
          {(pnlQuery.error as Error).message}
        </Alert>
      ) : null}

      {goalMode === "mortgage" && mortgageQuery.isError ? (
        <Alert color="red" title="Mortgage stats error">
          {(mortgageQuery.error as Error).message}
        </Alert>
      ) : null}

      {goalMode === "futures" && eligibleAccountsForView.length > 0 ? (
        <Alert color="green" title="Eligible to withdraw">
          <Text span fw={600}>
            {eligibleAccountsForView.map((a) => a.name).join(", ")}
          </Text>
        </Alert>
      ) : null}

      {goalMode === "futures" && !account ? (
        <Card withBorder padding="md" radius="lg" shadow="sm">
          <Text c="dimmed" fw={600} mb="sm" size="xs">
            Standard goal
          </Text>

          {weeklyProgress !== null || monthlyProgress !== null ? (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <div>
                <Group justify="space-between">
                  <Text fw={600} size="sm">
                    This week
                  </Text>
                  <Text c="dimmed" size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(weekPnl)} / {weeklyGoal === null ? "—" : formatMoney(weeklyGoal)}
                  </Text>
                </Group>
                <Progress mt={8} value={weeklyProgress ?? 0} />
              </div>

              <div>
                <Group justify="space-between">
                  <Text fw={600} size="sm">
                    This month
                  </Text>
                  <Text c="dimmed" size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(monthPnl)} / {monthlyGoal === null ? "—" : formatMoney(monthlyGoal)}
                  </Text>
                </Group>
                <Progress mt={8} value={monthlyProgress ?? 0} />
              </div>
            </SimpleGrid>
          ) : (
            <Text c="dimmed" size="sm">
              No futures goals set yet.
            </Text>
          )}
        </Card>
      ) : null}

      {goalMode === "mortgage" ? (
        <Card withBorder padding="md" radius="lg" shadow="sm">
          <Text c="dimmed" fw={600} mb="sm" size="xs">
            Goal progress
          </Text>
          <Group justify="space-between">
            <Text fw={600} size="sm">
              This month
            </Text>
            <Text
              c={mortgagePnlMonthly >= mortgageGoalMonthly ? "green" : "dimmed"}
              fw={700}
              size="sm"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatMoney(mortgagePnlMonthly)} / {formatMoney(mortgageGoalMonthly)}
            </Text>
          </Group>
          <Progress mt="sm" value={mortgageProgress} />
        </Card>
      ) : null}

      {goalMode === "futures" ? (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <StatCard
            hint={account ? "Futures PnL, this account only" : undefined}
            label="Today"
            value={pnlQuery.data?.totals.today ?? 0}
          />
          <StatCard
            hint={account ? "Futures PnL, this account only" : undefined}
            label="This week"
            value={pnlQuery.data?.totals.week ?? 0}
          />
        </SimpleGrid>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <StatCard
            hint="Options PnL, Mortgage account"
            label="Today"
            value={mortgageQuery.data?.pnlToday ?? 0}
          />
          <StatCard
            hint="Options PnL, Mortgage account"
            label="This week"
            value={mortgageQuery.data?.pnlWeek ?? 0}
          />
        </SimpleGrid>
      )}

      {goalMode === "futures" && account ? (
        <Card withBorder padding="md" radius="lg" shadow="sm">
          <Text c="dimmed" fw={600} mb="sm" size="xs">
            Trades • {account}
          </Text>
          {tradesQuery.isError ? (
            <Alert color="red" title="Trades error">
              {(tradesQuery.error as Error).message}
            </Alert>
          ) : null}
          {tradesQuery.isLoading ? <Text c="dimmed">Loading…</Text> : null}
          {!tradesQuery.isLoading && (tradesQuery.data?.trades.length ?? 0) === 0 ? (
            <Text c="dimmed">No trades for this account yet.</Text>
          ) : null}
          {(tradesQuery.data?.trades.length ?? 0) > 0 ? (
            <Table highlightOnHover striped withRowBorders withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Symbol</Table.Th>
                  <Table.Th>Side</Table.Th>
                  <Table.Th>Qty</Table.Th>
                  <Table.Th>Opened</Table.Th>
                  <Table.Th>Closed</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>PnL</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>Raw log</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(tradesQuery.data?.trades ?? []).map((t) => (
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
                    <Table.Td style={{ textAlign: "right" }}>
                      <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                        #{t.rawLogId}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : null}
        </Card>
      ) : null}

      {goalMode === "mortgage" ? (
        <Card withBorder padding="md" radius="lg" shadow="sm">
          <Text c="dimmed" fw={600} mb="sm" size="xs">
            Options trade log
          </Text>
          {optionsTradesQuery.isError ? (
            <Alert color="red" title="Options trades error">
              {(optionsTradesQuery.error as Error).message}
            </Alert>
          ) : null}
          {optionsTradesQuery.isLoading ? <Text c="dimmed">Loading…</Text> : null}
          {!optionsTradesQuery.isLoading && optionsTradesDisplay.length === 0 ? (
            <Text c="dimmed">No options trades yet.</Text>
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
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {optionsTradesDisplay.map((t) => {
                  const open = t.avgSellPrice === null;
                  const pnl = optionsRowPnl(t);
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
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          ) : null}
        </Card>
      ) : null}

      {goalMode === "futures" && !account ? (
        <Card withBorder padding="md" radius="lg" shadow="sm">
          <Group justify="space-between" mb="sm">
            <Text c="dimmed" fw={600} size="xs">
              Accounts
            </Text>
            <Anchor component={Link} href="/accounts" size="xs">
              Manage →
            </Anchor>
          </Group>

          {accountStatsQuery.isError ? (
            <Alert color="red" title="Account stats error">
              {(accountStatsQuery.error as Error).message}
            </Alert>
          ) : null}

          {accountStatsQuery.isLoading ? <Text c="dimmed">Loading…</Text> : null}

          {!accountStatsQuery.isLoading && accountStats.length === 0 ? (
            <Text c="dimmed">No accounts yet.</Text>
          ) : null}

          {!accountStatsQuery.isLoading && accountStats.length > 0 ? (
            <Table highlightOnHover striped withRowBorders withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Account</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>Balance</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>Wins (since)</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>Wins (total)</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>Week</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>Month</Table.Th>
                  <Table.Th>Last withdrawal</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {accountStats.map((a) => (
                  <Table.Tr key={a.accountId}>
                    <Table.Td>
                      <Text fw={600} size="sm">
                        {a.name}
                      </Text>
                      <Text c="dimmed" size="xs">
                        Win ≥ {formatMoney(a.winMinPnl)}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      <Text fw={600} size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatMoney(a.balance)}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {a.winsSinceLastWithdrawal}/{a.withdrawMinWinCount ?? "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {a.totalWins}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      <Text
                        c={a.weeklyPnlGoal !== null && a.pnlWeek >= a.weeklyPnlGoal ? "green" : undefined}
                        size="sm"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {formatMoney(a.pnlWeek)}
                      </Text>
                      <Text c="dimmed" size="xs" style={{ fontVariantNumeric: "tabular-nums" }}>
                        / {a.weeklyPnlGoal === null ? "—" : formatMoney(a.weeklyPnlGoal)}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      <Text
                        c={a.monthlyPnlGoal !== null && a.pnlMonth >= a.monthlyPnlGoal ? "green" : undefined}
                        size="sm"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {formatMoney(a.pnlMonth)}
                      </Text>
                      <Text c="dimmed" size="xs" style={{ fontVariantNumeric: "tabular-nums" }}>
                        / {a.monthlyPnlGoal === null ? "—" : formatMoney(a.monthlyPnlGoal)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{a.lastWithdrawalAt ? new Date(a.lastWithdrawalAt).toLocaleString() : "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={a.eligible ? "green" : "gray"} variant="light">
                        {a.eligible ? "eligible" : "not eligible"}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : null}
        </Card>
      ) : null}

      {goalMode === "futures" ? (
        <Card withBorder padding="md" radius="lg" shadow="sm">
          <Text c="dimmed" fw={600} size="xs">
            Range starts (local)
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 3 }} mt="sm" spacing="xs">
            <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
              Today:{" "}
              {pnlQuery.data?.ranges.todayStart
                ? new Date(pnlQuery.data.ranges.todayStart).toLocaleString()
                : "—"}
            </Text>
            <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
              Week:{" "}
              {pnlQuery.data?.ranges.weekStart
                ? new Date(pnlQuery.data.ranges.weekStart).toLocaleString()
                : "—"}
            </Text>
            <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
              Month:{" "}
              {pnlQuery.data?.ranges.monthStart
                ? new Date(pnlQuery.data.ranges.monthStart).toLocaleString()
                : "—"}
            </Text>
          </SimpleGrid>
        </Card>
      ) : null}
    </Stack>
  );
}
