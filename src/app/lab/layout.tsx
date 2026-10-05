import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Input Lab",
  description: "Webcam interaction input lab — head, eye and facial signals → intent → GUI actions. All processing is local.",
};

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
