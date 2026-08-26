import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startOperationsWorker } = await import("./server/operations-worker");
  startOperationsWorker();
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("./server/logger");
  log("error", "request.unhandled_error", {
    method: request.method,
    path: request.path.split("?", 1)[0],
    route: context.routePath,
    route_type: context.routeType,
    message: error instanceof Error ? error.message : String(error),
    digest: typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined,
  });
};
