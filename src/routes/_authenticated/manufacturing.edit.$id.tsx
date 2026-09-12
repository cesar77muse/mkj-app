import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { BuildRequestForm } from "@/components/build-request-form";
import { Button } from "@/components/ui/button";
import { useBuildRequest } from "@/lib/build-requests";

// Kept off /manufacturing/$id/... so it doesn't nest under the detail page.
export const Route = createFileRoute("/_authenticated/manufacturing/edit/$id")({
  head: () => ({ meta: [{ title: "Edit build request — MKJ Ops" }] }),
  component: EditBuildRequestPage,
});

function EditBuildRequestPage() {
  const { id } = Route.useParams();
  const query = useBuildRequest(id);

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const request = query.data?.request;
  if (!request) return <p className="text-sm text-muted-foreground">Build request not found.</p>;

  if (request.status !== "draft" && request.status !== "rejected") {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <PageHeader title={`Edit ${request.request_number}`} backTo={`/manufacturing/${id}`} />
        <p className="text-sm text-muted-foreground">
          Only drafts and rejected requests can be edited. Pull a submitted request back to draft first.
        </p>
        <Button variant="outline" asChild>
          <Link to="/manufacturing/$id" params={{ id }}>Back to {request.request_number}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Edit ${request.request_number}`}
        description={request.status === "rejected" ? "Saving turns it back into a draft. Submit it again when it's ready." : undefined}
        backTo={`/manufacturing/${id}`}
      />
      <BuildRequestForm key={request.id} request={request} />
    </div>
  );
}
