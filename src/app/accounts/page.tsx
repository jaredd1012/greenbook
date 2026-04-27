"use client";

import { Alert, Anchor, Button, Card, Group, Modal, Stack, Table, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { showNotification } from "@mantine/notifications";
import { IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

type AccountDto = {
  createdAt: string;
  id: number;
  name: string;
};

async function deleteAccount(id: number) {
  const res = await fetch(`/api/accounts/${encodeURIComponent(String(id))}`, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as null | { error?: string };
    throw new Error(data?.error ?? "Failed to delete account");
  }
  return (await res.json()) as { ok: true };
}

async function fetchAccounts() {
  const res = await fetch("/api/accounts", { method: "GET" });
  if (!res.ok) throw new Error("Failed to fetch accounts");
  return (await res.json()) as { accounts: AccountDto[] };
}

export default function AccountsPage() {
  const [deleteTarget, setDeleteTarget] = useState<AccountDto | null>(null);
  const [deleteOpened, { close: closeDelete, open: openDelete }] = useDisclosure(false);
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryFn: fetchAccounts,
    queryKey: ["accounts"],
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onError: (err: Error) => {
      showNotification({ color: "red", message: err.message, title: "Delete failed" });
    },
    onSuccess: async () => {
      closeDelete();
      setDeleteTarget(null);
      showNotification({ color: "teal", message: "Account removed.", title: "Deleted" });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["stats", "accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["stats", "pnl"] });
    },
  });

  const accounts = accountsQuery.data?.accounts ?? [];

  const onRequestDelete = (a: AccountDto) => {
    setDeleteTarget(a);
    openDelete();
  };

  return (
    <Stack gap="lg" py="lg">
      <div>
        <Title order={2}>Accounts</Title>
        <Text c="dimmed" mt={4} size="sm">
          Open an account to configure balances and withdrawals.
        </Text>
      </div>

      {accountsQuery.isError ? (
        <Alert color="red" title="Accounts error">
          {(accountsQuery.error as Error).message}
        </Alert>
      ) : null}

      <Card withBorder padding="md" radius="lg" shadow="sm">
        {accountsQuery.isLoading ? <Text c="dimmed">Loading…</Text> : null}
        {!accountsQuery.isLoading && accounts.length === 0 ? <Text c="dimmed">No accounts yet.</Text> : null}

        {accounts.length > 0 ? (
          <Table highlightOnHover striped withRowBorders withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th style={{ textAlign: "right" }}>Config</Table.Th>
                <Table.Th style={{ textAlign: "right" }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {accounts.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <Text fw={600} size="sm">
                      {a.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{new Date(a.createdAt).toLocaleString()}</Text>
                  </Table.Td>
                  <Table.Td style={{ textAlign: "right" }}>
                    <Anchor component={Link} fw={600} href={`/accounts/${a.id}`} size="sm">
                      Open →
                    </Anchor>
                  </Table.Td>
                  <Table.Td style={{ textAlign: "right" }}>
                    {a.name === "Mortgage" ? (
                      <Text c="dimmed" size="xs">
                        —
                      </Text>
                    ) : (
                      <Button
                        color="red"
                        leftSection={<IconTrash size={16} />}
                        onClick={() => onRequestDelete(a)}
                        size="xs"
                        variant="light"
                      >
                        Delete
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : null}
      </Card>

      <Modal
        centered
        onClose={() => {
          if (!deleteMutation.isPending) {
            closeDelete();
            setDeleteTarget(null);
          }
        }}
        opened={deleteOpened}
        title="Delete this account?"
      >
        <Stack gap="md">
          <Text size="sm">
            This will permanently remove <strong>{deleteTarget?.name}</strong> and all related data: trades, ingested
            logs, options rows, and balance history. This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => {
                closeDelete();
                setDeleteTarget(null);
              }}
              variant="default"
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              Delete account
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
