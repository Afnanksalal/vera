import { currentUser, handle } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return Response.json({ user: null }, { status: 401 });
    return Response.json({ user: { id: user.id, email: user.email } });
  });
}
