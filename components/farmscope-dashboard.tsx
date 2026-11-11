'use client'

import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Activity, ArrowDownToLine, ArrowUpRight, BarChart3, CalendarDays, Check, ChevronDown, CircleAlert, ClipboardList, Database, Download, FileSpreadsheet, HeartPulse, LayoutDashboard, PawPrint, Plus, Settings, ShoppingCart, Store, Trash2, Upload, Users, Weight, Wheat, X } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { pigData } from '@/lib/pig-data'
import { rancanganData } from '@/lib/rancangan-data'
import { read, utils, writeFileXLSX } from 'xlsx'

type PigRow = Record<string, unknown>
type PageKey = 'overview' | 'trends' | 'population' | 'sales' | 'categories' | 'market' | 'prediction' | 'quality' | 'settings'
type MenuItem = { key: PageKey; label: string; icon: typeof LayoutDashboard }

const menu: MenuItem[] = [
  { key: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
  { key: 'trends', label: 'Tren Harga', icon: BarChart3 },
  { key: 'population', label: 'Populasi & Produksi', icon: Users },
  { key: 'sales', label: 'Penjualan', icon: ShoppingCart },
  { key: 'categories', label: 'Kategori Ternak', icon: PawPrint },
  { key: 'market', label: 'Pasar & Toke', icon: Store },
  { key: 'prediction', label: 'Prediksi Harga', icon: Activity },
  { key: 'quality', label: 'Kualitas Data', icon: ClipboardList },
  { key: 'settings', label: 'Pengaturan', icon: Settings },
]
const teal = '#27b8ac'
const mint = '#70e2d4'
const lilac = '#b49af8'
const orange = '#f4a33b'
const healthColors: Record<string, string> = { Normal: '#27b8ac', Sakit: '#ef5350', 'Perlu perhatian': '#f4a33b', Kosong: '#8b9bb1' }
const number = (value: number) => new Intl.NumberFormat('id-ID').format(value)
const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
const cleanText = (value: unknown) => String(value ?? '').trim().toLowerCase()
const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const healthLabel = (value: unknown) => {
  const raw = cleanText(value)
  if (!raw) return 'Kosong'
  if (raw.includes('normal')) return 'Normal'
  if (raw.includes('sakit') || raw.includes('skit')) return 'Sakit'
  if (raw.includes('perlu') || raw.includes('perhatian')) return 'Perlu perhatian'
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}
const marketRows = rancanganData.market as readonly Record<string, unknown>[]
const farmRows = rancanganData.farms as readonly Record<string, unknown>[]

export function FarmScopeDashboard() {
  const [rows, setRows] = useState<PigRow[]>(() => pigData as unknown as PigRow[])
  const [activePage, setActivePage] = useState<PageKey>('overview')
  const [range, setRange] = useState<'all' | '30' | '90'>('all')
  const [selectedPen, setSelectedPen] = useState('Semua kandang')
  const [notice, setNotice] = useState('')

  const filteredRows = useMemo(() => {
    const validDates = rows.map((row) => new Date(String(row.tanggal ?? '')).getTime()).filter(Number.isFinite)
    const newest = Math.max(...validDates, 0)
    const cutoff = range === 'all' ? 0 : newest - Number(range) * 24 * 60 * 60 * 1000
    return rows.filter((row) => {
      const time = new Date(String(row.tanggal ?? '')).getTime()
      return (selectedPen === 'Semua kandang' || String(row.id_kandang ?? '') === selectedPen) && (range === 'all' || !Number.isFinite(time) || time >= cutoff)
    })
  }, [rows, range, selectedPen])

  const stats = useMemo(() => {
    const weights = filteredRows.map((row) => numeric(row.bobot_kg)).filter((value) => Number.isFinite(value) && value >= 0 && value <= 150)
    const feeds = filteredRows.map((row) => numeric(row.pakan_kandang_kg)).filter(Number.isFinite)
    const costs = filteredRows.map((row) => numeric(row.biaya_pakan_kandang_rp)).filter(Number.isFinite)
    const missing = filteredRows.reduce((sum, row) => sum + Object.values(row).filter((value) => value === null || value === '').length, 0)
    const invalid = filteredRows.filter((row) => {
      const weight = numeric(row.bobot_kg)
      const age = numeric(row.umur_hari)
      const temp = numeric(row.suhu_kandang_c)
      const cost = numeric(row.biaya_pakan_kandang_rp)
      return (Number.isFinite(weight) && (weight < 0 || weight > 150)) || (Number.isFinite(age) && (age < 0 || age > 365)) || (Number.isFinite(temp) && (temp < 15 || temp > 40)) || (Number.isFinite(cost) && cost < 0)
    }).length
    return { avgWeight: average(weights), avgFeed: average(feeds), avgCost: average(costs), missing, invalid }
  }, [filteredRows])

  const animals = useMemo(() => new Set(filteredRows.map((row) => String(row.id_ternak ?? row.id_babi ?? '')).filter(Boolean)).size, [filteredRows])
  const activePens = useMemo(() => [...new Set(rows.map((row) => String(row.id_kandang ?? '')).filter(Boolean))], [rows])
  const healthData = useMemo(() => {
    const counts = new Map<string, number>()
    filteredRows.forEach((row) => {
      const label = healthLabel(row.status_kesehatan)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    })
    return [...counts].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [filteredRows])
  const populationData = useMemo(() => {
    const map = new Map<string, { animals: Set<string>; observations: number; weight: number; weights: number }>()
    filteredRows.forEach((row, index) => {
      const pen = String(row.id_kandang ?? 'Tanpa kandang')
      const item = map.get(pen) ?? { animals: new Set<string>(), observations: 0, weight: 0, weights: 0 }
      const animalId = String(row.id_ternak ?? row.id_babi ?? `baris-${index}`)
      item.animals.add(animalId)
      item.observations++
      const weight = numeric(row.bobot_kg)
      if (Number.isFinite(weight) && weight > 0 && weight <= 150) {
        item.weight += weight
        item.weights++
      }
      map.set(pen, item)
    })
    return [...map].map(([kandang, value]) => ({ kandang, populasi: value.animals.size, observasi: value.observations, bobot: Number((value.weight / Math.max(value.weights, 1)).toFixed(1)) }))
  }, [filteredRows])
  const weightCategories = useMemo(() => {
    const bins = [{ name: 'Kecil (≤30 kg)', min: -Infinity, max: 30, color: teal }, { name: 'Sedang (31–60 kg)', min: 30, max: 60, color: '#3986ef' }, { name: 'Besar (>60 kg)', min: 60, max: Infinity, color: orange }]
    return bins.map((bin) => ({ ...bin, value: filteredRows.filter((row) => { const weight = numeric(row.bobot_kg); return Number.isFinite(weight) && weight > 0 && weight <= 150 && weight > bin.min && weight <= bin.max }).length }))
  }, [filteredRows])
  const dailyTrend = useMemo(() => {
    const map = new Map<string, { weight: number; weights: number; feed: number; feeds: number }>()
    filteredRows.forEach((row) => {
      const dateValue = String(row.tanggal ?? '').slice(0, 10)
      const key = dateValue || 'Tanpa tanggal'
      const item = map.get(key) ?? { weight: 0, weights: 0, feed: 0, feeds: 0 }
      const weight = numeric(row.bobot_kg)
      const feed = numeric(row.pakan_kandang_kg)
      if (Number.isFinite(weight) && weight > 0 && weight <= 150) { item.weight += weight; item.weights++ }
      if (Number.isFinite(feed)) { item.feed += feed; item.feeds++ }
      map.set(key, item)
    })
    return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([date, item]) => ({ date: date === 'Tanpa tanggal' ? date : new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }), weight: item.weights ? Number((item.weight / item.weights).toFixed(1)) : null, feed: item.feeds ? Number((item.feed / item.feeds).toFixed(1)) : null }))
  }, [filteredRows])
  const weeklyMarket = useMemo(() => {
    const map = new Map<string, number[]>()
    marketRows.forEach((row) => {
      const period = String(row.periode_pengamatan ?? 'Tanpa periode')
      const value = numeric(row.harga_pakan_rp_per_karung)
      if (Number.isFinite(value)) map.set(period, [...(map.get(period) ?? []), value])
    })
    return [...map].map(([period, prices]) => ({ period: period.replace('Minggu ke-', 'M'), average: Math.round(average(prices)), highest: Math.max(...prices), lowest: Math.min(...prices) }))
      .sort((a, b) => Number(a.period.slice(1)) - Number(b.period.slice(1)))
  }, [])
  const farmPopulation = useMemo(() => farmRows.reduce((sum, farm) => sum + (numeric(farm.jumlah_ternak_saat_pendataan_ekor) || 0), 0), [])
  const averageFeedPrice = useMemo(() => average(marketRows.map((row) => numeric(row.harga_pakan_rp_per_karung)).filter(Number.isFinite)), [])
  const quality = useMemo(() => {
    const cells = filteredRows.reduce((sum, row) => sum + Object.keys(row).length, 0)
    return { completeness: cells ? Math.max(0, 100 - (stats.missing / cells) * 100) : 100, missingRate: cells ? (stats.missing / cells) * 100 : 0, duplicateRate: filteredRows.length ? ((filteredRows.length - new Set(filteredRows.map((row) => String(row.id_pengamatan ?? row.id_ternak ?? ''))).size) / filteredRows.length) * 100 : 0, anomalyRate: filteredRows.length ? (stats.invalid / filteredRows.length) * 100 : 0 }
  }, [filteredRows, stats])

  const exportCsv = () => {
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const csv = [columns, ...rows.map((row) => columns.map((column) => row[column]))].map((line) => line.map(quote).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
    link.download = 'farmscope-dataset.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }
  const exportExcel = () => {
    const workbook = utils.book_new()
    utils.book_append_sheet(workbook, utils.json_to_sheet(rows), 'Data Ternak')
    writeFileXLSX(workbook, 'farmscope-dataset.xlsx')
  }
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const workbook = read(await file.arrayBuffer(), { cellDates: true })
      const imported = utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: null }) as PigRow[]
      if (!imported.length) throw new Error('File tidak memiliki baris data.')
      setRows(imported)
      setNotice(`${number(imported.length)} baris berhasil dimuat. Semua ringkasan dan grafik sudah diperbarui.`)
      setActivePage('overview')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'File gagal dibaca.')
    } finally {
      event.target.value = ''
    }
  }
  const addRow = (row: PigRow) => {
    setRows((current) => [row, ...current])
    setNotice('Data baru tersimpan dan langsung dihitung di semua grafik.')
  }

  return <div className="fs-app min-h-screen bg-[#f4f7f8] text-[#202b3a]">
    <aside className="fs-sidebar fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col border-r border-slate-200/80 bg-white px-4 py-7 md:flex">
      <div className="flex items-center gap-3 px-2 pb-8">
        <div className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-[#007f77] text-[#b5fff2] shadow-[0_10px_22px_rgba(0,127,119,.2)]"><PawPrint size={31} strokeWidth={1.8} /></div>
        <div><p className="text-[19px] font-bold tracking-tight text-[#1e293b]">FarmScope</p><p className="mt-0.5 text-[13px] text-[#718096]">Data Intelligence</p></div>
      </div>
      <nav aria-label="Navigasi utama" className="flex flex-col gap-1.5">
        {menu.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => setActivePage(key)} aria-current={activePage === key ? 'page' : undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-left text-[14px] font-medium transition-colors ${activePage === key ? 'bg-[#e4f8f5] text-[#087f77]' : 'text-[#65748a] hover:bg-slate-50 hover:text-slate-900'}`}><Icon size={19} strokeWidth={2} />{label}</button>)}
      </nav>
      <div className="fs-sidebar-farm mt-auto overflow-hidden rounded-[20px] p-4 text-white">
        <div className="relative z-[1]"><p className="text-sm font-semibold">Peternakan terpantau</p><p className="mt-1 text-xs text-white/80">{number(farmRows.length)} lokasi · {number(farmPopulation)} ekor terdaftar</p><span className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-white/90"><span className="size-2 rounded-full bg-emerald-400" /> Dataset simulasi aktif</span></div>
      </div>
    </aside>

    <div className="min-h-screen md:pl-[260px]">
      <header className="fs-hero relative isolate overflow-hidden px-5 pb-7 pt-6 sm:px-8 lg:px-9">
        <div className="relative z-10 mx-auto flex max-w-[1540px] flex-wrap items-start justify-between gap-5">
          <div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#138e84]">Pemodelan prediksi harga jual babi</p><h1 className="mt-1 text-[27px] font-bold leading-tight tracking-[-.035em] text-[#202a39] sm:text-[32px]">Dashboard Analisis Peternakan Babi</h1><p className="mt-2 text-sm text-[#556579]">Memahami tren harga, populasi, dan produksi dari dataset aktif.</p></div>
          <div className="flex items-center gap-2 self-start">
            <label className="flex h-10 items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur"><CalendarDays size={16} className="text-[#138e84]" /><span className="sr-only">Rentang tanggal</span><select aria-label="Rentang tanggal" value={range} onChange={(event) => setRange(event.target.value as 'all' | '30' | '90')} className="max-w-[142px] bg-transparent outline-none"><option value="all">Semua periode</option><option value="30">30 hari terakhir</option><option value="90">90 hari terakhir</option></select><ChevronDown size={14} /></label>
            <label className="hidden h-10 items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 text-xs font-medium text-slate-700 shadow-sm sm:flex"><span>Kandang</span><select aria-label="Filter kandang" value={selectedPen} onChange={(event) => setSelectedPen(event.target.value)} className="max-w-24 bg-transparent font-semibold outline-none"><option>Semua kandang</option>{activePens.map((pen) => <option key={pen}>{pen}</option>)}</select><ChevronDown size={14} /></label>
            <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#087f77] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#066b65]"><Download size={15} />Export</button>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white px-4 py-2 md:hidden"><nav aria-label="Navigasi utama" className="flex gap-1 overflow-x-auto">{menu.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => setActivePage(key)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${activePage === key ? 'bg-[#e4f8f5] text-[#087f77]' : 'text-slate-500'}`}><Icon size={15} />{label}</button>)}</nav></div>
      <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-5">
        {notice && <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900"><span>{notice}</span><button aria-label="Tutup pemberitahuan" onClick={() => setNotice('')}><X size={16} /></button></div>}
        {activePage === 'overview' && <Overview rows={filteredRows} allRows={rows} stats={stats} animals={animals} farmPopulation={farmPopulation} avgFeedPrice={averageFeedPrice} populationData={populationData} marketData={weeklyMarket} categories={weightCategories} healthData={healthData} quality={quality} onPage={setActivePage} />}
        {activePage === 'trends' && <TrendsPage rows={filteredRows} marketData={weeklyMarket} />}
        {activePage === 'population' && <PopulationPage data={populationData} />}
        {activePage === 'sales' && <SalesPage onManage={() => setActivePage('settings')} />}
        {activePage === 'categories' && <CategoriesPage categories={weightCategories} healthData={healthData} />}
        {activePage === 'market' && <MarketPage data={weeklyMarket} />}
        {activePage === 'prediction' && <PredictionPage data={weeklyMarket} />}
        {activePage === 'quality' && <QualityPage rows={filteredRows} stats={stats} quality={quality} />}
        {activePage === 'settings' && <DataManager rows={rows} onImport={importFile} onExportCsv={exportCsv} onExportExcel={exportExcel} onAdd={addRow} onRows={setRows} onNotice={setNotice} />}
      </main>
    </div>
  </div>
}

function Overview({ rows, allRows, stats, animals, farmPopulation, avgFeedPrice, populationData, marketData, categories, healthData, quality, onPage }: { rows: PigRow[]; allRows: PigRow[]; stats: { avgWeight: number; avgFeed: number; avgCost: number; missing: number; invalid: number }; animals: number; farmPopulation: number; avgFeedPrice: number; populationData: { kandang: string; populasi: number; observasi: number; bobot: number }[]; marketData: { period: string; average: number; highest: number; lowest: number }[]; categories: { name: string; min: number; max: number; color: string; value: number }[]; healthData: { name: string; value: number }[]; quality: { completeness: number; missingRate: number; duplicateRate: number; anomalyRate: number }; onPage: (page: PageKey) => void }) {
  const metrics = [
    { label: 'Total observasi', value: number(rows.length), detail: `${number(allRows.length)} baris dalam dataset`, icon: BarChart3, tone: 'dark' },
    { label: 'Ternak terpantau', value: `${number(animals)} ekor`, detail: 'ID ternak unik di filter aktif', icon: PawPrint, tone: 'light' },
    { label: 'Rata-rata bobot', value: `${stats.avgWeight.toFixed(1)} kg`, detail: 'Dari pengukuran yang valid', icon: Weight, tone: 'dark' },
    { label: 'Populasi peternakan', value: `${number(farmPopulation)} ekor`, detail: `${farmRows.length} lokasi terdaftar · simulasi`, icon: Users, tone: 'light' },
    { label: 'Harga pakan rata-rata', value: rupiah(avgFeedPrice), detail: 'Per karung · Data Pasar', icon: Wheat, tone: 'dark' },
  ]
  return <div className="flex flex-col gap-4">
    <section aria-label="Metrik utama" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{metrics.map(({ label, value, detail, icon: Icon, tone }) => <article key={label} className={`fs-kpi ${tone === 'light' ? 'fs-kpi-light' : 'fs-kpi-dark'}`}><div className="flex items-center justify-between"><Icon size={26} className={tone === 'light' ? 'text-[#087f77]' : 'text-[#5ae0d0]'} strokeWidth={2.2} /><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${tone === 'light' ? 'bg-emerald-100 text-emerald-700' : 'bg-white/10 text-emerald-300'}`}><Check size={11} className="mr-1 inline" />Aktif</span></div><p className={`mt-4 text-[12px] font-medium ${tone === 'light' ? 'text-[#31565b]' : 'text-white/85'}`}>{label}</p><p className={`mt-1 text-[22px] font-bold tracking-tight ${tone === 'light' ? 'text-[#142b32]' : 'text-white'}`}>{value}</p><p className={`mt-1 text-[10px] ${tone === 'light' ? 'text-[#5a7b7d]' : 'text-white/60'}`}>{detail}</p><Sparkline values={[12, 15, 14, 19, 18, 24, 26]} color={tone === 'light' ? '#299b91' : '#51d9c8'} /></article>)}</section>
    <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      <Panel title="Tren Harga Pasar" subtitle="Harga pakan per karung · agregasi dari data pasar" icon={<Activity size={23} className="text-[#48d5c8]" />}><ChartContainer config={{ average: { label: 'Harga rata-rata', color: teal }, highest: { label: 'Harga tertinggi', color: '#a9b5c9' }, lowest: { label: 'Harga terendah', color: orange } }} className="fs-chart h-[190px] w-full"><LineChart data={marketData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="period" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} width={50} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} /><Tooltip content={<ChartTooltipContent formatter={(value) => rupiah(Number(value))} />} /><Line dataKey="highest" stroke="var(--color-highest)" strokeWidth={2} dot={{ r: 3 }} /><Line dataKey="average" stroke="var(--color-average)" strokeWidth={2.5} dot={{ r: 3 }} /><Line dataKey="lowest" stroke="var(--color-lowest)" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ChartContainer></Panel>
      <Panel title="Populasi & Observasi" subtitle="Ternak terpantau dan catatan produksi per kandang" icon={<BarChart3 size={23} className="text-[#48d5c8]" />}><ChartContainer config={{ populasi: { label: 'Ternak terpantau', color: teal }, observasi: { label: 'Observasi', color: lilac } }} className="fs-chart h-[190px] w-full"><BarChart data={populationData} margin={{ left: 0, right: 4, top: 12, bottom: 0 }}><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="kandang" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={34} /><Tooltip content={<ChartTooltipContent />} /><Bar dataKey="populasi" fill="var(--color-populasi)" radius={[5, 5, 0, 0]} /><Bar dataKey="observasi" fill="var(--color-observasi)" radius={[5, 5, 0, 0]} /></BarChart></ChartContainer></Panel>
    </section>
    <section className="grid gap-4 xl:grid-cols-[.9fr_1.35fr_1fr]">
      <Panel title="Distribusi Kategori Ternak" subtitle="Kelompok berdasarkan bobot aktual" icon={<BarChart3 size={22} className="text-[#48d5c8]" />}><div className="flex items-center gap-2"><ChartContainer config={{ value: { label: 'Ternak', color: teal } }} className="fs-chart h-[190px] min-w-0 flex-1"><PieChart><Pie data={categories} dataKey="value" nameKey="name" innerRadius="42%" outerRadius="78%" paddingAngle={2} stroke="transparent">{categories.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip content={<ChartTooltipContent hideLabel />} /></PieChart></ChartContainer><div className="flex min-w-28 flex-col gap-3">{categories.map((item) => <div key={item.name} className="flex items-start gap-2 text-[10px] leading-4 text-slate-300"><span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: item.color }} /><span>{item.name}<b className="block text-xs text-white">{number(item.value)} ekor</b></span></div>)}</div></div></Panel>
      <Panel title="Prediksi Harga Jual" subtitle="Kesiapan model berdasarkan kelengkapan dataset" icon={<Activity size={22} className="text-[#48d5c8]" />}><div className="flex h-[150px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/40 px-4 text-center"><span className="grid size-11 place-items-center rounded-full bg-violet-400/10 text-violet-300"><CircleAlert size={22} /></span><p className="mt-3 text-sm font-semibold text-white">Data harga jual belum tersedia</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">Rancangan berisi harga pakan, bukan harga transaksi babi. Tambahkan kolom harga jual aktual agar model prediksi dapat dihitung tanpa mengarang data.</p><button type="button" onClick={() => onPage('settings')} className="mt-3 text-xs font-semibold text-teal-300 hover:text-teal-200">Buka pengelolaan dataset <ArrowUpRight size={13} className="ml-1 inline" /></button></div></Panel>
      <Panel title="Kualitas Data" subtitle="Pemeriksaan dataset aktif" icon={<HeartPulse size={22} className="text-[#48d5c8]" />}><div className="flex items-center justify-between"><span className="text-sm font-semibold text-white">Kelengkapan</span><span className="rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-bold text-emerald-950">{quality.completeness >= 98 ? 'Baik' : 'Perlu cek'}</span></div><QualityLine label="Data kosong" value={`${quality.missingRate.toFixed(1)}%`} /><QualityLine label="Data duplikat" value={`${quality.duplicateRate.toFixed(1)}%`} /><QualityLine label="Outlier" value={`${quality.anomalyRate.toFixed(1)}%`} /><button type="button" onClick={() => onPage('quality')} className="mt-3 w-full rounded-lg border border-teal-400/30 bg-teal-400/10 px-3 py-2 text-left text-[11px] text-teal-100 transition hover:bg-teal-400/15"><span className="mr-2 inline-block size-2 rounded-full bg-teal-300" />Dataset siap dianalisis · lihat detail audit</button></Panel>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500"><span>{number(rows.length)} observasi ikut filter aktif</span><span>Seluruh nilai simulasi, bukan data lapangan.</span></div>
  </div>
}

function Sparkline({ values, color }: { values: number[]; color: string }) { const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${35 - value}`).join(' '); return <svg aria-hidden="true" viewBox="0 0 100 40" preserveAspectRatio="none" className="pointer-events-none absolute bottom-3 right-3 h-9 w-[38%] opacity-80"><polyline fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" points={points} /></svg> }
function Panel({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode }) { return <Card className="fs-panel min-w-0"><CardHeader className="flex flex-row items-start gap-3 space-y-0 px-5 pb-1 pt-5"><span className="mt-0.5 shrink-0">{icon}</span><div className="min-w-0"><CardTitle className="text-[15px] font-semibold text-white">{title}</CardTitle><p className="mt-1 text-[11px] leading-4 text-slate-400">{subtitle}</p></div></CardHeader><CardContent className="min-w-0 px-5 pb-5 pt-2">{children}</CardContent></Card> }
function QualityLine({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-slate-700/70 py-2.5 text-xs last:border-0"><span className="text-slate-300">{label}</span><b className="text-white">{value}</b></div> }
function PageHeading({ eyebrow = 'FARMSCOPE DATA INTELLIGENCE', title, description }: { eyebrow?: string; title: string; description: string }) { return <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold tracking-[.16em] text-teal-700">{eyebrow}</p><h2 className="mt-1 text-xl font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div> }

function TrendsPage({ rows, marketData }: { rows: PigRow[]; marketData: { period: string; average: number; highest: number; lowest: number }[] }) {
  const weights = rows.map((row) => numeric(row.bobot_kg)).filter((value) => Number.isFinite(value) && value > 0 && value <= 150)
  return <><PageHeading title="Tren Harga & Produksi" description="Harga pakan pasar dan pengukuran bobot/pakan dari dataset aktif." /><div className="grid gap-5 xl:grid-cols-2"><Panel title="Harga pakan di pasar" subtitle="Rata-rata dan rentang harga per karung" icon={<Activity className="text-teal-300" />}><ChartContainer config={{ average: { label: 'Rata-rata', color: teal }, highest: { label: 'Tertinggi', color: lilac }, lowest: { label: 'Terendah', color: orange } }} className="fs-chart h-[320px]"><LineChart data={marketData}><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="period" /><YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} /><Tooltip content={<ChartTooltipContent formatter={(value) => rupiah(Number(value))} />} /><Line dataKey="average" stroke="var(--color-average)" strokeWidth={3} dot={{ r: 4 }} /><Line dataKey="highest" stroke="var(--color-highest)" strokeWidth={2} /><Line dataKey="lowest" stroke="var(--color-lowest)" strokeWidth={2} /></LineChart></ChartContainer></Panel><Panel title="Bobot & pakan terukur" subtitle="Nilai aktual dari observasi ternak" icon={<Weight className="text-teal-300" />}><ChartContainer config={{ bobot: { label: 'Bobot (kg)', color: teal }, pakan: { label: 'Pakan (kg)', color: lilac } }} className="fs-chart h-[320px]"><LineChart data={rows.slice(0, 80).map((row) => ({ bobot: numeric(row.bobot_kg), pakan: numeric(row.pakan_kandang_kg), date: String(row.tanggal ?? '').slice(0, 10) }))}><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="date" hide /><YAxis /><Tooltip content={<ChartTooltipContent />} /><Line dataKey="bobot" stroke="var(--color-bobot)" dot={false} connectNulls /><Line dataKey="pakan" stroke="var(--color-pakan)" dot={false} connectNulls /></LineChart></ChartContainer></Panel></div><p className="mt-3 text-xs text-slate-500">Dataset ini belum memuat harga jual babi. Harga pada grafik adalah harga pakan dari sheet pasar. Rata-rata bobot ternak valid saat ini: {average(weights).toFixed(1)} kg.</p></>
}
function PopulationPage({ data }: { data: { kandang: string; populasi: number; observasi: number; bobot: number }[] }) { return <><PageHeading title="Populasi & Produksi" description="Jumlah individu unik, volume observasi, dan bobot rata-rata per kandang berdasarkan dataset aktif." /><div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]"><Panel title="Populasi terpantau per kandang" subtitle="ID individu unik dibanding jumlah observasi" icon={<Users className="text-teal-300" />}><ChartContainer config={{ populasi: { label: 'Individu unik', color: teal }, observasi: { label: 'Observasi', color: lilac } }} className="fs-chart h-[350px]"><BarChart data={data}><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="kandang" /><YAxis allowDecimals={false} /><Tooltip content={<ChartTooltipContent />} /><Bar dataKey="populasi" fill="var(--color-populasi)" radius={[5, 5, 0, 0]} /><Bar dataKey="observasi" fill="var(--color-observasi)" radius={[5, 5, 0, 0]} /></BarChart></ChartContainer></Panel><Card><CardHeader><CardTitle>Ringkasan kandang</CardTitle></CardHeader><CardContent className="space-y-3">{data.map((item) => <div key={item.kandang} className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><p className="font-semibold text-slate-800">{item.kandang}</p><p className="text-xs text-slate-500">{number(item.observasi)} observasi</p></div><div className="text-right"><p className="font-bold text-teal-800">{number(item.populasi)} ekor</p><p className="text-xs text-slate-500">{item.bobot.toFixed(1)} kg rata-rata</p></div></div>)}</CardContent></Card></div></> }
function CategoriesPage({ categories, healthData }: { categories: { name: string; value: number; color: string }[]; healthData: { name: string; value: number }[] }) { return <><PageHeading title="Kategori Ternak" description="Komposisi ternak menurut kelas bobot aktual dan status kesehatan yang dinormalisasi." /><div className="grid gap-5 xl:grid-cols-2"><Panel title="Kelompok bobot" subtitle="Bobot valid (0–150 kg)" icon={<PawPrint className="text-teal-300" />}><ChartContainer config={{ value: { label: 'Jumlah ternak', color: teal } }} className="fs-chart h-[330px]"><PieChart><Pie data={categories} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="83%" paddingAngle={3}>{categories.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip content={<ChartTooltipContent hideLabel />} /></PieChart></ChartContainer></Panel><Panel title="Status kesehatan" subtitle="Label mentah dinormalisasi untuk perhitungan" icon={<HeartPulse className="text-teal-300" />}><ChartContainer config={{ value: { label: 'Observasi', color: teal } }} className="fs-chart h-[330px]"><BarChart data={healthData} layout="vertical" margin={{ left: 12, right: 20 }}><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={125} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltipContent />} /><Bar dataKey="value" fill="var(--color-value)" radius={[0, 8, 8, 0]} /></BarChart></ChartContainer></Panel></div></> }
function MarketPage({ data }: { data: { period: string; average: number; highest: number; lowest: number }[] }) { return <><PageHeading title="Pasar & Toke" description="Ringkasan permintaan dan harga pakan dari rancangan workbook. Angka bersifat simulasi." /><div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]"><Panel title="Pergerakan harga pakan" subtitle="Harga per karung, agregasi lintas lokasi" icon={<Store className="text-teal-300" />}><ChartContainer config={{ average: { label: 'Harga rata-rata', color: teal }, highest: { label: 'Harga tertinggi', color: lilac }, lowest: { label: 'Harga terendah', color: orange } }} className="fs-chart h-[350px]"><AreaChart data={data}><defs><linearGradient id="marketFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={teal} stopOpacity={0.32} /><stop offset="95%" stopColor={teal} stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="period" /><YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} /><Tooltip content={<ChartTooltipContent formatter={(value) => rupiah(Number(value))} />} /><Area dataKey="average" stroke="var(--color-average)" fill="url(#marketFill)" strokeWidth={2.5} /><Line dataKey="highest" stroke="var(--color-highest)" /><Line dataKey="lowest" stroke="var(--color-lowest)" /></AreaChart></ChartContainer></Panel><Card><CardHeader><CardTitle>Rangkuman harga</CardTitle></CardHeader><CardContent className="space-y-3">{data.map((item) => <div key={item.period} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span className="font-medium text-slate-700">{item.period}</span><span className="text-right"><b className="block text-slate-900">{rupiah(item.average)}</b><small className="text-slate-500">Rentang {rupiah(item.lowest)}–{rupiah(item.highest)}</small></span></div>)}</CardContent></Card></div></> }
function SalesPage({ onManage }: { onManage: () => void }) { return <><PageHeading title="Penjualan" description="Bagian ini menampilkan data transaksi penjualan jika tersedia." /><Card><CardContent className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-teal-50 text-teal-700"><ShoppingCart size={27} /></span><h3 className="mt-4 text-lg font-bold text-slate-900">Belum ada transaksi penjualan</h3><p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">Workbook aktif berisi pengamatan ternak dan harga pakan, tetapi belum memiliki catatan transaksi atau harga jual babi. Unggah dataset yang memiliki kolom transaksi dan harga aktual untuk mengisi halaman ini.</p><button onClick={onManage} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"><Upload size={16} />Kelola / unggah dataset</button></CardContent></Card></> }
function PredictionPage({ data }: { data: { period: string; average: number; highest: number; lowest: number }[] }) { return <><PageHeading title="Prediksi Harga" description="Status kesiapan model harga jual berdasarkan kolom yang benar-benar tersedia." /><div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><Card><CardHeader><CardTitle>Kesiapan prediksi harga jual</CardTitle></CardHeader><CardContent><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="flex items-center gap-2 font-semibold text-amber-950"><CircleAlert size={19} />Model harga jual babi belum dapat dihitung</p><p className="mt-2 text-sm leading-6 text-amber-900">Dataset tidak memiliki kolom harga jual aktual atau riwayat transaksi. Harga pakan tidak dapat dianggap sebagai harga jual ternak. Tambahkan data transaksi dan harga jual untuk melatih model yang dapat dipertanggungjawabkan.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Readiness label="Berat badan" value="Tersedia" good /><Readiness label="Umur & jenis" value="Tersedia" good /><Readiness label="Tanggal transaksi" value="Belum lengkap" /><Readiness label="Harga jual aktual" value="Belum tersedia" /></div></CardContent></Card><Panel title="Indikator pasar tersedia" subtitle="Harga pakan dari workbook (bukan harga jual babi)" icon={<Activity className="text-teal-300" />}><ChartContainer config={{ average: { label: 'Harga pakan', color: teal } }} className="fs-chart h-[300px]"><LineChart data={data}><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="period" /><YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} /><Tooltip content={<ChartTooltipContent formatter={(value) => rupiah(Number(value))} />} /><Line dataKey="average" stroke="var(--color-average)" strokeWidth={2.5} dot={{ r: 4 }} /></LineChart></ChartContainer></Panel></div></> }
function Readiness({ label, value, good = false }: { label: string; value: string; good?: boolean }) { return <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs"><span className="text-slate-600">{label}</span><span className={`font-semibold ${good ? 'text-emerald-700' : 'text-amber-700'}`}>{value}</span></div> }
function QualityPage({ rows, stats, quality }: { rows: PigRow[]; stats: { missing: number; invalid: number }; quality: { completeness: number; missingRate: number; duplicateRate: number; anomalyRate: number } }) { const checks = [{ label: 'Data kosong', value: `${quality.missingRate.toFixed(1)}%`, hint: `${number(stats.missing)} sel perlu ditinjau` }, { label: 'Data duplikat', value: `${quality.duplicateRate.toFixed(1)}%`, hint: 'ID observasi atau ternak berulang' }, { label: 'Outlier', value: `${quality.anomalyRate.toFixed(1)}%`, hint: `${number(stats.invalid)} baris di luar rentang` }, { label: 'Konsistensi kategori', value: 'Tinjau label', hint: 'Normalisasi label otomatis digunakan' }]; return <><PageHeading title="Kualitas Data" description="Audit kualitas dataset aktif. Semua indikator dihitung ulang saat data diganti." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{checks.map((item) => <Card key={item.label}><CardContent className="p-5"><p className="text-sm text-slate-500">{item.label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{item.value}</p><p className="mt-2 text-xs text-slate-500">{item.hint}</p></CardContent></Card>)}</div><Card><CardHeader><CardTitle>Ringkasan audit</CardTitle></CardHeader><CardContent><div className="flex items-center justify-between gap-4"><div><p className="text-3xl font-bold text-teal-800">{quality.completeness.toFixed(1)}%</p><p className="mt-1 text-sm text-slate-500">kelengkapan data · {number(rows.length)} observasi aktif</p></div><div className="h-3 w-1/2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${quality.completeness}%` }} /></div></div></CardContent></Card></> }

function DataManager({ rows, onImport, onExportCsv, onExportExcel, onAdd, onRows, onNotice }: { rows: PigRow[]; onImport: (event: ChangeEvent<HTMLInputElement>) => void; onExportCsv: () => void; onExportExcel: () => void; onAdd: (row: PigRow) => void; onRows: (rows: PigRow[]) => void; onNotice: (notice: string) => void }) {
  const [draft, setDraft] = useState({ id_ternak: '', id_kandang: 'K01', tanggal: new Date().toISOString().slice(0, 10), bobot_kg: '', status_kesehatan: 'Normal', jenis_kelamin: 'Jantan' })
  const update = (field: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [field]: value }))
  const add = () => {
    if (!draft.id_ternak.trim() || !draft.bobot_kg || Number(draft.bobot_kg) <= 0) { onNotice('Isi ID ternak dan bobot yang valid sebelum menyimpan.'); return }
    const template = rows[0] ?? {}
    const blankRow = Object.fromEntries(Object.keys(template).map((key) => [key, null]))
    onAdd({ ...blankRow, ...draft, id_pengamatan: `OBS-${Date.now()}`, umur_hari: null, bobot_kg: Number(draft.bobot_kg) })
    setDraft((current) => ({ ...current, id_ternak: '', bobot_kg: '' }))
  }
  const edit = (index: number, field: string, value: string) => onRows(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: field === 'bobot_kg' ? Number(value) : value } : row))
  const remove = (index: number) => { if (window.confirm('Hapus baris data ini?')) { onRows(rows.filter((_, rowIndex) => rowIndex !== index)); onNotice('Baris berhasil dihapus. Semua visualisasi ikut diperbarui.') } }
  const clear = () => { if (rows.length && window.confirm(`Hapus semua ${number(rows.length)} baris aktif dari dashboard?`)) { onRows([]); onNotice('Dataset aktif sudah dikosongkan.') } }
  return <><PageHeading title="Pengaturan & Dataset" description="Tambahkan, edit, hapus, impor, dan ekspor data. Setiap perubahan langsung memperbarui semua grafik." /><Card><CardHeader><CardTitle>Impor dan ekspor dataset</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center gap-2"><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"><Upload size={16} />Impor CSV / Excel<input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={onImport} /></label><button onClick={onExportCsv} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download size={15} />Unduh CSV</button><button onClick={onExportExcel} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileSpreadsheet size={15} />Unduh Excel</button><button onClick={clear} className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Trash2 size={15} />Hapus semua</button><p className="basis-full pt-1 text-xs text-slate-500">Impor akan mengganti dataset aktif di memori dashboard. Ekspor mengunduh kondisi data terkini.</p></CardContent></Card>
    <Card><CardHeader><CardTitle>Tambah data ternak</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([['ID ternak', 'id_ternak', 'text'], ['Kandang', 'id_kandang', 'text'], ['Tanggal', 'tanggal', 'date'], ['Bobot (kg)', 'bobot_kg', 'number'], ['Jenis kelamin', 'jenis_kelamin', 'text'], ['Status kesehatan', 'status_kesehatan', 'text']] as const).map(([label, key, type]) => <label key={key} className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">{label}<input type={type} value={draft[key]} onChange={(event) => update(key, event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100" /></label>)}</div><button onClick={add} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"><Plus size={16} />Simpan data</button></CardContent></Card>
    <Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Dataset aktif</CardTitle><p className="mt-1 text-xs text-slate-500">Edit bobot dan kesehatan langsung di tabel.</p></div><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">{number(rows.length)} baris</span></CardHeader><CardContent className="p-0"><div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">ID ternak</th><th className="px-4 py-3">Kandang</th><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Bobot kg</th><th className="px-4 py-3">Kesehatan</th><th className="px-4 py-3">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.slice(0, 150).map((row, index) => <tr key={`${String(row.id_pengamatan ?? row.id_ternak ?? index)}-${index}`} className="hover:bg-slate-50/80"><td className="px-4 py-2.5 font-medium text-slate-800">{String(row.id_ternak ?? row.id_babi ?? '—')}</td><td className="px-4 py-2.5"><input aria-label={`Edit kandang baris ${index + 1}`} value={String(row.id_kandang ?? '')} onChange={(event) => edit(index, 'id_kandang', event.target.value)} className="w-20 rounded border border-transparent bg-transparent px-2 py-1 hover:border-slate-200 focus:border-teal-500 focus:bg-white" /></td><td className="px-4 py-2.5 text-slate-500">{String(row.tanggal ?? '—')}</td><td className="px-4 py-2.5"><input type="number" aria-label={`Edit bobot baris ${index + 1}`} value={String(row.bobot_kg ?? '')} onChange={(event) => edit(index, 'bobot_kg', event.target.value)} className="w-24 rounded border border-transparent bg-transparent px-2 py-1 hover:border-slate-200 focus:border-teal-500 focus:bg-white" /></td><td className="px-4 py-2.5"><select aria-label={`Edit status kesehatan baris ${index + 1}`} value={healthLabel(row.status_kesehatan)} onChange={(event) => edit(index, 'status_kesehatan', event.target.value)} className="rounded border border-transparent bg-transparent px-2 py-1 hover:border-slate-200 focus:border-teal-500 focus:bg-white"><option>Normal</option><option>Sakit</option><option>Perlu perhatian</option><option>Kosong</option></select></td><td className="px-4 py-2.5"><button aria-label={`Hapus baris ${index + 1}`} onClick={() => remove(index)} className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={15} /></button></td></tr>)}</tbody></table>{rows.length > 150 && <p className="p-3 text-center text-xs text-slate-500">Menampilkan 150 dari {number(rows.length)} baris.</p>}</div></CardContent></Card>
  </>
}
