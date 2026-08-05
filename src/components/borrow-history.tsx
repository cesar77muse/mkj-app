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

/** Borrow movements (out/in, plus their returns) for a project, so it's clear where stock went. */
export function BorrowHistory({ projectId, title = "Borrow history" }: { projectId?: string; title?: string }) {
  const { data } = useQuery({
    queryKey: ["borrow-history", projectId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("inventory_adjustments")
        .select("id, created_at, delta, source_type, reason, project_id, products:product_id(part_number, description)")
        .in("source_type", ["borrow_in", "borrow_out", "borrow_return_in", "borrow_return_out"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (projectId) q = q.eq("project_id", projectId);
      const { data } = await q;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
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
            {data && data.length > 0 ? data.map((r) => {
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
