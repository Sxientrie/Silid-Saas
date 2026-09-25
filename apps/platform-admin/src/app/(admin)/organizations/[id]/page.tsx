import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BranchForm, ProvisionForm, StatusForm } from "./forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!organization) notFound();

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, created_at")
    .eq("org_id", id)
    .order("created_at");

  const { data: admins } = await supabase
    .from("staff")
    .select("id, email, display_name, role, is_active")
    .eq("org_id", id)
    .order("created_at");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{organization.name}</h1>
        <div className="flex items-center gap-3">
          <Badge
            variant={organization.status === "active" ? "default" : "secondary"}
            data-testid="org-status"
          >
            {organization.status}
          </Badge>
          <StatusForm orgId={organization.id} status={organization.status} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Branch structure</CardTitle>
          <CardDescription>
            Front-desk branches operating under this organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(branches ?? []).map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell className="text-zinc-500">
                    {new Date(branch.created_at).toISOString().slice(0, 10)}
                  </TableCell>
                </TableRow>
              ))}
              {(!branches || branches.length === 0) && (
                <TableRow>
                  <TableCell colSpan={2} className="text-zinc-500">
                    No branches yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <BranchForm orgId={organization.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
          <CardDescription>
            Provisioned accounts for this organization. Accounts are created
            only through the server provisioning path.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(admins ?? []).map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.display_name}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{member.role}</TableCell>
                  <TableCell>
                    <Badge variant={member.is_active ? "default" : "secondary"}>
                      {member.is_active ? "active" : "inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(!admins || admins.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-zinc-500">
                    No staff accounts yet — provision the first administrator
                    below.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <ProvisionForm orgId={organization.id} />
        </CardContent>
      </Card>
    </div>
  );
}
