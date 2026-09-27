import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ISNT",
  description: "Hands-free chat interface controlled through head movement and facial expressions. All camera processing is local.",
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
