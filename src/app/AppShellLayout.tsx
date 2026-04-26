"use client";

import {
  ActionIcon,
  Anchor,
  AppShell,
  Avatar,
  Box,
  Burger,
  Center,
  Group,
  NavLink,
  Stack,
  Title,
} from "@mantine/core";
import {
  IconBell,
  IconCash,
  IconChartPie,
  IconInputAi,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react";
import Link from "next/link";
import { useDisclosure } from "@mantine/hooks";
import { usePathname } from "next/navigation";

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const [opened, { toggle }] = useDisclosure(false);
  const pathname = usePathname();

  return (
    <AppShell
      bg="dark.8"
      header={{ height: 60 }}
      navbar={{
        breakpoint: "sm",
        collapsed: { mobile: !opened },
        width: 76,
      }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" justify="space-between" px="lg">
          <Group gap="sm">
            <Burger hiddenFrom="sm" onClick={toggle} opened={opened} size="sm" />
            <Anchor component={Link} c="inherit" href="/dashboard" underline="never">
              <Title order={4}>Dashboard</Title>
            </Anchor>
          </Group>

          <Group gap="sm">
            <ActionIcon aria-label="Search" color="dark" radius="lg" size="lg" variant="subtle">
              <IconSearch size={18} />
            </ActionIcon>
            <ActionIcon aria-label="Notifications" color="dark" radius="lg" size="lg" variant="subtle">
              <IconBell size={18} />
            </ActionIcon>
            <Avatar radius="xl" size={30} />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar bg="dark.9" p="xs">
        <Stack gap={6} mt={6}>
          <NavLink
            active={pathname === "/dashboard"}
            component={Link}
            href="/dashboard"
            label="Dashboard"
            leftSection={
              <Center>
                <IconChartPie size={18} />
              </Center>
            }
            onClick={() => opened && toggle()}
            px="xs"
            py="sm"
            styles={{
              label: { display: "none" },
              root: { borderRadius: 14 },
            }}
          />
          <NavLink
            active={pathname === "/input"}
            component={Link}
            href="/input"
            label="Input"
            leftSection={
              <Center>
                <IconInputAi size={18} />
              </Center>
            }
            onClick={() => opened && toggle()}
            px="xs"
            py="sm"
            styles={{
              label: { display: "none" },
              root: { borderRadius: 14 },
            }}
          />
          <NavLink
            active={pathname === "/payout"}
            component={Link}
            href="/payout"
            label="Payouts"
            leftSection={
              <Center>
                <IconCash size={18} />
              </Center>
            }
            onClick={() => opened && toggle()}
            px="xs"
            py="sm"
            styles={{
              label: { display: "none" },
              root: { borderRadius: 14 },
            }}
          />
        </Stack>

        <Stack gap={6} mt="auto" pb={6}>
          <NavLink
            active={pathname?.startsWith("/accounts")}
            component={Link}
            href="/accounts"
            label="Accounts"
            leftSection={
              <Center>
                <IconSettings size={18} />
              </Center>
            }
            onClick={() => opened && toggle()}
            px="xs"
            py="sm"
            styles={{
              label: { display: "none" },
              root: { borderRadius: 14 },
            }}
          />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box mx="auto" px="lg" py="lg" w="100%" style={{ maxWidth: 1240 }}>
          {children}
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}

