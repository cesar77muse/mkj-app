import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

export function ComingSoon({ title, description, body }: { title: string; description?: string; body?: string }) {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {body ?? "This module is being wired up for the MVP demo. The database, roles, and RLS are already in place — the UI is the next step."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
