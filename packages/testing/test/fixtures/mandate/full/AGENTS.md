# Silid — agent instructions (repo root)

- Use the Supabase MCP server for every database task.
- Load the official Supabase agent skill (`npx skills add supabase/agent-skills`).
- Forbidden: `psql`, a credentialed connection string, a `service_role` key
  in any client.
