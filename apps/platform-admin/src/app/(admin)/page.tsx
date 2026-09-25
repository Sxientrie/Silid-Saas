import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const supabase = await createClient();
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <Button asChild>
          <Link href="/organizations/new">New organization</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Tenants</CardTitle>
          <CardDescription>
            Every organization on the platform. Status and branch structure
            are managed per organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(organizations ?? []).map((organization) => (
                <TableRow key={organization.id}>
                  <TableCell>
                    <Link
                      href={`/organizations/${organization.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {organization.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        organization.status === "active" ? "default" : "secondary"
                      }
                    >
                      {organization.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {new Date(organization.created_at).toISOString().slice(0, 10)}
                  </TableCell>
                </TableRow>
              ))}
              {(!organizations || organizations.length === 0) && (
                <TableRow>
                  <TableCell colSpan={3} className="text-zinc-500">
                    No organizations yet — create the first tenant.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
