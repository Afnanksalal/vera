import { integrationOperations } from "@/server/chat-integrations";
import { handle, requireUser } from "@/server/http";
import { operationalStatus } from "@/server/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return Response.json({ ...integrationOperations(user.id), system: operationalStatus(user.id) });
  });
}
