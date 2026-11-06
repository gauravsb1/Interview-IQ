import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

export function errMsg(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (e instanceof Error && e.message) {
    const m = e.message.replace(/^HTTP \d+ [^:]*:?\s*/, "").trim();
    return m || fallback;
  }
  return fallback;
}

export function errStatus(e: unknown): number | undefined {
  if (e && typeof e === "object" && "status" in e) return Number((e as { status: unknown }).status);
  return undefined;
}

export function useAuth() {
  const me = useGetMe({ query: { retry: false, staleTime: 60_000, queryKey: getGetMeQueryKey() } });
  return { user: me.data ?? null, isLoading: me.isLoading };
}

export const CATEGORY_LABEL: Record<string, string> = {
  technical: "Technical",
  hr: "HR",
  behavioral: "Behavioral",
  "company-specific": "Company-specific",
};

export function scoreTone(n: number) {
  if (n >= 75) return "text-[hsl(var(--chart-4))]";
  if (n >= 55) return "text-[hsl(var(--chart-2))]";
  return "text-[hsl(var(--chart-3))]";
}
