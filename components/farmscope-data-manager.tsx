'use client'

import { useState, type FormEvent } from 'react'
import { Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Row = Record<string, unknown>
type SaveRecord = (id: string | null, formData: FormData) => Promise<boolean>
type DeleteRecord = (id: string) => Promise<void>

const value = (row: Row, key: string) => String(row[key] ?? '')
const number = (input: unknown) => Number.isFinite(Number(input)) && input !== null && input !== '' ? Number(input) : null
const format = (input: unknown) => number(input) === null ? '—' : new Intl.NumberFormat('id-ID').format(number(input)!)

function Field({ label, name, type = 'text', initialValue, required = false, step }: { label: string; name: string; type?: string; initialValue?: string; required?: boolean; step?: string }) {
  return <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">{label}
    <input name={name} type={type} required={required} step={step} defaultValue={initialValue} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
  </label>
}

export function FarmManager({ farms, onSave, onDelete }: { farms: Row[]; onSave: SaveRecord; onDelete: DeleteRecord }) {
  const [editing, setEditing] = useState<Row | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const form = event.currentTarget
    const saved = await onSave(editing ? value(editing, '__id') : null, new FormData(form))
    setSaving(false)
    if (saved) {
      setEditing(null)
      form.reset()
    }
  }

  return <Card className="mb-5">
    <CardHeader><CardTitle>Pengelolaan data peternak</CardTitle><p className="text-sm text-slate-500">Tambah, ubah, atau hapus profil peternakan. Perubahan langsung tersimpan ke Supabase.</p></CardHeader>
    <CardContent>
      <form key={editing ? value(editing, '__id') : 'new-farm'} onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="ID peternak" name="farm_code" initialValue={value(editing ?? {}, 'id_peternak')} required />
        <Field label="Nama peternakan" name="farm_name" initialValue={value(editing ?? {}, 'nama_peternakan')} required />
        <Field label="Nama responden" name="respondent" initialValue={value(editing ?? {}, 'nama_responden')} />
        <Field label="Lokasi" name="location" initialValue={value(editing ?? {}, 'lokasi_peternakan')} />
        <Field label="Jumlah ternak" name="herd_size" type="number" step="any" initialValue={value(editing ?? {}, 'jumlah_ternak')} />
        <Field label="Skala peternakan" name="farm_scale" initialValue={value(editing ?? {}, 'skala_peternakan')} />
        <Field label="Sumber data" name="source" initialValue={value(editing ?? {}, 'sumber_data')} />
        <div className="flex items-end gap-2">
          <button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">{editing ? <Save size={16} /> : <Plus size={16} />}{editing ? 'Simpan perubahan' : 'Tambah peternak'}</button>
          {editing && <button type="button" onClick={() => setEditing(null)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"><X size={15} />Batal</button>}
        </div>
      </form>
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['ID', 'Peternakan', 'Lokasi', 'Ternak', 'Skala', 'Aksi'].map((title) => <th key={title} className="px-4 py-3">{title}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{farms.length ? farms.map((farm) => <tr key={value(farm, '__id')}><td className="px-4 py-3 font-medium text-slate-800">{value(farm, 'id_peternak')}</td><td className="px-4 py-3 text-slate-700">{value(farm, 'nama_peternakan')}</td><td className="px-4 py-3 text-slate-700">{value(farm, 'lokasi_peternakan') || '—'}</td><td className="px-4 py-3 text-slate-700">{format(farm.jumlah_ternak)}</td><td className="px-4 py-3 text-slate-700">{value(farm, 'skala_peternakan') || '—'}</td><td className="px-4 py-3"><div className="flex gap-2"><button type="button" onClick={() => setEditing(farm)} aria-label={`Ubah ${value(farm, 'id_peternak')}`} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:text-teal-800"><Pencil size={15} /></button><button type="button" onClick={() => window.confirm(`Hapus peternak ${value(farm, 'id_peternak')}?`) && void onDelete(value(farm, '__id'))} aria-label={`Hapus ${value(farm, 'id_peternak')}`} className="rounded-lg border border-rose-100 p-2 text-rose-700 hover:bg-rose-50"><Trash2 size={15} /></button></div></td></tr>) : <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Belum ada data peternakan. Tambahkan di formulir atau impor workbook.</td></tr>}</tbody>
        </table>
      </div>
    </CardContent>
  </Card>
}

const transactionFields = [
  ['id_peternak', 'ID peternak', 'text'],
  ['tanggal_penjualan', 'Tanggal jual', 'date'],
  ['lokasi_penjualan', 'Lokasi penjualan', 'text'],
  ['kategori_babi', 'Kategori babi', 'text'],
  ['berat_badan_kg', 'Berat badan (kg)', 'number'],
  ['jumlah_ekor_terjual', 'Jumlah ekor', 'number'],
  ['harga_jual_per_kg', 'Harga jual / kg (Rp)', 'number'],
  ['daerah_asal', 'Daerah asal', 'text'],
  ['daerah_tujuan', 'Daerah tujuan', 'text'],
  ['harga_titik_tujuan_per_kg', 'Harga titik tujuan / kg', 'number'],
]

export function TransactionManager({ rows, onUpdate, onDelete }: { rows: Row[]; onUpdate: (id: string, formData: FormData) => Promise<boolean>; onDelete: DeleteRecord }) {
  const [editing, setEditing] = useState<Row | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    setSaving(true)
    const form = event.currentTarget
    const saved = await onUpdate(value(editing, '__id'), new FormData(form))
    setSaving(false)
    if (saved) setEditing(null)
  }

  return <>
    {editing && <Card className="mb-5"><CardHeader><CardTitle>Ubah transaksi {value(editing, 'id_transaksi')}</CardTitle></CardHeader><CardContent><form key={value(editing, '__id')} onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {transactionFields.map(([key, label, type]) => <Field key={key} label={label} name={key} type={type} step={type === 'number' ? 'any' : undefined} required={['berat_badan_kg', 'jumlah_ekor_terjual', 'harga_jual_per_kg'].includes(key)} initialValue={type === 'date' ? value(editing, key).slice(0, 10) : value(editing, key)} />)}
      <div className="flex items-end gap-2"><button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white"><Check size={16} />Simpan</button><button type="button" onClick={() => setEditing(null)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"><X size={15} />Batal</button></div>
    </form></CardContent></Card>}
    <Card><CardHeader><CardTitle>Data transaksi ({new Intl.NumberFormat('id-ID').format(rows.length)})</CardTitle></CardHeader><CardContent className="p-0"><div className="max-h-[480px] overflow-auto"><table className="w-full min-w-[1150px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['ID transaksi', 'ID peternak', 'Tanggal', 'Lokasi', 'Kategori', 'Berat (kg)', 'Ekor', 'Harga / kg', 'Total', 'Asal', 'Tujuan', 'Aksi'].map((column) => <th key={column} className="px-4 py-3">{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.length ? rows.map((row) => <tr key={value(row, '__id')} className="hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{value(row, 'id_transaksi')}</td><td className="px-4 py-3">{value(row, 'id_peternak') || '—'}</td><td className="whitespace-nowrap px-4 py-3">{value(row, 'tanggal_penjualan') || '—'}</td><td className="px-4 py-3">{value(row, 'lokasi_penjualan') || '—'}</td><td className="px-4 py-3">{value(row, 'kategori_babi') || '—'}</td><td className="px-4 py-3">{format(row.berat_badan_kg)}</td><td className="px-4 py-3">{format(row.jumlah_ekor_terjual)}</td><td className="px-4 py-3">{format(row.harga_jual_per_kg)}</td><td className="px-4 py-3">{format(row.total_penjualan)}</td><td className="px-4 py-3">{value(row, 'daerah_asal') || '—'}</td><td className="px-4 py-3">{value(row, 'daerah_tujuan') || '—'}</td><td className="px-4 py-3"><div className="flex gap-2"><button type="button" onClick={() => setEditing(row)} aria-label={`Ubah transaksi ${value(row, 'id_transaksi')}`} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:text-teal-800"><Pencil size={15} /></button><button type="button" onClick={() => window.confirm(`Hapus transaksi ${value(row, 'id_transaksi')}?`) && void onDelete(value(row, '__id'))} aria-label={`Hapus transaksi ${value(row, 'id_transaksi')}`} className="rounded-lg border border-rose-100 p-2 text-rose-700 hover:bg-rose-50"><Trash2 size={15} /></button></div></td></tr>) : <tr><td colSpan={12} className="p-4"><EmptyRows /></td></tr>}</tbody></table></div></CardContent></Card>
  </>
}

function EmptyRows() { return <div className="flex min-h-36 flex-col items-center justify-center text-center"><p className="text-sm font-semibold text-slate-800">Belum ada transaksi aktual</p><p className="mt-1 text-xs text-slate-500">Tambahkan transaksi atau impor CSV/Excel untuk melihat data di sini.</p></div> }
