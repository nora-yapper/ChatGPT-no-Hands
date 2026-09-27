import { NextResponse } from "next/server";
import { hasCredentials } from "@/server/llm";

export const runtime = "nodejs";

/** GET → { claude }: whether the server has Claude credentials (the sidebar's Offline mode shows it). */
export function GET() {
  return NextResponse.json({ claude: hasCredentials() });
}
