"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { showNotification } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

type AccountConfigDto = {
  account: {
    createdAt: string;
    id: number;
    dailyPnlGoal: number | null;
    monthlyPnlGoal: number | null;
    name: string;
    weeklyPnlGoal: number | null;
    withdrawBalanceThreshold: number | null;
    withdrawMinWinCount: number | null;
    withdrawMinWinPnl: number | null;
  };
  balance: number;
  withdrawStatus: {
    eligible: boolean;
    lastWithdrawalAt: string | null;
    since: string;
    winCountSince: number;
  };
  ledger: Array<{
    amount: number;
    createdAt: string;
    id: number;
    note: string | null;
    type: string;
  }>;
};

async function fetchAccountConfig(accountId: string) {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to fetch account config");
  return (await res.json()) as AccountConfigDto;
}

async function postInitialBalance(accountId: string, amount: number, note: string) {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/initial-balance`, {
    body: JSON.stringify({ amount, note }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as null | { error?: string };
    throw new Error(data?.error ?? "Failed to set initial balance");
  }
  return (await res.json()) as { ok: boolean };
}

async function postLedgerEntry(accountId: string, amount: number, note: string, type: "DEPOSIT" | "WITHDRAWAL") {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}`, {
    body: JSON.stringify({ amount, note, type }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as null | { error?: string };
    throw new Error(data?.error ?? "Failed to add ledger entry");
  }
  return (await res.json()) as { id: number; ok: true };
}

async function deleteAccount(accountId: string) {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as null | { error?: string };
    throw new Error(data?.error ?? "Failed to delete account");
  }
  return (await res.json()) as { ok: true };
}

async function putWithdrawCriteria(
  accountId: string,
  criteria: {
    dailyPnlGoal: number | null;
    monthlyPnlGoal: number | null;
    weeklyPnlGoal: number | null;
    withdrawBalanceThreshold: number | null;
    withdrawMinWinCount: number | null;
    withdrawMinWinPnl: number | null;
  },
) {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}`, {
    body: JSON.stringify(criteria),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as null | { error?: string };
    throw new Error(data?.error ?? "Failed to save withdrawal criteria");
  }
  return (await res.json()) as { ok: true };
}

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  });
}

export default function AccountConfigPage() {
  const queryClient = useQueryClient();
  const params = useParams<{ accountId: string }>();
  const router = useRouter();
  const accountId = params.accountId;
  const [deleteOpened, { close: closeDelete, open: openDelete }] = useDisclosure(false);

  const [initialAmount, setInitialAmount] = useState("");
  const [initialNote, setInitialNote] = useState("Starting balance (manual)");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [monthlyPnlGoal, setMonthlyPnlGoal] = useState("");
  const [withdrawBalanceThreshold, setWithdrawBalanceThreshold] = useState("");
  const [withdrawMinWinCount, setWithdrawMinWinCount] = useState("");
  const [withdrawMinWinPnl, setWithdrawMinWinPnl] = useState("");

  const configQuery = useQuery({
    queryFn: () => fetchAccountConfig(accountId),
    queryKey: ["account-config", accountId],
  });

  const saveCriteriaMutation = useMutation({
    mutationFn: async () =>
      putWithdrawCriteria(accountId, {
        dailyPnlGoal: criteria?.dailyPnlGoal ?? null,
        monthlyPnlGoal: monthlyPnlGoal.trim() ? Number(monthlyPnlGoal) : null,
        weeklyPnlGoal: null,
        withdrawBalanceThreshold: withdrawBalanceThreshold.trim() ? Number(withdrawBalanceThreshold) : null,
        withdrawMinWinCount: withdrawMinWinCount.trim() ? Number(withdrawMinWinCount) : null,
        withdrawMinWinPnl: withdrawMinWinPnl.trim() ? Number(withdrawMinWinPnl) : null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["account-config", accountId] });
    },
  });

  const setInitialMutation = useMutation({
    mutationFn: async () => postInitialBalance(accountId, Number(initialAmount), initialNote),
    onSuccess: async () => {
      setInitialAmount("");
      await queryClient.invalidateQueries({ queryKey: ["account-config", accountId] });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => postLedgerEntry(accountId, Number(withdrawAmount), withdrawNote, "WITHDRAWAL"),
    onSuccess: async () => {
      setWithdrawAmount("");
      setWithdrawNote("");
      await queryClient.invalidateQueries({ queryKey: ["account-config", accountId] });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccount(accountId),
    onError: (err: Error) => {
      showNotification({ color: "red", message: err.message, title: "Delete failed" });
    },
    onSuccess: async () => {
      closeDelete();
      showNotification({ color: "teal", message: "Account removed.", title: "Deleted" });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["stats", "accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["stats", "pnl"] });
      router.push("/accounts");
    },
  });

  const accountName = configQuery.data?.account.name ?? `Account #${accountId}`;
  const balance = configQuery.data?.balance ?? 0;
  const balanceIsPositive = balance >= 0;

  const ledger = configQuery.data?.ledger ?? [];
  const initialEntry = ledger.find((l) => l.type === "INITIAL") ?? null;
  const withdrawStatus = configQuery.data?.withdrawStatus ?? {
    eligible: false,
    lastWithdrawalAt: null,
    since: "1970-01-01T00:00:00.000Z",
    winCountSince: 0,
  };

  const criteria = configQuery.data?.account ?? null;

  return (
    <Stack gap="lg" py="lg">
      <div>
        <Title order={2}>{accountName}</Title>
        <Text c="dimmed" mt={4} size="sm">
          Set an initial balance (so you can start tracking from last week), and record withdrawals.
        </Text>
      </div>

      {configQuery.isError ? (
        <Alert color="red" title="Account config error">
          {(configQuery.error as Error).message}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Card withBorder padding="md" radius="lg" shadow="sm">
          <Text c="dimmed" fw={600} size="xs">
            Current balance
          </Text>
          <Text
            c={balanceIsPositive ? "green" : "red"}
            fw={800}
            mt={6}
            size="xl"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatMoney(balance)}
          </Text>
          <Text c="dimmed" mt={6} size="xs">
            Computed from initial balance − withdrawals.
          </Text>
        </Card>

        <Card withBorder padding="md" radius="lg" shadow="sm">
          <Text c="dimmed" fw={600} size="xs">
            Initial balance
          </Text>

          <Text mt={6} size="sm">
            {initialEntry ? (
              <>
                Set to{" "}
                <Text component="span" fw={700} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(initialEntry.amount)}
                </Text>{" "}
                <Text component="span" c="dimmed" size="xs">
                  ({new Date(initialEntry.createdAt).toLocaleString()})
                </Text>
              </>
            ) : (
              <Text component="span" c="dimmed">
                Not set yet.
              </Text>
            )}
          </Text>

          <SimpleGrid cols={{ base: 1, sm: 3 }} mt="md" spacing="sm">
            <TextInput
              inputMode="decimal"
              label="Amount"
              onChange={(e) => setInitialAmount(e.currentTarget.value)}
              placeholder="10000"
              value={initialAmount}
            />
            <TextInput
              label="Note"
              onChange={(e) => setInitialNote(e.currentTarget.value)}
              value={initialNote}
            />
            <Group align="end">
              <Button
                disabled={!initialAmount.trim() || setInitialMutation.isPending}
                fullWidth
                onClick={() => setInitialMutation.mutate()}
              >
                {setInitialMutation.isPending ? "Saving…" : "Set initial balance"}
              </Button>
            </Group>
          </SimpleGrid>

          {setInitialMutation.isError ? (
            <Text c="red" mt="sm" size="sm">
              {setInitialMutation.error.message}
            </Text>
          ) : null}
        </Card>
      </SimpleGrid>

      <Card withBorder padding="md" radius="lg" shadow="sm">
        <Group justify="space-between" mb={6}>
          <Text fw={700} size="sm">
            Withdrawal criteria
          </Text>
          <Badge color={withdrawStatus.eligible ? "green" : "gray"} variant="light">
            {withdrawStatus.eligible ? "eligible to withdraw" : "not eligible"}
          </Badge>
        </Group>

        <Text c="dimmed" mb="md" size="xs">
          Since last withdrawal: {new Date(withdrawStatus.since).toLocaleString()} • Wins ≥{" "}
          {criteria?.withdrawMinWinPnl ?? 150}: {withdrawStatus.winCountSince}
        </Text>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput
            inputMode="decimal"
            label="Weekly goal (monthly / 4)"
            readOnly
            value={
              criteria?.monthlyPnlGoal !== null && criteria?.monthlyPnlGoal !== undefined
                ? String(criteria.monthlyPnlGoal / 4)
                : ""
            }
          />
          <TextInput
            inputMode="decimal"
            label="Monthly goal"
            onChange={(e) => setMonthlyPnlGoal(e.currentTarget.value)}
            placeholder={criteria?.monthlyPnlGoal?.toString() ?? "—"}
            value={monthlyPnlGoal}
          />
          <TextInput
            inputMode="decimal"
            label="Balance ≥"
            onChange={(e) => setWithdrawBalanceThreshold(e.currentTarget.value)}
            placeholder={criteria?.withdrawBalanceThreshold?.toString() ?? "2000"}
            value={withdrawBalanceThreshold}
          />
          <TextInput
            inputMode="numeric"
            label="Wins count ≥"
            onChange={(e) => setWithdrawMinWinCount(e.currentTarget.value)}
            placeholder={criteria?.withdrawMinWinCount?.toString() ?? "5"}
            value={withdrawMinWinCount}
          />
          <TextInput
            inputMode="decimal"
            label="Win PnL ≥"
            onChange={(e) => setWithdrawMinWinPnl(e.currentTarget.value)}
            placeholder={criteria?.withdrawMinWinPnl?.toString() ?? "150"}
            value={withdrawMinWinPnl}
          />
        </SimpleGrid>

        <Group mt="md">
          <Button disabled={saveCriteriaMutation.isPending} onClick={() => saveCriteriaMutation.mutate()} variant="light">
            {saveCriteriaMutation.isPending ? "Saving…" : "Save criteria"}
          </Button>
          {saveCriteriaMutation.isError ? (
            <Text c="red" size="sm">
              {saveCriteriaMutation.error.message}
            </Text>
          ) : null}
        </Group>
      </Card>

      <Card withBorder padding="md" radius="lg" shadow="sm">
        <Text fw={700} mb="sm" size="sm">
          Withdrawal
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput
            inputMode="decimal"
            label="Amount"
            onChange={(e) => setWithdrawAmount(e.currentTarget.value)}
            placeholder="250"
            value={withdrawAmount}
          />
          <TextInput
            label="Note"
            onChange={(e) => setWithdrawNote(e.currentTarget.value)}
            placeholder="Optional"
            value={withdrawNote}
          />
          <Group align="end">
            <Button
              disabled={!withdrawAmount.trim() || withdrawMutation.isPending}
              fullWidth
              onClick={() => withdrawMutation.mutate()}
              variant="light"
            >
              {withdrawMutation.isPending ? "Adding…" : "Add withdrawal"}
            </Button>
          </Group>
        </SimpleGrid>
        {withdrawMutation.isError ? (
          <Text c="red" mt="sm" size="sm">
            {withdrawMutation.error.message}
          </Text>
        ) : null}
      </Card>

      <Card withBorder padding="md" radius="lg" shadow="sm">
        <Text c="dimmed" fw={600} mb="sm" size="xs">
          Balance history
        </Text>

        {configQuery.isLoading ? <Text c="dimmed">Loading…</Text> : null}
        {!configQuery.isLoading && ledger.length === 0 ? <Text c="dimmed">No balance entries yet.</Text> : null}

        {ledger.length > 0 ? (
          <Table highlightOnHover striped withRowBorders withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th style={{ textAlign: "right" }}>Amount</Table.Th>
                <Table.Th>Note</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {ledger.map((l) => (
                <Table.Tr key={l.id}>
                  <Table.Td>
                    <Text fw={600} size="sm">
                      {l.type}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{new Date(l.createdAt).toLocaleString()}</Text>
                  </Table.Td>
                  <Table.Td style={{ textAlign: "right" }}>
                    <Text
                      c={l.amount >= 0 ? "green" : "red"}
                      fw={700}
                      size="sm"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatMoney(l.amount)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{l.note ?? "—"}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : null}
      </Card>

      {configQuery.data?.account.name && configQuery.data.account.name !== "Mortgage" ? (
        <Card p="md" radius="lg" withBorder>
          <Text c="red" fw={700} size="sm">
            Delete account
          </Text>
          <Text c="dimmed" mt="xs" size="sm">
            Remove this account and all related trades, ingested logs, options data, and balance history.
          </Text>
          <Button
            color="red"
            loading={deleteAccountMutation.isPending}
            mt="md"
            onClick={openDelete}
            variant="light"
          >
            Delete account…
          </Button>
        </Card>
      ) : null}

      <Modal
        centered
        onClose={() => {
          if (!deleteAccountMutation.isPending) {
            closeDelete();
          }
        }}
        opened={deleteOpened}
        title="Delete this account?"
      >
        <Stack gap="md">
          <Text size="sm">
            This will permanently remove <strong>{accountName}</strong> and all related data. This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button
              disabled={deleteAccountMutation.isPending}
              onClick={closeDelete}
              variant="default"
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleteAccountMutation.isPending}
              onClick={() => deleteAccountMutation.mutate()}
            >
              Delete account
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

