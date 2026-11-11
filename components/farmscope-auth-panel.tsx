'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, PawPrint } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function FarmScopeAuthPanel() {
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(formData: FormData) {
    setBusy(true)
    setMessage('')
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const supabase = createClient()

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setMessage(error.message.includes('already registered') ? 'Email atau kata sandi tidak valid.' : error.message)
      } else if (data.session) {
        router.refresh()
      } else {
        setMessage('Akun dibuat. Periksa email untuk mengonfirmasi akun sebelum masuk.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage(error.message.toLowerCase().includes('email not confirmed')
          ? 'Konfirmasi email terlebih dahulu, lalu masuk kembali.'
          : 'Email atau kata sandi tidak valid.')
      } else {
        router.refresh()
      }
    }

    setBusy(false)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7f8] p-4 text-[#202b3a]">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_24px_80px_rgba(25,45,65,.10)] sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#007f77] text-[#b5fff2]"><PawPrint size={25} /></div>
          <div><p className="text-xl font-bold tracking-tight">FarmScope</p><p className="text-sm text-slate-500">Dashboard data peternakan</p></div>
        </div>
        <div className="mb-6 rounded-xl border border-teal-100 bg-teal-50 p-3.5 text-sm leading-5 text-teal-900">
          <p className="flex items-center gap-2 font-semibold"><Database size={16} /> Data tersimpan di Supabase</p>
          <p className="mt-1 text-xs text-teal-800">Setiap akun hanya dapat melihat dan mengubah data miliknya.</p>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{mode === 'signin' ? 'Masuk ke FarmScope' : 'Buat akun FarmScope'}</h1>
        <p className="mt-1 text-sm text-slate-500">{mode === 'signin' ? 'Masuk untuk mengelola data dan melihat pembaruan realtime.' : 'Daftarkan email untuk mulai menyimpan data.'}</p>
        <form action={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Email
            <input name="email" type="email" autoComplete="email" required className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Kata sandi
            <input name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
          </label>
          {message && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-900">{message}</p>}
          <button disabled={busy} className="h-11 w-full rounded-xl bg-[#087f77] text-sm font-semibold text-white transition hover:bg-[#066b65] disabled:cursor-wait disabled:opacity-60">
            {busy ? 'Memproses…' : mode === 'signin' ? 'Masuk' : 'Daftar'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-600">
          {mode === 'signin' ? 'Belum punya akun?' : 'Sudah memiliki akun?'}{' '}
          <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage('') }} className="font-semibold text-teal-800 underline-offset-4 hover:underline">
            {mode === 'signin' ? 'Daftar' : 'Masuk'}
          </button>
        </p>
      </section>
    </main>
  )
}
