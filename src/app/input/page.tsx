import InputClient from "./input-client";

type InputPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InputPage({ searchParams }: InputPageProps) {
  const sp = await searchParams;
  const account = typeof sp.account === "string" ? sp.account : "";
  return <InputClient urlAccount={account} />;
}
