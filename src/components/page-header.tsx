import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
  backTo,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  backTo?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          {backTo ? (
            <Button variant="ghost" size="icon" className="-ml-2 h-8 w-8" asChild>
              <Link to={backTo}><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
