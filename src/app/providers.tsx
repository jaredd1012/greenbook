"use client";

import { createTheme, MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Notifications } from "@mantine/notifications";
import { useState } from "react";

const theme = createTheme({
  black: "#0b1220",
  colors: {
    dark: [
      "#dbe4ff",
      "#b9c7f0",
      "#93a5d6",
      "#6e86c0",
      "#4c67aa",
      "#385495",
      "#2a437a",
      "#1b2f58",
      "#121f3c",
      "#0b1220",
    ],
  },
  defaultRadius: "lg",
  fontFamily: "var(--font-geist-sans), system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  headings: {
    fontFamily: "var(--font-geist-sans), system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    fontWeight: "700",
  },
  primaryColor: "teal",
  radius: {
    lg: "16px",
    md: "14px",
    sm: "12px",
    xl: "20px",
  },
  shadows: {
    md: "0 10px 25px rgba(0, 0, 0, 0.25)",
    sm: "0 6px 14px rgba(0, 0, 0, 0.18)",
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider defaultColorScheme="dark" forceColorScheme="dark" theme={theme}>
        <Notifications position="top-right" />
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
}

