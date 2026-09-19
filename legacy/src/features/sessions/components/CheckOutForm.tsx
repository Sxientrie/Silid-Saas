

export function CheckOutForm({ sessionId }: { sessionId: string }) {
  return (
    <div className="p-4 border border-border rounded-md bg-card">
      <h3 className="text-lg font-semibold mb-2">Check Out Session {sessionId}</h3>
      <p className="text-sm text-muted-foreground">Check-out logic pending implementation.</p>
    </div>
  )
}
