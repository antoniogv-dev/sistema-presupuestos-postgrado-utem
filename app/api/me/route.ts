import { apiError, requireApiIdentity } from "@/lib/auth/api-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    return Response.json(identity);
  } catch (error) {
    return apiError(error);
  }
}
