import { redirect } from "next/navigation";

// ISNT is the default view; the Input Lab lives at /lab.
export default function Page() {
  redirect("/chat");
}
