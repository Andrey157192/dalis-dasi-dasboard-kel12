import { FarmScopeAuthPanel } from '@/components/farmscope-auth-panel'
import { FarmScopeWorkbookDashboard } from '@/components/farmscope-workbook-dashboard'
import { createClient } from '@/lib/supabase/server'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <FarmScopeAuthPanel />

  return <FarmScopeWorkbookDashboard userId={user.id} email={user.email ?? ''} />
}
