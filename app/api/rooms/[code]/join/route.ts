import { handlers } from "@/lib/server/instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, { params }: Ctx) {
  return handlers.joinRoom(req, (await params).code);
}
