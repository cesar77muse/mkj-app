import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

type Row = {
  id: string;
  created_at: string;
  delta: number;
  source_type: string;
  reason: string | null;
  project_id: string;
  products: { part_number: string; description: string } | null;
};

const BORROW_HISTORY_LIMIT = 50;

/** Borrow movements (out/in, plus their returns) for a project, so it's clear where stock went. */
export function BorrowHistory({ projectId, title = "Borrow history" }: { projectId?: string; title?: string }) {
  const { data } = useQuery({
    queryKey: ["borrow-history", projectId ?? "all"],
    queryFn: async () => {
      // Fetch one past the cap so a full page can be told apart from a
      // truncated one, instead of silently dropping anything past the limit.
      let q = supabase
        .from("inventory_adjustments")
        .select("id, created_at, delta, source_type, reason, project_id, products:product_id(part_number, description)")
        .in("source_type", ["borrow_in", "borrow_out", "borrow_return_in", "borrow_return_out"])
        .order("created_at", { ascending: false })
        .limit(BORROW_HISTORY_LIMIT + 1);
      if (projectId) q = q.eq("project_id", projectId);
      const { data } = await q;
      const rows = (data ?? []) as unknown as Row[];
      return { rows: rows.slice(0, BORROW_HISTORY_LIMIT), truncated: rows.length > BORROW_HISTORY_LIMIT };
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      {data?.truncated ? (
        <p className="px-6 text-xs text-muted-foreground">Showing the most recent {BORROW_HISTORY_LIMIT} movements.</p>
      ) : null}
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Movement</TableHead>
            <TableHead>Part #</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data && data.rows.length > 0 ? data.rows.map((r) => {
              const isReturn = r.source_type === "borrow_return_out" || r.source_type === "borrow_return_in";
              const out = r.source_type === "borrow_out" || r.source_type === "borrow_return_out";
              return (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={out ? "destructive" : "default"} className="gap-1">
                      {out ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                      {isReturn ? (out ? "Returned out" : "Returned in") : (out ? "Borrowed out" : "Borrowed in")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.products?.part_number}</TableCell>
                  <TableCell className="text-right font-semibold">{Math.abs(Number(r.delta))}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reason ?? "—"}</TableCell>
                </TableRow>
              );
            }) : (
              <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No borrow movements yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
