import { redirect } from "next/navigation";

export default function OptionsRedirectPage() {
  redirect("/input?account=Mortgage");
}
