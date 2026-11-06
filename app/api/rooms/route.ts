import { handlers } from "@/lib/server/instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handlers.createRoom(req);
}
