"use client";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "./providers";
import { fetchJSON } from "@/lib/offline/sync";
import { Badge } from "./ui/common";
export function ConnectionStatus() {
  const { session } = useWorkspace();
  const { data, error, isLoading } = useQuery({
    queryKey: ["configuration", session.user_id],
    enabled: !session.demo,
    queryFn: () =>
      fetchJSON<{ storage: string }>(
        `/api/configuration?org=${session.org_id}`,
      ),
  });
  if (session.demo) return <Badge status="hold">Demo · stored locally</Badge>;
  return (
    <Badge status={data?.storage === "configured_unverified" ? "pass" : "hold"}>
      {isLoading
        ? "Checking…"
        : error
          ? "Unable to verify"
          : data?.storage === "configured_unverified"
            ? "Configured · test an upload"
            : "Unconfigured"}
    </Badge>
  );
}
