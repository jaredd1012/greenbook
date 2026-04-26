"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

type PayoutSettingsDto = {
  monthlyPayoutGoal: number;
  updatedAt: string | null;
  weeklyPayoutTarget: number;
};

type WeekBlock = {
  futuresPnl: number;
  halfOfFuturesPnl: number;
  met: boolean | null;
  payoutTarget: number;
  shortfall: number;
  weekEnd: string;
  weekLabel: string;
  weekStart: string;
  weekStatus: "complete" | "in_progress" | "upcoming";
  withdrawalTotal: number;
};

type PayoutWeeksDto = {
  monthlyPayoutGoal: number;
  weeks: WeekBlock[];
  weeklyPayoutTarget: number;
};

async function fetchPayoutSettings() {
  const res = await fetch("/api/payouts/settings", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load payout settings");
  return (await res.json()) as PayoutSettingsDto;
}

async function fetchPayoutWeeks(count: number) {
  const res = await fetch(`/api/payouts/weeks?count=${encodeURIComponent(String(count))}`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load payout weeks");
  const data = (await res.json()) as PayoutWeeksDto;
  return {
    ...data,
    weeks: data.weeks.map((w) => ({
      ...w,
      halfOfFuturesPnl: w.futuresPnl * 0.5,
    })),
  };
}

async function putPayoutSettings(monthlyPayoutGoal: number) {
  const res = await fetch("/api/payouts/settings", {
    body: JSON.stringify({ monthlyPayoutGoal }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as null | { error?: string };
    throw new Error(data?.error ?? "Failed to save");
  }
  return (await res.json()) as PayoutSettingsDto;
}

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  });
}

const WEEK_COUNT = 8;

export default function PayoutPage() {
  const queryClient = useQueryClient();
  const [goalDirty, setGoalDirty] = useState(false);
  const [goalLocal, setGoalLocal] = useState(0);

  const settingsQuery = useQuery({
    queryFn: fetchPayoutSettings,
    queryKey: ["payouts", "settings"],
  });

  const weeksQuery = useQuery({
    queryFn: () => fetchPayoutWeeks(WEEK_COUNT),
    queryKey: ["payouts", "weeks", WEEK_COUNT],
  });

  const saveMutation = useMutation({
    mutationFn: putPayoutSettings,
    onSuccess: async () => {
      setGoalDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["payouts", "settings"] });
      await queryClient.invalidateQueries({ queryKey: ["payouts", "weeks"] });
    },
  });

  const data = settingsQuery.data;
  const showInput = data !== undefined;
  const serverMonthly = data?.monthlyPayoutGoal;
  const monthlyValue = goalDirty ? goalLocal : (serverMonthly ?? 0);

  return (
    <Stack gap="lg" py="lg">
      <div>
        <Title order={2}>Payouts</Title>
        <Text c="dimmed" mt={4} size="sm">
          Set a monthly payout target. Each week’s target is one fourth of that (roughly weekly slices). We compare
          actual withdrawals (from all accounts) to the weekly target. “Half of earn” is shown for reference: 50% of
          futures PnL for that week.
        </Text>
      </div>

      {settingsQuery.isError ? (
        <Alert color="red" title="Settings error">
          {(settingsQuery.error as Error).message}
        </Alert>
      ) : null}
      {weeksQuery.isError ? (
        <Alert color="red" title="Weeks error">
          {(weeksQuery.error as Error).message}
        </Alert>
      ) : null}

      <Card withBorder padding="md" radius="lg" shadow="sm">
        <Text c="dimmed" fw={600} mb="sm" size="xs">
          Monthly payout goal
        </Text>
        {showInput ? (
          <Group align="flex-end" gap="md" wrap="wrap">
            <NumberInput
              allowNegative={false}
              decimalScale={2}
              fixedDecimalScale
              label="Target per month (withdrawals)"
              maw={280}
              onChange={(n) => {
                setGoalDirty(true);
                setGoalLocal(n === "" || n === undefined ? 0 : Number(n));
              }}
              prefix="$"
              thousandSeparator=","
              value={monthlyValue}
            />
            <Button
              disabled={saveMutation.isPending}
              loading={saveMutation.isPending}
              onClick={() => {
                const n = monthlyValue;
                if (!Number.isFinite(n) || n < 0) {
                  return;
                }
                saveMutation.mutate(n);
              }}
            >
              Save
            </Button>
          </Group>
        ) : null}
        {data ? (
          <Text c="dimmed" mt="md" size="sm">
            Weekly target (monthly ÷ 4): {formatMoney(data.weeklyPayoutTarget)}
            {data.updatedAt ? (
              <Text component="span" c="dimmed" ml="xs" size="xs">
                (saved {new Date(data.updatedAt).toLocaleString()})
              </Text>
            ) : null}
          </Text>
        ) : null}
        {saveMutation.isError ? (
          <Text c="red" mt="sm" size="sm">
            {saveMutation.error.message}
          </Text>
        ) : null}
      </Card>

      <Text fw={600} size="sm">
        Eight weeks: Apr 26 – May 2, 2026, then 7 more through Jun 20, 2026 (Sun–Sat, local)
      </Text>
      {weeksQuery.isLoading ? <Text c="dimmed">Loading…</Text> : null}

      {!weeksQuery.isLoading && weeksQuery.data ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {weeksQuery.data.weeks.map((w) => {
            const isComplete = w.weekStatus === "complete";
            const isProgress = w.weekStatus === "in_progress";
            const isUpcoming = w.weekStatus === "upcoming";
            const borderColor = (() => {
              if (isUpcoming) {
                return "var(--mantine-color-dark-4)";
              }
              if (isProgress) {
                return "var(--mantine-color-blue-6)";
              }
              if (w.met === true) {
                return "var(--mantine-color-teal-6)";
              }
              if (w.met === false) {
                return "var(--mantine-color-red-5)";
              }
              return "var(--mantine-color-dark-4)";
            })();
            return (
            <Card
              h="100%"
              key={w.weekStart}
              p="md"
              radius="lg"
              style={{
                borderColor,
                borderStyle: "solid",
                borderWidth: 1,
                opacity: isUpcoming ? 0.52 : 1,
                pointerEvents: isUpcoming ? "none" : "auto",
              }}
            >
              <Text c="dimmed" size="xs">
                {w.weekLabel}
              </Text>
              <Group justify="space-between" mt="xs" wrap="nowrap">
                <Text fw={600} size="sm">
                  Payout
                </Text>
                {isUpcoming ? (
                  <Badge color="gray" size="sm" variant="light">
                    Upcoming
                  </Badge>
                ) : isProgress ? (
                  <Badge color="blue" size="sm" variant="light">
                    In progress
                  </Badge>
                ) : w.payoutTarget <= 0 ? (
                  <Badge color="gray" size="sm" variant="light">
                    Set a goal
                  </Badge>
                ) : w.met ? (
                  <Badge color="teal" size="sm" variant="light">
                    Met
                  </Badge>
                ) : (
                  <Badge color="red" size="sm" variant="light">
                    Short
                  </Badge>
                )}
              </Group>
              <Text mt={6} size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                <Text c={isUpcoming ? "dimmed" : undefined} component="span" fw={isUpcoming ? 500 : 600}>
                  {isUpcoming ? "—" : formatMoney(w.withdrawalTotal)}
                </Text>
                {w.payoutTarget > 0 && !isUpcoming ? (
                  <Text c="dimmed" component="span" size="sm">
                    {" "}
                    / {formatMoney(w.payoutTarget)} target{isProgress ? " (so far)" : null}
                  </Text>
                ) : null}
              </Text>
              {isComplete && w.met === false && w.payoutTarget > 0 ? (
                <Text c="red" mt={4} size="xs">
                  {formatMoney(w.shortfall)} below target
                </Text>
              ) : null}
              {isUpcoming ? (
                <Text c="dimmed" mt="md" size="xs">
                  Week has not started — no payout yet
                </Text>
              ) : (
                <>
                  {isProgress ? (
                    <Text c="dimmed" mt="md" size="xs">
                      Met / Short are judged after the week ends
                    </Text>
                  ) : null}
                  <Text c="dimmed" mt={isProgress ? 4 : "md"} size="xs">
                    Week futures PnL: {formatMoney(w.futuresPnl)} · 50% ref: {formatMoney(w.halfOfFuturesPnl)}
                  </Text>
                </>
              )}
            </Card>
            );
          })}
        </SimpleGrid>
      ) : null}
    </Stack>
  );
}
