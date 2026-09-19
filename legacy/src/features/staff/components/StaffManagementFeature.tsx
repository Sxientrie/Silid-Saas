import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useStaff } from '../hooks/useStaff'
import { useBranches } from '@/features/rates/hooks/useBranches'
import type { Database } from '@/types/supabase.types'

type StaffUser = Database['public']['Tables']['users']['Row'] & {
  branches?: { name: string }
}

export function StaffManagementFeature() {
  const { staff, isLoading, createUser } = useStaff()
  const { data: branches = [] } = useBranches()
  
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [branchId, setBranchId] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password || !branchId) return

    try {
      await createUser.mutateAsync({
        username,
        password,
        role: 'cashier',
        branch_id: branchId
      })
      setUsername('')
      setPassword('')
      setBranchId('')
      setIsFormOpen(false)
    } catch (err) {
      console.error('Failed to create staff:', err)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <PageHeader 
          title="Staff Management" 
          description="Create and manage cashier credentials" 
        />
        <Button onClick={() => setIsFormOpen(!isFormOpen)}>
          {isFormOpen ? 'Cancel' : 'Add New Cashier'}
        </Button>
      </div>

      {isFormOpen && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="username">Username / ID</Label>
              <Input 
                id="username" 
                placeholder="e.g. jane_doe" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Passcode / PIN</Label>
              <Input 
                id="password" 
                type="password"
                placeholder="Minimum 6 chars" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch">Assigned Branch</Label>
              <select 
                id="branch"
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">Select branch...</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? 'Creating...' : 'Create Account'}
            </Button>
          </form>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-6 py-4 text-xs font-semibold uppercase text-muted-foreground">Cashier Identifier</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase text-muted-foreground">Role</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase text-muted-foreground">Branch</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase text-muted-foreground">Created At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <LoadingSpinner />
                </td>
              </tr>
            ) : staff.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-sm text-muted-foreground">
                  No staff members found.
                </td>
              </tr>
            ) : (
              staff.map((u: StaffUser) => (
                <tr key={u.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">{u.email.replace('@moteltrack.internal', '')}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary capitalize">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">
                    {u.branches?.name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
