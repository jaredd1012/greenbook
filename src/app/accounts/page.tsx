"use client";

import { Alert, Anchor, Card, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

type AccountDto = {
  createdAt: string;
  id: number;
  name: string;
};

async function fetchAccounts() {
  const res = await fetch("/api/accounts", { method: "GET" });
  if (!res.ok) throw new Error("Failed to fetch accounts");
  return (await res.json()) as { accounts: AccountDto[] };
}

export default function AccountsPage() {
  const accountsQuery = useQuery({
    queryFn: fetchAccounts,
    queryKey: ["accounts"],
  });

  const accounts = accountsQuery.data?.accounts ?? [];

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
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : null}
      </Card>
    </Stack>
  );
}

