'use client'

import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Activity, ArrowDownToLine, BarChart3, CalendarDays, Check, ChevronDown, CircleAlert, ClipboardList, Database, Download, FileSpreadsheet, LayoutDashboard, PawPrint, Plus, Settings, ShoppingCart, Store, Upload, Users, Weight, Wheat, X, LogOut } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { FarmManager, TransactionManager } from '@/components/farmscope-data-manager'
import { createClient } from '@/lib/supabase/client'
import { read, utils, writeFileXLSX } from 'xlsx'
import workbookSeed from '@/lib/farmscope-workbook.json'

type Row = Record<string, unknown>
type Workbook = { source: string; sheets: Record<string, Row[]> }
type DatabaseData = { farms: Row[]; transactions: Row[] }
type Page = 'overview' | 'trends' | 'population' | 'sales' | 'categories' | 'market' | 'prediction' | 'quality' | 'settings'
const initialWorkbook = workbookSeed as Workbook
const menu: { key: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', label: 'Ringkasan', icon: LayoutDashboard }, { key: 'trends', label: 'Tren Harga', icon: BarChart3 }, { key: 'population', label: 'Populasi & Produksi', icon: Users }, { key: 'sales', label: 'Penjualan', icon: ShoppingCart }, { key: 'categories', label: 'Kategori Ternak', icon: PawPrint }, { key: 'market', label: 'Pasar & Toke', icon: Store }, { key: 'prediction', label: 'Prediksi Harga', icon: Activity }, { key: 'quality', label: 'Kualitas Data', icon: ClipboardList }, { key: 'settings', label: 'Pengaturan', icon: Settings },
]
const palette = ['#27b8ac', '#b49af8', '#f4a33b', '#3986ef', '#ef6b73']
const transactionColumns = ['id_transaksi', 'id_peternak', 'tanggal_penjualan', 'lokasi_penjualan', 'kategori_babi', 'berat_badan_kg', 'jumlah_ekor_terjual', 'harga_jual_per_kg', 'total_penjualan', 'daerah_asal', 'daerah_tujuan', 'harga_titik_tujuan_per_kg', 'selisih_harga_per_kg']
const numeric = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null
const text = (v: unknown) => String(v ?? '').trim()
const fmt = (v: number) => new Intl.NumberFormat('id-ID').format(v)
const rupiah = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v)
const hasValue = (row: Row, fields: string[]) => fields.some((key) => row[key] !== null && row[key] !== undefined && row[key] !== '')
const isExample = (row: Row, sheet: string) => sheet === 'Data_Transaksi'
  ? Object.values(row).some((value) => typeof value === 'string' && value.toUpperCase().includes('CONTOH')) || (text(row.id_transaksi) === 'T0001' && text(row.tanggal_penjualan).startsWith('2026-03-15') && text(row.lokasi_penjualan) === 'Medan' && text(row.kategori_babi) === 'sedang' && numeric(row.berat_badan_kg) === 90 && numeric(row.harga_jual_per_kg) === 40000)
  : sheet === 'Data_Peternakan' || sheet === 'Dim_Peternak'
    ? Object.values(row).some((value) => typeof value === 'string' && value.toUpperCase().includes('CONTOH'))
    : false
const sortedDates = (rows: Row[]) => [...rows].sort((a, b) => text(a.tanggal_penjualan).localeCompare(text(b.tanggal_penjualan)))
const normalizeHeader = (value: unknown) => text(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '')
const field = (row: Row, ...names: string[]) => {
  const aliases = new Set(names.map(normalizeHeader))
  const entry = Object.entries(row).find(([key]) => aliases.has(normalizeHeader(key)))
  return entry?.[1]
}
const hasHeader = (row: Row, ...names: string[]) => names.some((name) => Object.keys(row).some((key) => normalizeHeader(key) === normalizeHeader(name)))
const parseNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === null || value === undefined || value === '') return null
  let result = text(value).replace(/[^0-9,.-]/g, '')
  if (/^-?\d{1,3}(\.\d{3})+$/.test(result)) result = result.replaceAll('.', '')
  else if (result.includes(',') && result.includes('.')) result = result.lastIndexOf(',') > result.lastIndexOf('.') ? result.replaceAll('.', '').replace(',', '.') : result.replaceAll(',', '')
  else if (result.includes(',')) result = result.replace(',', '.')
  const parsed = Number(result)
  return Number.isFinite(parsed) ? parsed : null
}
const parseDate = (value: unknown) => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && value > 20000 && value < 60000) return new Date((value - 25569) * 86400000).toISOString().slice(0, 10)
  const input = text(value)
  const localDate = input.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (localDate) return `${localDate[3]}-${localDate[2].padStart(2, '0')}-${localDate[1].padStart(2, '0')}`
  const parsed = new Date(input)
  return input && Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null
}

export function FarmScopeWorkbookDashboard({ userId, email }: { userId: string; email: string }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [active, setActive] = useState<Page>('overview')
  const [range, setRange] = useState('all')
  const [notice, setNotice] = useState('')
  const [realtimeStatus, setRealtimeStatus] = useState('connecting')
  const { data: databaseData, error: databaseError, isLoading, mutate } = useSWR<DatabaseData>(`farmscope:${userId}`, async () => {
    const [farmResult, transactionResult] = await Promise.all([
      supabase.from('farmscope_farms').select('id, owner_id, farm_code, farm_name, respondent, location, herd_size, farm_scale, source').eq('owner_id', userId).order('farm_code'),
      supabase.from('farmscope_transactions').select('id, owner_id, external_id, farm_id, farm_code, transaction_date, sale_location, pig_category, body_weight_kg, animal_count, sale_price_per_kg, total_sales, origin, destination, destination_price_per_kg, price_difference_per_kg').eq('owner_id', userId).order('transaction_date', { ascending: false, nullsFirst: false }),
    ])
    if (farmResult.error || transactionResult.error) throw new Error('Data Supabase tidak dapat dimuat. Periksa koneksi lalu coba lagi.')
    return { farms: (farmResult.data ?? []) as Row[], transactions: (transactionResult.data ?? []) as Row[] }
  }, { revalidateOnFocus: true })

  useEffect(() => {
    const channel = supabase.channel(`farmscope-live-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'farmscope_farms', filter: `owner_id=eq.${userId}` }, () => { void mutate() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'farmscope_transactions', filter: `owner_id=eq.${userId}` }, () => { void mutate() })
      .subscribe((status: string) => setRealtimeStatus(status === 'SUBSCRIBED' ? 'live' : 'connecting'))
    return () => { void supabase.removeChannel(channel) }
  }, [supabase, userId, mutate])

  const data = useMemo<Workbook>(() => {
    const farmById = new Map((databaseData?.farms ?? []).map((farm) => [text(farm.id), text(farm.farm_code)]))
    const farmRows = (databaseData?.farms ?? []).map((farm) => ({
      __id: farm.id, id_peternak: farm.farm_code, nama_peternakan: farm.farm_name, nama_responden: farm.respondent,
      lokasi_peternakan: farm.location, jumlah_ternak: farm.herd_size, skala_peternakan: farm.farm_scale, sumber_data: farm.source,
    }))
    const transactionRows = (databaseData?.transactions ?? []).map((transaction) => ({
      __id: transaction.id, id_transaksi: transaction.external_id,
      id_peternak: transaction.farm_code || farmById.get(text(transaction.farm_id)) || '',
      tanggal_penjualan: transaction.transaction_date, lokasi_penjualan: transaction.sale_location,
      kategori_babi: transaction.pig_category, berat_badan_kg: transaction.body_weight_kg,
      jumlah_ekor_terjual: transaction.animal_count, harga_jual_per_kg: transaction.sale_price_per_kg,
      total_penjualan: transaction.total_sales, daerah_asal: transaction.origin, daerah_tujuan: transaction.destination,
      harga_titik_tujuan_per_kg: transaction.destination_price_per_kg, selisih_harga_per_kg: transaction.price_difference_per_kg,
    }))
    return { source: 'Supabase · realtime', sheets: { ...initialWorkbook.sheets, Data_Peternakan: farmRows, Data_Transaksi: transactionRows } }
  }, [databaseData])

  const transactions = data.sheets.Data_Transaksi ?? []
  const farms = data.sheets.Data_Peternakan ?? []
  const locations = data.sheets.Dim_Lokasi ?? []
  const dictionary = data.sheets.Kamus_Variabel ?? []
  const observedRows = transactions.filter((row) => hasValue(row, ['id_peternak', 'tanggal_penjualan', 'harga_jual_per_kg', 'berat_badan_kg']))
  const examples = observedRows.filter((row) => isExample(row, 'Data_Transaksi'))
  const realTransactions = observedRows.filter((row) => !isExample(row, 'Data_Transaksi'))
  const filtered = useMemo(() => {
    if (range === 'all' || !realTransactions.length) return realTransactions
    const dates = realTransactions.map((row) => new Date(text(row.tanggal_penjualan)).getTime()).filter(Number.isFinite)
    const latest = Math.max(...dates, 0)
    const cutoff = latest - Number(range) * 86400000
    return realTransactions.filter((row) => { const time = new Date(text(row.tanggal_penjualan)).getTime(); return !Number.isFinite(time) || time >= cutoff })
  }, [realTransactions, range])
  const activeFarms = farms.filter((row) => hasValue(row, ['nama_peternakan', 'lokasi_peternakan', 'jumlah_ternak', 'skala_peternakan']) && !isExample(row, 'Data_Peternakan'))
  const sampleFarms = farms.filter((row) => isExample(row, 'Data_Peternakan'))
  const totalHerd = activeFarms.reduce((sum, row) => sum + (numeric(row.jumlah_ternak) ?? 0), 0)
  const targetRows = filtered.filter((row) => (numeric(row.harga_jual_per_kg) ?? 0) > 0)
  const salesTotal = filtered.reduce((sum, row) => sum + (numeric(row.total_penjualan) ?? ((numeric(row.berat_badan_kg) ?? 0) * (numeric(row.harga_jual_per_kg) ?? 0) * (numeric(row.jumlah_ekor_terjual) ?? 1))), 0)
  const avgPrice = targetRows.length ? targetRows.reduce((sum, row) => sum + (numeric(row.harga_jual_per_kg) ?? 0), 0) / targetRows.length : 0
  const trend = useMemo(() => {
    const map = new Map<string, { total: number; count: number; volume: number }>()
    filtered.forEach((row) => {
      const key = text(row.tanggal_penjualan).slice(0, 7) || 'Tanggal kosong'
      const item = map.get(key) ?? { total: 0, count: 0, volume: 0 }
      const price = numeric(row.harga_jual_per_kg)
      if (price !== null && price > 0) { item.total += price; item.count++ }
      item.volume += numeric(row.jumlah_ekor_terjual) ?? 0
      map.set(key, item)
    })
    return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, price: v.count ? Math.round(v.total / v.count) : 0, volume: v.volume }))
  }, [filtered])
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    filtered.forEach((row) => { const key = text(row.kategori_babi) || 'Kategori belum diisi'; counts.set(key, (counts.get(key) ?? 0) + (numeric(row.jumlah_ekor_terjual) ?? 1)) })
    return [...counts].map(([name, value], i) => ({ name, value, color: palette[i % palette.length] }))
  }, [filtered])
  const routes = useMemo(() => {
    const map = new Map<string, { from: string; to: string; prices: number[]; target: number[] }>()
    filtered.forEach((row) => {
      const from = text(row.daerah_asal) || text(row.lokasi_penjualan) || 'Asal belum diisi'
      const to = text(row.daerah_tujuan) || text(row.lokasi_penjualan) || 'Tujuan belum diisi'
      const key = `${from} → ${to}`
      const item = map.get(key) ?? { from, to, prices: [], target: [] }
      const dest = numeric(row.harga_titik_tujuan_per_kg); const price = numeric(row.harga_jual_per_kg)
      if (dest !== null && dest > 0) item.prices.push(dest)
      if (price !== null && price > 0) item.target.push(price)
      map.set(key, item)
    })
    return [...map].map(([route, item]) => ({ route, from: item.from, to: item.to, destinationPrice: item.prices.length ? item.prices.reduce((a, b) => a + b, 0) / item.prices.length : null, salePrice: item.target.length ? item.target.reduce((a, b) => a + b, 0) / item.target.length : null }))
  }, [filtered])
  const farmScales = useMemo(() => {
    const map = new Map<string, number>()
    activeFarms.forEach((row) => { const key = text(row.skala_peternakan) || 'Skala belum diisi'; map.set(key, (map.get(key) ?? 0) + (numeric(row.jumlah_ternak) ?? 0)) })
    return [...map].map(([name, value], i) => ({ name, value, color: palette[i % palette.length] }))
  }, [activeFarms])
  const missingTarget = realTransactions.filter((row) => (numeric(row.harga_jual_per_kg) ?? 0) <= 0).length
  const duplicateIds = realTransactions.length - new Set(realTransactions.map((row) => text(row.id_transaksi)).filter(Boolean)).size
  const invalidPrices = realTransactions.filter((row) => { const value = numeric(row.harga_jual_per_kg); return value !== null && value <= 0 }).length
  const missingPredictors = realTransactions.filter((row) => !hasValue(row, ['berat_badan_kg', 'tanggal_penjualan', 'kategori_babi', 'lokasi_penjualan'])).length

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setNotice(`Membaca ${file.name}…`)
      const isCsv = file.name.toLowerCase().endsWith('.csv')
      const book = read(await file.arrayBuffer(), { cellDates: true })
      const sheets: Record<string, Row[]> = {}
      for (const name of book.SheetNames) {
        const sheet = book.Sheets[name]
        const firstRow = utils.sheet_to_json(sheet, { header: 1, range: 0, blankrows: false })[0] as unknown[] | undefined
        const firstRowHasDataHeaders = (firstRow ?? []).some((value) => ['idtransaksi', 'transactionid', 'farmcode', 'namapeternakan'].includes(normalizeHeader(value)))
        const rangeStart = isCsv || firstRowHasDataHeaders ? 0 : 1
        const rows = utils.sheet_to_json(sheet, { range: rangeStart, defval: null }) as Row[]
        sheets[name] = rows.filter((row) => Object.values(row).some((value) => value !== null && value !== ''))
      }
      const entries = Object.entries(sheets)
      const farmEntry = entries.find(([name]) => normalizeHeader(name).includes('peternakan') || normalizeHeader(name) === 'farms')
        ?? entries.find(([, rows]) => rows.some((row) => hasHeader(row, 'nama_peternakan', 'farm_name')))
      const transactionEntry = entries.find(([name]) => normalizeHeader(name).includes('transaksi') || normalizeHeader(name) === 'transactions')
        ?? entries.find(([, rows]) => rows.some((row) => hasHeader(row, 'id_transaksi', 'transaction_id', 'tanggal_penjualan', 'transaction_date')))
      const farmInput = (farmEntry?.[1] ?? []).filter((row) => !isExample(row, 'Data_Peternakan'))
        .map((row) => ({
          owner_id: userId,
          farm_code: text(field(row, 'id_peternak', 'farm_code', 'farmer_id')) || `F-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          farm_name: text(field(row, 'nama_peternakan', 'farm_name', 'farm_name')),
          respondent: text(field(row, 'nama_responden', 'respondent', 'contact_name')) || null,
          location: text(field(row, 'lokasi_peternakan', 'location', 'farm_location')) || null,
          herd_size: parseNumber(field(row, 'jumlah_ternak', 'herd_size', 'head_count')),
          farm_scale: text(field(row, 'skala_peternakan', 'farm_scale', 'scale')) || null,
          source: text(field(row, 'sumber_data', 'source')) || file.name,
        })).filter((row) => row.farm_name)
      const farmsToImport = [...new Map(farmInput.map((row) => [row.farm_code, row])).values()]
      if (farmsToImport.length) {
        const { error } = await supabase.from('farmscope_farms').upsert(farmsToImport, { onConflict: 'owner_id,farm_code' })
        if (error) throw new Error(error.code === '23505' ? 'ID peternak duplikat. Periksa kembali file lalu impor ulang.' : 'Data peternakan gagal disimpan ke Supabase.')
      }

      const transactionEntryRows = (transactionEntry?.[1] ?? []).filter((row) => !isExample(row, 'Data_Transaksi'))
      const farmLookupResult = await supabase.from('farmscope_farms').select('id, farm_code').eq('owner_id', userId)
      if (farmLookupResult.error) throw new Error('Data peternak tidak dapat dipasangkan ke transaksi.')
      const farmIds = new Map((farmLookupResult.data ?? []).map((farm: { id: string; farm_code: string }) => [farm.farm_code, farm.id]))
      const transactionInput = transactionEntryRows.map((row) => {
        const farmCode = text(field(row, 'id_peternak', 'farm_code', 'farmer_id'))
        return {
          owner_id: userId,
          external_id: text(field(row, 'id_transaksi', 'transaction_id', 'external_id')) || `TX-${crypto.randomUUID()}`,
          farm_id: farmIds.get(farmCode) ?? null,
          farm_code: farmCode || null,
          transaction_date: parseDate(field(row, 'tanggal_penjualan', 'transaction_date', 'sale_date')),
          sale_location: text(field(row, 'lokasi_penjualan', 'sale_location')) || null,
          pig_category: text(field(row, 'kategori_babi', 'pig_category', 'category')) || null,
          body_weight_kg: parseNumber(field(row, 'berat_badan_kg', 'body_weight_kg', 'weight_kg')),
          animal_count: parseNumber(field(row, 'jumlah_ekor_terjual', 'animal_count', 'head_count', 'quantity')),
          sale_price_per_kg: parseNumber(field(row, 'harga_jual_per_kg', 'sale_price_per_kg', 'price_per_kg')),
          origin: text(field(row, 'daerah_asal', 'origin')) || null,
          destination: text(field(row, 'daerah_tujuan', 'destination')) || null,
          destination_price_per_kg: parseNumber(field(row, 'harga_titik_tujuan_per_kg', 'destination_price_per_kg')),
        }
      })
      const transactionsToImport = [...new Map(transactionInput.map((row) => [row.external_id, row])).values()]
      if (transactionsToImport.length) {
        const { error } = await supabase.from('farmscope_transactions').upsert(transactionsToImport, { onConflict: 'owner_id,external_id' })
        if (error) throw new Error(error.code === '23505' ? 'ID transaksi duplikat. Periksa kembali file lalu impor ulang.' : 'Data transaksi gagal disimpan. Pastikan tanggal, jumlah, berat, dan harga valid.')
      }
      if (!farmsToImport.length && !transactionsToImport.length) throw new Error('Tidak ada baris peternakan atau transaksi yang valid. CSV harus berisi header kolom FarmScope.')
      await mutate()
      setRange('all')
      setActive('overview')
      setNotice(`${file.name}: ${farmsToImport.length} peternakan dan ${transactionsToImport.length} transaksi disimpan ke Supabase.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'File CSV/Excel tidak dapat dibaca.')
    } finally {
      event.target.value = ''
    }
  }
  const exportWorkbook = () => {
    const book = utils.book_new()
    Object.entries(data.sheets).forEach(([name, rows]) => {
      const exportRows = rows.map(({ __id: _internalId, ...row }) => row)
      if (exportRows.length) utils.book_append_sheet(book, utils.json_to_sheet(exportRows), name.slice(0, 31))
    })
    writeFileXLSX(book, 'farmscope-supabase.xlsx')
  }
  const downloadCsv = (rows: Row[], filename: string) => {
    const exportRows = rows.map(({ __id: _internalId, ...row }) => row)
    const columns = [...new Set(exportRows.flatMap((row) => Object.keys(row)))]
    const csv = [columns, ...exportRows.map((row) => columns.map((column) => row[column]))].map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }
  const exportCsv = () => downloadCsv(realTransactions, 'farmscope-transaksi.csv')
  const exportFarmsCsv = () => downloadCsv(activeFarms, 'farmscope-peternakan.csv')
  const transactionValues = async (form: FormData) => {
    const farmCode = text(form.get('id_peternak'))
    let farmId: string | null = null
    if (farmCode) {
      const result = await supabase.from('farmscope_farms').select('id').eq('owner_id', userId).eq('farm_code', farmCode).maybeSingle()
      if (result.error) throw new Error('Peternak tidak dapat diverifikasi.')
      farmId = result.data?.id ?? null
    }
    return {
      owner_id: userId,
      farm_id: farmId,
      farm_code: farmCode || null,
      transaction_date: parseDate(form.get('tanggal_penjualan')),
      sale_location: text(form.get('lokasi_penjualan')) || null,
      pig_category: text(form.get('kategori_babi')) || null,
      body_weight_kg: parseNumber(form.get('berat_badan_kg')),
      animal_count: parseNumber(form.get('jumlah_ekor_terjual')),
      sale_price_per_kg: parseNumber(form.get('harga_jual_per_kg')),
      origin: text(form.get('daerah_asal')) || null,
      destination: text(form.get('daerah_tujuan')) || null,
      destination_price_per_kg: parseNumber(form.get('harga_titik_tujuan_per_kg')),
    }
  }
  const addTransaction = async (form: FormData) => {
    const values = await transactionValues(form)
    if (!(values.sale_price_per_kg && values.sale_price_per_kg > 0 && values.body_weight_kg && values.body_weight_kg > 0 && values.animal_count && Number.isInteger(values.animal_count) && values.animal_count > 0)) {
      setNotice('Isi berat, harga per kg, dan jumlah ekor dengan angka valid lebih dari nol.')
      return
    }
    const { error } = await supabase.from('farmscope_transactions').insert({ ...values, external_id: `TX-${crypto.randomUUID()}` })
    if (error) { setNotice('Transaksi gagal disimpan. Periksa kembali data dan coba lagi.'); return }
    await mutate()
    setNotice('Transaksi tersimpan di Supabase dan dashboard diperbarui realtime.')
  }
  const updateTransaction = async (id: string, form: FormData) => {
    try {
      const values = await transactionValues(form)
      if (!(values.sale_price_per_kg && values.sale_price_per_kg > 0 && values.body_weight_kg && values.body_weight_kg > 0 && values.animal_count && Number.isInteger(values.animal_count) && values.animal_count > 0)) {
        setNotice('Isi berat, harga per kg, dan jumlah ekor dengan angka valid lebih dari nol.')
        return false
      }
      const { error } = await supabase.from('farmscope_transactions').update(values).eq('id', id).eq('owner_id', userId)
      if (error) { setNotice('Perubahan transaksi gagal disimpan.'); return false }
      await mutate()
      setNotice('Perubahan transaksi tersimpan dan tersinkron realtime.')
      return true
    } catch {
      setNotice('Perubahan transaksi gagal disimpan. Periksa koneksi dan data peternak.')
      return false
    }
  }
  const deleteTransaction = async (id: string) => {
    const { error } = await supabase.from('farmscope_transactions').delete().eq('id', id).eq('owner_id', userId)
    if (error) { setNotice('Transaksi gagal dihapus.'); return }
    await mutate()
    setNotice('Transaksi dihapus dari Supabase.')
  }
  const saveFarm = async (id: string | null, form: FormData) => {
    const farmCode = text(form.get('farm_code'))
    const farmName = text(form.get('farm_name'))
    const herdSize = parseNumber(form.get('herd_size'))
    if (!farmCode || !farmName || (herdSize !== null && herdSize < 0)) {
      setNotice('ID, nama peternakan, dan jumlah ternak harus valid.')
      return false
    }
    const values = {
      owner_id: userId,
      farm_code: farmCode,
      farm_name: farmName,
      respondent: text(form.get('respondent')) || null,
      location: text(form.get('location')) || null,
      herd_size: herdSize,
      farm_scale: text(form.get('farm_scale')) || null,
      source: text(form.get('source')) || 'Input dashboard',
    }
    const result = id
      ? await supabase.from('farmscope_farms').update(values).eq('id', id).eq('owner_id', userId)
      : await supabase.from('farmscope_farms').insert(values)
    if (result.error) {
      setNotice(result.error.code === '23505' ? 'ID peternak sudah digunakan.' : 'Peternakan gagal disimpan. Periksa kembali datanya.')
      return false
    }
    await mutate()
    setNotice(id ? 'Perubahan peternakan tersimpan realtime.' : 'Peternakan tersimpan realtime di Supabase.')
    return true
  }
  const deleteFarm = async (id: string) => {
    const { error } = await supabase.from('farmscope_farms').delete().eq('id', id).eq('owner_id', userId)
    if (error) { setNotice('Peternakan gagal dihapus.'); return }
    await mutate()
    setNotice('Peternakan dihapus. Kode peternak pada transaksi lama tetap dipertahankan.')
  }
  const signOut = async () => {
    await supabase.auth.signOut()
    router.refresh()
  }

  if (isLoading) return <main className="grid min-h-screen place-items-center bg-[#f4f7f8] p-6"><p role="status" className="rounded-2xl bg-white px-6 py-5 text-sm font-medium text-slate-700 shadow-sm">Menghubungkan ke Supabase…</p></main>
  if (databaseError) return <main className="grid min-h-screen place-items-center bg-[#f4f7f8] p-6"><div role="alert" className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center"><p className="font-semibold text-slate-900">Data tidak dapat dimuat</p><p className="mt-2 text-sm text-slate-600">Periksa koneksi Supabase lalu muat ulang dashboard.</p><button onClick={() => void mutate()} className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Coba lagi</button></div></main>

  return <div className="fs-app min-h-screen bg-[#f4f7f8] text-[#202b3a]">
    <aside className="fs-sidebar fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col border-r border-slate-200/80 bg-white px-4 py-7 md:flex">
      <div className="flex items-center gap-3 px-2 pb-8"><div className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-[#007f77] text-[#b5fff2] shadow-[0_10px_22px_rgba(0,127,119,.2)]"><PawPrint size={31} /></div><div><p className="text-[19px] font-bold tracking-tight text-slate-800">FarmScope</p><p className="mt-0.5 text-[13px] text-slate-500">Supabase Realtime</p></div></div>
      <nav aria-label="Navigasi utama" className="flex flex-col gap-1.5">{menu.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => setActive(key)} aria-current={active === key ? 'page' : undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-left text-sm font-medium transition-colors ${active === key ? 'bg-[#e4f8f5] text-[#087f77]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><Icon size={19} />{label}</button>)}</nav>
      <div className="fs-sidebar-farm mt-auto overflow-hidden rounded-[20px] p-4 text-white"><p className="text-sm font-semibold">Sumber dataset</p><p className="mt-1 break-all text-xs text-white/80">{data.source}</p><span className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-white/90"><span className={`size-2 rounded-full ${realtimeStatus === 'live' ? 'bg-emerald-400' : 'bg-amber-300'}`} />{realtimeStatus === 'live' ? 'Realtime aktif' : 'Menghubungkan realtime'}</span></div>
    </aside>
    <div className="min-h-screen md:pl-[260px]">
      <header className="fs-hero relative isolate overflow-hidden px-5 pb-7 pt-6 sm:px-8 lg:px-9"><div className="relative z-10 mx-auto flex max-w-[1540px] flex-wrap items-start justify-between gap-5"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#138e84]">Supabase realtime · {fmt(observedRows.length)} transaksi tersimpan · {fmt(examples.length)} baris contoh</p><h1 className="mt-1 text-[27px] font-bold leading-tight tracking-[-.035em] text-[#202a39] sm:text-[32px]">Dashboard Analisis Peternakan Babi</h1><p className="mt-2 text-sm text-[#556579]">Visualisasi mengikuti kolom dan hubungan antar-sheet di workbook FarmScope.</p></div><div className="flex items-center gap-2 self-start"><label className="flex h-10 items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3.5 text-sm font-medium text-slate-700 shadow-sm"><CalendarDays size={16} className="text-[#138e84]" /><span className="sr-only">Rentang tanggal</span><select aria-label="Rentang tanggal" value={range} onChange={(event) => setRange(event.target.value)} className="max-w-[142px] bg-transparent outline-none"><option value="all">Semua periode</option><option value="30">30 hari terakhir</option><option value="90">90 hari terakhir</option></select><ChevronDown size={14} /></label><button type="button" onClick={exportWorkbook} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#087f77] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#066b65]"><Download size={15} />Ekspor</button><button type="button" onClick={signOut} aria-label="Keluar dari akun" title={`Keluar dari ${email}`} className="grid size-10 place-items-center rounded-full border border-white/80 bg-white/90 text-slate-600 shadow-sm hover:text-rose-700"><LogOut size={16} /></button></div></div></header>
      <div className="border-b border-slate-200 bg-white px-4 py-2 md:hidden"><nav aria-label="Navigasi utama" className="flex gap-1 overflow-x-auto">{menu.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => setActive(key)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${active === key ? 'bg-[#e4f8f5] text-[#087f77]' : 'text-slate-500'}`}><Icon size={15} />{label}</button>)}</nav></div>
      <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-5">{notice && <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900"><span>{notice}</span><button aria-label="Tutup pemberitahuan" onClick={() => setNotice('')}><X size={16} /></button></div>}
        {active === 'overview' && <Overview data={data} transactionCount={filtered.length} filledCount={observedRows.length} exampleCount={examples.length} farmerCount={activeFarms.length} sampleFarmCount={sampleFarms.length} herd={totalHerd} avgPrice={avgPrice} salesTotal={salesTotal} trend={trend} categories={categories} onPage={setActive} />}
        {active === 'trends' && <TrendsPage trend={trend} />}
        {active === 'population' && <><FarmManager farms={activeFarms} onSave={saveFarm} onDelete={deleteFarm} /><PopulationPage farms={activeFarms} scales={farmScales} locations={locations} sampleCount={sampleFarms.length} /></>}
        {active === 'sales' && <SalesPage rows={filtered} total={salesTotal} onAdd={addTransaction} onUpdate={updateTransaction} onDelete={deleteTransaction} />}
        {active === 'categories' && <CategoriesPage categories={categories} scales={farmScales} saleScales={data.sheets.Skala_Penjualan ?? []} />}
        {active === 'market' && <MarketPage routes={routes} locations={locations} />}
        {active === 'prediction' && <PredictionPage dictionary={dictionary} eligible={targetRows.length} missingPredictors={missingPredictors} />}
        {active === 'quality' && <QualityPage rows={realTransactions} examples={examples} missingTarget={missingTarget} duplicates={duplicateIds} invalidPrices={invalidPrices} />}
        {active === 'settings' && <SettingsPage data={data} rows={transactions} dictionary={dictionary} onImport={importFile} onExport={exportWorkbook} onExportCsv={exportCsv} onExportFarmsCsv={exportFarmsCsv} onSignOut={signOut} email={email} />}
      </main>
    </div>
  </div>
}

function Heading({ title, description, eyebrow = 'FARMSCOPE · WORKBOOK' }: { title: string; description: string; eyebrow?: string }) { return <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold tracking-[.16em] text-teal-700">{eyebrow}</p><h2 className="mt-1 text-xl font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div> }
function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <Card className="fs-panel min-w-0"><CardHeader className="px-5 pb-1 pt-5"><CardTitle className="text-[15px] font-semibold text-white">{title}</CardTitle><p className="mt-1 text-[11px] leading-4 text-slate-400">{subtitle}</p></CardHeader><CardContent className="min-w-0 px-5 pb-5 pt-3">{children}</CardContent></Card> }
function EmptyData({ title = 'Belum ada data aktual', detail = 'Baris contoh dari template tidak dihitung sebagai data lapangan.' }: { title?: string; detail?: string }) { return <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-5 text-center"><Database className="text-teal-700" size={25} /><p className="mt-3 text-sm font-semibold text-slate-800">{title}</p><p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{detail}</p></div> }
function ChartPlaceholder({ title, detail }: { title: string; detail: string }) { return <div className="flex h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 px-5 text-center"><CircleAlert className="text-amber-300" size={24} /><p className="mt-3 text-sm font-semibold text-white">{title}</p><p className="mt-1 max-w-md text-xs leading-5 text-slate-400">{detail}</p></div> }
function Overview({ data, transactionCount, filledCount, exampleCount, farmerCount, sampleFarmCount, herd, avgPrice, salesTotal, trend, categories, onPage }: { data: Workbook; transactionCount: number; filledCount: number; exampleCount: number; farmerCount: number; sampleFarmCount: number; herd: number; avgPrice: number; salesTotal: number; trend: { month: string; price: number; volume: number }[]; categories: { name: string; value: number; color: string }[]; onPage: (page: Page) => void }) {
  const metrics = [{ label: 'Transaksi aktual', value: fmt(transactionCount), detail: `${fmt(exampleCount)} baris contoh dikecualikan`, icon: ShoppingCart }, { label: 'Peternak terisi', value: fmt(farmerCount), detail: `${fmt(sampleFarmCount)} peternak contoh dikecualikan`, icon: Users }, { label: 'Populasi terdata', value: `${fmt(herd)} ekor`, detail: 'Jumlah dari Data_Peternakan', icon: PawPrint }, { label: 'Rata-rata harga jual', value: avgPrice ? rupiah(avgPrice) : '—', detail: 'Target harga_jual_per_kg', icon: Weight }, { label: 'Total penjualan', value: salesTotal ? rupiah(salesTotal) : '—', detail: 'Kolom turunan, bukan fitur model', icon: Wheat }]
  return <div className="flex flex-col gap-4"><section aria-label="Metrik utama" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{metrics.map(({ label, value, detail, icon: Icon }, i) => <article key={label} className={`fs-kpi ${i % 2 ? 'fs-kpi-light' : 'fs-kpi-dark'}`}><div className="flex items-center justify-between"><Icon size={25} className={i % 2 ? 'text-[#087f77]' : 'text-[#5ae0d0]'} /><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800"><Check size={11} className="mr-1 inline" />Live</span></div><p className={`mt-4 text-xs font-medium ${i % 2 ? 'text-[#31565b]' : 'text-white/85'}`}>{label}</p><p className={`mt-1 text-[22px] font-bold tracking-tight ${i % 2 ? 'text-[#142b32]' : 'text-white'}`}>{value}</p><p className={`mt-1 text-[10px] ${i % 2 ? 'text-[#5a7b7d]' : 'text-white/60'}`}>{detail}</p></article>)}</section>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><b>Data tersimpan:</b> {fmt(filledCount)} transaksi dari Supabase; {fmt(exampleCount)} baris contoh dikecualikan, sementara {fmt(transactionCount)} transaksi masuk analisis. Penambahan dan perubahan tersinkron realtime.</div>
    <section className="grid gap-4 xl:grid-cols-2"><Panel title="Harga jual per bulan" subtitle="Target harga jual aktual per kg dari Data_Transaksi"><ChartContainer config={{ price: { label: 'Harga jual / kg', color: '#27b8ac' } }} className="h-[240px] w-full">{trend.length ? <LineChart data={trend}><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="month" /><YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} /><Tooltip content={<ChartTooltipContent formatter={(v) => rupiah(Number(v))} />} /><Line dataKey="price" stroke="var(--color-price)" strokeWidth={3} dot={{ r: 4 }} /></LineChart> : <ChartPlaceholder title="Tren belum tersedia" detail="Tambahkan transaksi aktual di sheet Data_Transaksi untuk mengisi grafik harga." />}</ChartContainer></Panel>
      <Panel title="Distribusi kategori babi" subtitle="Jumlah ekor terjual menurut kategori di workbook"><ChartContainer config={{ value: { label: 'Ekor', color: '#27b8ac' } }} className="h-[240px] w-full">{categories.length ? <PieChart><Pie data={categories} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="78%" paddingAngle={3}>{categories.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip content={<ChartTooltipContent hideLabel />} /></PieChart> : <ChartPlaceholder title="Kategori belum tersedia" detail="Kategori akan dihitung dari transaksi aktual, bukan dari skala usaha peternak." />}</ChartContainer></Panel></section>
    <div className="grid gap-3 sm:grid-cols-2"><button onClick={() => onPage('sales')} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-teal-300"><span className="flex items-center gap-2 font-semibold text-slate-800"><ShoppingCart size={17} className="text-teal-700" />Data transaksi</span><span className="mt-1 block text-xs text-slate-500">Kelola harga target, berat, volume, dan rute pasar.</span></button><button onClick={() => onPage('settings')} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-teal-300"><span className="flex items-center gap-2 font-semibold text-slate-800"><FileSpreadsheet size={17} className="text-teal-700" />Sinkronisasi workbook</span><span className="mt-1 block text-xs text-slate-500">Impor seluruh sheet, ekspor, dan tinjau kamus variabel.</span></button></div>
  </div>
}
function TrendsPage({ trend }: { trend: { month: string; price: number; volume: number }[] }) { return <><Heading title="Tren Harga & Penjualan" description="Analisis harga jual babi dan volume transaksi berdasarkan tanggal aktual di workbook." /><div className="grid gap-5 xl:grid-cols-2"><Panel title="Harga jual per kg" subtitle="Target regresi harga jual aktual"><ChartContainer config={{ price: { label: 'Harga jual / kg', color: '#27b8ac' } }} className="h-[330px]">{trend.length ? <AreaChart data={trend}><defs><linearGradient id="salesPrice" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#27b8ac" stopOpacity={.3} /><stop offset="95%" stopColor="#27b8ac" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="month" /><YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} /><Tooltip content={<ChartTooltipContent formatter={(v) => rupiah(Number(v))} />} /><Area dataKey="price" stroke="var(--color-price)" fill="url(#salesPrice)" /></AreaChart> : <ChartPlaceholder title="Belum ada tren aktual" detail="Baris contoh dikecualikan dari agregasi." />}</ChartContainer></Panel><Panel title="Jumlah ekor terjual" subtitle="Volume transaksi per bulan"><ChartContainer config={{ volume: { label: 'Ekor', color: '#b49af8' } }} className="h-[330px]">{trend.length ? <BarChart data={trend}><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip content={<ChartTooltipContent />} /><Bar dataKey="volume" fill="var(--color-volume)" radius={[5, 5, 0, 0]} /></BarChart> : <ChartPlaceholder title="Belum ada volume penjualan" detail="Isi tanggal dan jumlah_ekor_terjual untuk membangun tren." />}</ChartContainer></Panel></div></> }
function PopulationPage({ farms, scales, locations, sampleCount }: { farms: Row[]; scales: { name: string; value: number; color: string }[]; locations: Row[]; sampleCount: number }) { return <><Heading title="Populasi & Peternak" description="Data populasi berasal dari Data_Peternakan; data referensi wilayah berasal dari Dim_Lokasi." /><div className="mb-4 grid gap-3 sm:grid-cols-3"><Metric label="Peternak aktual" value={fmt(farms.length)} /><Metric label="Baris contoh dikecualikan" value={fmt(sampleCount)} /><Metric label="Wilayah referensi" value={fmt(locations.length)} /></div><div className="grid gap-5 xl:grid-cols-2"><Panel title="Populasi menurut skala usaha" subtitle="Skala peternakan berbeda dari kategori berat babi"><ChartContainer config={{ value: { label: 'Ekor', color: '#27b8ac' } }} className="h-[330px]">{scales.length ? <BarChart data={scales}><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip content={<ChartTooltipContent />} /><Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} /></BarChart> : <ChartPlaceholder title="Populasi aktual belum diisi" detail="Workbook hanya memiliki baris peternak contoh. Isi jumlah_ternak untuk melihat sebaran populasi." />}</ChartContainer></Panel><Card><CardHeader><CardTitle>Wilayah pada workbook</CardTitle></CardHeader><CardContent className="max-h-[330px] overflow-auto">{locations.length ? locations.map((row) => <div key={text(row.id_daerah)} className="flex items-center justify-between border-b border-slate-100 py-2.5 text-sm last:border-0"><span className="font-medium text-slate-800">{text(row.nama_daerah)}</span><span className="text-xs text-slate-500">{numeric(row.populasi_babi_ekor) === null ? 'Populasi belum diisi' : `${fmt(numeric(row.populasi_babi_ekor)!)} ekor`}</span></div>) : <EmptyData />}</CardContent></Card></div></> }
function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{value}</p></CardContent></Card> }
function SalesPage({ rows, total, onAdd, onUpdate, onDelete }: { rows: Row[]; total: number; onAdd: (form: FormData) => void; onUpdate: (id: string, form: FormData) => Promise<boolean>; onDelete: (id: string) => Promise<void> }) { return <><Heading title="Penjualan & Transaksi" description="Data_Transaksi menjadi sumber transaksi; total penjualan adalah variabel turunan, bukan fitur prediksi." /><div className="mb-4 grid gap-3 sm:grid-cols-3"><Metric label="Transaksi aktual" value={fmt(rows.length)} /><Metric label="Total penjualan" value={total ? rupiah(total) : '—'} /><Metric label="Target harga tersedia" value={fmt(rows.filter((r) => (numeric(r.harga_jual_per_kg) ?? 0) > 0).length)} /></div><Card className="mb-5"><CardHeader><CardTitle>Tambah transaksi aktual</CardTitle></CardHeader><CardContent><form action={onAdd} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['ID peternak','id_peternak','text'],['Tanggal jual','tanggal_penjualan','date'],['Lokasi penjualan','lokasi_penjualan','text'],['Kategori babi','kategori_babi','text'],['Berat badan (kg)','berat_badan_kg','number'],['Jumlah ekor','jumlah_ekor_terjual','number'],['Harga jual / kg (Rp)','harga_jual_per_kg','number'],['Daerah asal','daerah_asal','text'],['Daerah tujuan','daerah_tujuan','text']].map(([label,key,type])=><label key={key} className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">{label}<input required={['berat_badan_kg','jumlah_ekor_terjual','harga_jual_per_kg'].includes(key)} name={key} type={type} step={type==='number'?'any':undefined} defaultValue={type==='date'?new Date().toISOString().slice(0,10):undefined} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" /></label>)}<div className="sm:col-span-2 lg:col-span-4"><button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"><Plus size={16} />Simpan transaksi</button></div></form></CardContent></Card><TransactionManager rows={rows} onUpdate={onUpdate} onDelete={onDelete} /></> }
function TransactionsTable({ rows }: { rows: Row[] }) { return <Card><CardHeader><CardTitle>Data transaksi ({fmt(rows.length)})</CardTitle></CardHeader><CardContent className="p-0"><div className="max-h-[480px] overflow-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{transactionColumns.map((col) => <th key={col} className="px-4 py-3">{col.replaceAll('_',' ')}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.length ? rows.map((row,i)=><tr key={text(row.id_transaksi)||i} className="hover:bg-slate-50">{transactionColumns.map((col)=><td key={col} className="whitespace-nowrap px-4 py-3 text-slate-700">{col.includes('harga')||col==='total_penjualan'||col==='selisih_harga_per_kg'?numeric(row[col])===null?'—':rupiah(numeric(row[col])!):text(row[col])||'—'}</td>)}</tr>):<tr><td colSpan={transactionColumns.length} className="p-4"><EmptyData /></td></tr>}</tbody></table></div></CardContent></Card> }
function CategoriesPage({ categories, scales, saleScales }: { categories: { name: string; value: number; color: string }[]; scales: { name: string; value: number; color: string }[]; saleScales: Row[] }) { return <><Heading title="Kategori Ternak & Skala Usaha" description="Kategori babi (kecil/sedang/besar) dipisahkan dari klasifikasi skala peternakan." /><div className="grid gap-5 xl:grid-cols-2"><Panel title="Kategori babi terjual" subtitle="Data_Transaksi.kategori_babi"><ChartContainer config={{ value: { label: 'Ekor', color: '#27b8ac' } }} className="h-[330px]">{categories.length?<PieChart><Pie data={categories} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={3}>{categories.map((item)=><Cell key={item.name} fill={item.color}/>)}</Pie><Tooltip content={<ChartTooltipContent hideLabel/>}/></PieChart>:<ChartPlaceholder title="Belum ada kategori aktual" detail="Kategori ukuran pada template belum memiliki catatan transaksi lapangan."/>}</ChartContainer></Panel><Card><CardHeader><CardTitle>Batas kategori pada workbook</CardTitle></CardHeader><CardContent>{saleScales.map((row)=><div key={text(row.kategori_babi)} className="flex items-center justify-between border-b border-slate-100 py-3 text-sm last:border-0"><div><b className="capitalize text-slate-800">{text(row.kategori_babi)}</b><p className="text-xs text-slate-500">{text(row.dasar_kategori)||'Dasar belum diisi'}</p></div><span className="text-right text-xs text-slate-500">{numeric(row.berat_min_kg)??'—'} – {numeric(row.berat_max_kg)??'—'} kg</span></div>)}<div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Batas berat masih kosong dan perlu dikonfirmasi; dashboard tidak menetapkan batas kategori sendiri.</div></CardContent></Card></div><div className="mt-5"><Panel title="Skala usaha peternak" subtitle="Data_Peternakan.skala_peternakan · tidak sama dengan kategori babi"><div className="flex flex-wrap gap-2">{scales.length?scales.map((item)=><span key={item.name} className="rounded-full bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900">{item.name}: {fmt(item.value)} ekor</span>):<p className="text-sm text-slate-300">Belum ada skala usaha aktual diisi.</p>}</div></Panel></div></> }
function MarketPage({ routes, locations }: { routes: { route: string; destinationPrice: number|null; salePrice: number|null }[]; locations: Row[] }) { return <><Heading title="Pasar, Lokasi & Jalur Harga" description="Harga pasar dan selisih harga hanya dihitung dari kolom transaksi Q–T; referensi lokasi berasal dari Dim_Lokasi." /><div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><Card><CardHeader><CardTitle>Rute harga asal → tujuan</CardTitle></CardHeader><CardContent>{routes.length?routes.map((route)=><div key={route.route} className="mb-3 rounded-xl border border-slate-200 p-4"><p className="font-semibold text-slate-800">{route.route}</p><div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500"><span>Harga jual: <b className="text-slate-800">{route.salePrice===null?'Belum diisi':rupiah(route.salePrice)}</b></span><span>Harga titik tujuan: <b className="text-slate-800">{route.destinationPrice===null?'Belum diisi':rupiah(route.destinationPrice)}</b></span></div></div>):<EmptyData title="Jalur harga belum tersedia" detail="Isi daerah_asal, daerah_tujuan, harga_jual_per_kg, dan harga_titik_tujuan_per_kg di Data_Transaksi." />}</CardContent></Card><Panel title="Referensi wilayah" subtitle={`${fmt(locations.length)} lokasi terdefinisi · data populasi belum tersedia`}><div className="max-h-[330px] overflow-auto">{locations.slice(0,40).map((row)=><div key={text(row.id_daerah)} className="flex justify-between border-b border-slate-700 py-2 text-xs last:border-0"><span className="text-white">{text(row.nama_daerah)}</span><span className="text-slate-400">{text(row.jenis_daerah)}</span></div>)}</div></Panel></div></> }
function PredictionPage({ dictionary, eligible, missingPredictors }: { dictionary: Row[]; eligible: number; missingPredictors: number }) { const featureColumns = dictionary.filter((row) => row.sheet === 'Data_Transaksi' && text(row.peran_model).toLowerCase().includes('fitur')).map((row) => text(row.variabel)); return <><Heading title="Prediksi Harga Jual" description="Kamus_Variabel dan catatan anti-leakage pada Data_Transaksi menjadi kontrak fitur model." /><div className="grid gap-5 xl:grid-cols-[1fr_1fr]"><Card><CardHeader><CardTitle>Kesiapan target dan model</CardTitle></CardHeader><CardContent><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="flex items-center gap-2 font-semibold text-slate-900"><CircleAlert size={19}/>Model prediksi belum dilatih</p><p className="mt-2 text-sm leading-6 text-slate-700">Workbook menyediakan {fmt(eligible)} transaksi aktual dengan target harga per kg. Workbook tidak menetapkan jumlah minimum untuk pelatihan; karena itu dashboard tidak mengarang ambang atau menampilkan prediksi tanpa validasi.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Readiness label="Target harga_jual_per_kg" value={eligible?`${fmt(eligible)} baris`:'Belum ada'} good={eligible>0}/><Readiness label="Fitur inti kosong" value={fmt(missingPredictors)} good={eligible>0&&missingPredictors===0}/><Readiness label="Data transaksi aktual" value={eligible?`${fmt(eligible)} baris`:'Belum tersedia'} good={eligible>0}/><Readiness label="Model prediksi" value="Belum dilatih" /></div></CardContent></Card><Card><CardHeader><CardTitle>Fitur kandidat dari workbook</CardTitle></CardHeader><CardContent><p className="mb-3 text-xs leading-5 text-slate-500">Kolom ini dapat menjadi fitur eksplorasi setelah terisi dan divalidasi. harga_jual_per_kg adalah target.</p><div className="grid gap-2 sm:grid-cols-2">{featureColumns.map((field)=><div key={field} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">{field}</div>)}</div><div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900"><b>Data leakage dicegah:</b> total_penjualan, total_biaya, keuntungan, harga_jual_per_ekor, dan selisih_harga_per_kg tidak digunakan sebagai fitur karena merupakan nilai turunan/berhubungan langsung dengan target.</div></CardContent></Card></div></> }
function Readiness({ label, value, good=false }: { label:string;value:string;good?:boolean }) { return <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs"><span className="text-slate-600">{label}</span><span className={`text-right font-semibold ${good?'text-emerald-700':'text-amber-700'}`}>{value}</span></div> }
function QualityPage({ rows, examples, missingTarget, duplicates, invalidPrices }: { rows: Row[]; examples: Row[]; missingTarget: number; duplicates: number; invalidPrices: number }) { const n=rows.length; const checks=[{label:'Transaksi aktual',value:fmt(n),hint:`${fmt(examples.length)} contoh dikecualikan`},{label:'Target harga kosong',value:fmt(missingTarget),hint:'harga_jual_per_kg'},{label:'ID transaksi duplikat',value:fmt(duplicates),hint:'id_transaksi'},{label:'Harga di luar rentang',value:fmt(invalidPrices),hint:'Harga nonpositif; batas wajar perlu ditentukan'}]; const fields=['id_peternak','tanggal_penjualan','kategori_babi','berat_badan_kg','jumlah_ekor_terjual','harga_jual_per_kg']; const missing=fields.map((field)=>({field,count:rows.filter((row)=>!hasValue(row,[field])).length})); return <><Heading title="Audit Kualitas Data" description="Pemeriksaan dihitung dari transaksi aktual; baris yang ditandai sebagai contoh tidak mengubah skor kualitas." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{checks.map((item)=><Card key={item.label}><CardContent className="p-5"><p className="text-sm text-slate-500">{item.label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{item.value}</p><p className="mt-2 text-xs text-slate-500">{item.hint}</p></CardContent></Card>)}</div><div className="mt-5 grid gap-5 xl:grid-cols-2"><Card><CardHeader><CardTitle>Kelengkapan fitur dan target</CardTitle></CardHeader><CardContent>{n?missing.map((item)=><div key={item.field} className="flex items-center justify-between border-b border-slate-100 py-3 text-sm last:border-0"><span className="text-slate-700">{item.field}</span><span className={item.count?'font-semibold text-amber-700':'font-semibold text-emerald-700'}>{fmt(n-item.count)}/{fmt(n)} terisi</span></div>):<EmptyData title="Audit aktual belum dapat dihitung" detail="Belum ada transaksi lapangan. Entri contoh sengaja dipisahkan dari kualitas data aktual." />}</CardContent></Card><Card><CardHeader><CardTitle>Catatan interpretasi</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 text-sm leading-6 text-slate-600"><p><b className="text-slate-900">Target regresi:</b> harga_jual_per_kg wajib tersedia jika ingin membangun model.</p><p><b className="text-slate-900">Baris contoh:</b> workbook menandai T0001 sebagai contoh; nilainya tidak dihitung sebagai data lapangan.</p><p><b className="text-slate-900">Validasi domain:</b> batas kategori berat belum ditetapkan dan perlu konfirmasi lapangan.</p><p><b className="text-slate-900">Log_Kualitas_Data:</b> catatan awal dari workbook diperlakukan sebagai petunjuk audit, bukan bukti bahwa data sudah lengkap.</p></CardContent></Card></div></> }
function SettingsPage({ data, rows, dictionary, onImport, onExport, onExportCsv, onExportFarmsCsv, onSignOut, email }: { data: Workbook; rows: Row[]; dictionary: Row[]; onImport: (event: ChangeEvent<HTMLInputElement>) => void; onExport: () => void; onExportCsv: () => void; onExportFarmsCsv: () => void; onSignOut: () => void; email: string }) { return <><Heading title="Data & Integrasi" description="Kelola data yang tersimpan di Supabase, impor CSV atau Excel, dan unduh salinan data kapan saja." /><Card><CardHeader><CardTitle>Sumber aktif: {data.source}</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center gap-2"><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"><Upload size={16}/>Impor CSV / Excel<input type="file" accept=".csv,.xlsx,.xls,.xlsm" className="sr-only" onChange={onImport}/></label><button onClick={onExport} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download size={15}/>Ekspor workbook</button><button onClick={onExportCsv} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowDownToLine size={15}/>CSV transaksi aktual</button><button onClick={onExportFarmsCsv} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowDownToLine size={15}/>CSV peternakan</button><button onClick={onSignOut} className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><LogOut size={15}/>Keluar ({email})</button><p className="basis-full pt-1 text-xs leading-5 text-slate-500">Impor CSV satu tabel atau workbook Excel FarmScope. Data peternakan dan transaksi akan ditambahkan atau diperbarui di Supabase; ID yang sama akan diperbarui, bukan digandakan. Semua sesi dashboard untuk akun ini menerima perubahan realtime.</p></CardContent></Card><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(data.sheets).map(([name,items])=><Card key={name}><CardContent className="p-4"><p className="text-xs text-slate-500">{name}</p><p className="mt-1 text-xl font-bold text-slate-900">{fmt(items.length)} baris</p></CardContent></Card>)}</div><Card className="mt-5"><CardHeader><CardTitle>Kamus variabel ({fmt(dictionary.length)})</CardTitle><p className="text-xs text-slate-500">Kunci, definisi, satuan, prioritas, serta catatan pengumpulan dari sheet Kamus_Variabel.</p></CardHeader><CardContent className="p-0"><div className="max-h-[420px] overflow-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Sheet</th><th className="px-4 py-3">Variabel</th><th className="px-4 py-3">Definisi</th><th className="px-4 py-3">Tipe</th><th className="px-4 py-3">Satuan</th><th className="px-4 py-3">Peran</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Cara memperoleh</th></tr></thead><tbody className="divide-y divide-slate-100">{dictionary.map((row,i)=><tr key={`${text(row.variabel)}-${i}`}><td className="px-4 py-2.5 text-slate-500">{text(row.sheet)}</td><td className="px-4 py-2.5 font-mono text-xs text-slate-800">{text(row.variabel)}</td><td className="px-4 py-2.5 text-slate-600">{text(row.definisi)}</td><td className="px-4 py-2.5 text-slate-500">{text(row.tipe_data)}</td><td className="px-4 py-2.5 text-slate-500">{text(row.satuan)}</td><td className="px-4 py-2.5 text-slate-500">{text(row.peran_model)}</td><td className="px-4 py-2.5 text-slate-500">{text(row.status)}</td><td className="px-4 py-2.5 text-slate-500">{text(row.cara_memperoleh)}</td></tr>)}</tbody></table></div></CardContent></Card><div className="mt-5"><TransactionsTable rows={rows}/></div></> }
