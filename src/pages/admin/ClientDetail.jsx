import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  ArrowLeft, Plus, X, Edit2, Trash2,
  FolderKanban, CheckCircle, FileText, Receipt,
  AlertCircle,
} from 'lucide-react'

function fmtDate(d) {
  if (!d) return '--'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const tabList = [
  { key: 'projects',     label: 'Projects',     icon: FolderKanban },
  { key: 'milestones',   label: 'Milestones',   icon: CheckCircle },
  { key: 'deliverables', label: 'Deliverables', icon: FileText },
  { key: 'invoices',     label: 'Invoices',     icon: Receipt },
]

const PROJECT_STATUSES = ['not_started', 'in_progress', 'review', 'completed']
const MILESTONE_STATUSES = ['pending', 'in_progress', 'completed']
const INVOICE_STATUSES = ['pending', 'paid', 'overdue']

export default function ClientDetail() {
  const { clientId } = useParams()
  const [client, setClient]           = useState(null)
  const [projects, setProjects]       = useState([])
  const [milestones, setMilestones]   = useState([])
  const [deliverables, setDeliverables] = useState([])
  const [invoices, setInvoices]       = useState([])
  const [tab, setTab]                 = useState('projects')
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [modal, setModal]             = useState(null)

  const fetchAll = useCallback(async () => {
    setError(null)
    try {
      const [cRes, pRes, mRes, dRes, iRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', clientId).single(),
        supabase.from('projects').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
        supabase.from('milestones').select('*, projects!inner(client_id, title)').eq('projects.client_id', clientId).order('display_order'),
        supabase.from('deliverables').select('*, projects!inner(client_id, title)').eq('projects.client_id', clientId).order('created_at', { ascending: false }),
        supabase.from('invoices').select('*, projects(title)').eq('client_id', clientId).order('created_at', { ascending: false }),
      ])
      if (cRes.error) throw cRes.error
      setClient(cRes.data)
      setProjects(pRes.data ?? [])
      setMilestones(mRes.data ?? [])
      setDeliverables(dRes.data ?? [])
      setInvoices(iRes.data ?? [])
    } catch (err) {
      setError(err.message || 'Failed to load client')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleSaved = () => {
    setModal(null)
    setLoading(true)
    fetchAll()
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {[80, 50, 200].map((h, i) => (
        <div key={i} style={{ height: h, background: 'rgba(255,255,255,0.04)', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )

  if (error || !client) return (
    <div>
      <Link to="/admin/clients" style={styles.backLink}><ArrowLeft size={14} /> Back to Clients</Link>
      <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '16px', color: '#FCA5A5', fontSize: '13px', marginTop: '12px' }}>
        <AlertCircle size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
        {error || 'Client not found'}
      </div>
    </div>
  )

  const tabSingular = tab.slice(0, -1)
  const addLabel = tabSingular.charAt(0).toUpperCase() + tabSingular.slice(1)
  const counts = { projects: projects.length, milestones: milestones.length, deliverables: deliverables.length, invoices: invoices.length }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      <Link to="/admin/clients" style={styles.backLink}><ArrowLeft size={14} /> Back to Clients</Link>

      {/* Client header */}
      <div style={styles.headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={styles.avatar}>{(client.name || 'C')[0].toUpperCase()}</div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#F1F5F9', margin: 0 }}>{client.name}</h2>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              {client.company && <span>{client.company} &middot; </span>}{client.email}
              {client.phone && <span> &middot; {client.phone}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {tabList.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              ...styles.tabBtn,
              ...(tab === t.key ? { color: '#00D4FF', borderBottom: '2px solid #00D4FF', background: 'rgba(0,212,255,0.06)' } : {}),
            }}
          >
            <t.icon size={14} /> {t.label}
            <span style={styles.tabCount}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* Add button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setModal({ type: tab })} style={styles.addBtn}>
          <Plus size={14} /> Add {addLabel}
        </button>
      </div>

      {/* Tab content */}
      {tab === 'projects' && <DataTable
        items={projects}
        columns={['Title', 'Service', 'Status', 'Progress', 'Due Date', 'Actions']}
        renderRow={(p, i) => (
          <tr key={p.id} style={{ background: i % 2 ? 'rgba(255,255,255,0.012)' : 'transparent' }}>
            <td style={{ ...styles.td, fontWeight: 600, color: '#F1F5F9' }}>{p.title}</td>
            <td style={{ ...styles.td, color: '#64748B' }}>{p.service_type || '--'}</td>
            <td style={styles.td}><StatusBadge status={p.status} /></td>
            <td style={styles.td}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, maxWidth: 80 }}>
                  <div style={{ height: '100%', width: `${p.progress}%`, background: '#00D4FF', borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: '11px', color: '#64748B' }}>{p.progress}%</span>
              </div>
            </td>
            <td style={{ ...styles.td, color: '#64748B', whiteSpace: 'nowrap' }}>{fmtDate(p.due_date)}</td>
            <td style={styles.td}><Actions onEdit={() => setModal({ type: 'projects', data: p })} onDelete={() => handleDelete('projects', p.id)} /></td>
          </tr>
        )}
        emptyIcon={FolderKanban} emptyText="No projects yet."
      />}

      {tab === 'milestones' && <DataTable
        items={milestones}
        columns={['Title', 'Project', 'Status', 'Due Date', 'Order', 'Actions']}
        renderRow={(m, i) => (
          <tr key={m.id} style={{ background: i % 2 ? 'rgba(255,255,255,0.012)' : 'transparent' }}>
            <td style={{ ...styles.td, fontWeight: 600, color: '#F1F5F9' }}>{m.title}</td>
            <td style={{ ...styles.td, color: '#64748B' }}>{m.projects?.title || '--'}</td>
            <td style={styles.td}><StatusBadge status={m.status} /></td>
            <td style={{ ...styles.td, color: '#64748B', whiteSpace: 'nowrap' }}>{fmtDate(m.due_date)}</td>
            <td style={{ ...styles.td, color: '#64748B' }}>{m.display_order}</td>
            <td style={styles.td}><Actions onEdit={() => setModal({ type: 'milestones', data: m })} onDelete={() => handleDelete('milestones', m.id)} /></td>
          </tr>
        )}
        emptyIcon={CheckCircle} emptyText="No milestones yet."
      />}

      {tab === 'deliverables' && <DataTable
        items={deliverables}
        columns={['Title', 'Project', 'Type', 'URL', 'Actions']}
        renderRow={(d, i) => (
          <tr key={d.id} style={{ background: i % 2 ? 'rgba(255,255,255,0.012)' : 'transparent' }}>
            <td style={{ ...styles.td, fontWeight: 600, color: '#F1F5F9' }}>{d.title}</td>
            <td style={{ ...styles.td, color: '#64748B' }}>{d.projects?.title || '--'}</td>
            <td style={{ ...styles.td, color: '#64748B', textTransform: 'capitalize' }}>{d.file_type}</td>
            <td style={styles.td}>
              {d.file_url ? <a href={d.file_url} target="_blank" rel="noopener noreferrer" style={{ color: '#00D4FF', fontSize: '12px' }}>Open</a> : '--'}
            </td>
            <td style={styles.td}><Actions onEdit={() => setModal({ type: 'deliverables', data: d })} onDelete={() => handleDelete('deliverables', d.id)} /></td>
          </tr>
        )}
        emptyIcon={FileText} emptyText="No deliverables yet."
      />}

      {tab === 'invoices' && <DataTable
        items={invoices}
        columns={['Invoice #', 'Project', 'Amount', 'Status', 'Due', 'Paid', 'Actions']}
        renderRow={(inv, i) => (
          <tr key={inv.id} style={{ background: i % 2 ? 'rgba(255,255,255,0.012)' : 'transparent' }}>
            <td style={{ ...styles.td, fontWeight: 600, color: '#F1F5F9' }}>{inv.invoice_number}</td>
            <td style={{ ...styles.td, color: '#64748B' }}>{inv.projects?.title || '--'}</td>
            <td style={{ ...styles.td, fontWeight: 600, color: '#F1F5F9', fontVariantNumeric: 'tabular-nums' }}>${Number(inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td style={styles.td}><StatusBadge status={inv.status} /></td>
            <td style={{ ...styles.td, color: '#64748B', whiteSpace: 'nowrap' }}>{fmtDate(inv.due_date)}</td>
            <td style={{ ...styles.td, color: '#64748B', whiteSpace: 'nowrap' }}>{fmtDate(inv.paid_date)}</td>
            <td style={styles.td}><Actions onEdit={() => setModal({ type: 'invoices', data: inv })} onDelete={() => handleDelete('invoices', inv.id)} /></td>
          </tr>
        )}
        emptyIcon={Receipt} emptyText="No invoices yet."
      />}

      {/* Modals */}
      {modal && modal.type === 'projects' && (
        <FormModal title={modal.data ? 'Edit Project' : 'Add Project'} onClose={() => setModal(null)} onSaved={handleSaved}
          fields={[
            { key: 'title', label: 'Title *', required: true },
            { key: 'description', label: 'Description', type: 'textarea' },
            { key: 'service_type', label: 'Service Type', placeholder: 'e.g. AI Automation, Website Dev' },
            { key: 'status', label: 'Status', type: 'select', options: PROJECT_STATUSES },
            { key: 'progress', label: 'Progress (%)', type: 'number', min: 0, max: 100 },
            { key: 'start_date', label: 'Start Date', type: 'date' },
            { key: 'due_date', label: 'Due Date', type: 'date' },
          ]}
          initial={modal.data || { client_id: clientId, status: 'not_started', progress: 0 }}
          table="projects" extraData={{ client_id: clientId }}
        />
      )}
      {modal && modal.type === 'milestones' && (
        <FormModal title={modal.data ? 'Edit Milestone' : 'Add Milestone'} onClose={() => setModal(null)} onSaved={handleSaved}
          fields={[
            { key: 'project_id', label: 'Project *', type: 'select', options: projects.map(p => ({ value: p.id, label: p.title })), required: true },
            { key: 'title', label: 'Title *', required: true },
            { key: 'description', label: 'Description', type: 'textarea' },
            { key: 'status', label: 'Status', type: 'select', options: MILESTONE_STATUSES },
            { key: 'due_date', label: 'Due Date', type: 'date' },
            { key: 'display_order', label: 'Order', type: 'number' },
          ]}
          initial={modal.data || { status: 'pending', display_order: 0 }}
          table="milestones"
        />
      )}
      {modal && modal.type === 'deliverables' && (
        <FormModal title={modal.data ? 'Edit Deliverable' : 'Add Deliverable'} onClose={() => setModal(null)} onSaved={handleSaved}
          fields={[
            { key: 'project_id', label: 'Project *', type: 'select', options: projects.map(p => ({ value: p.id, label: p.title })), required: true },
            { key: 'title', label: 'Title *', required: true },
            { key: 'description', label: 'Description' },
            { key: 'file_url', label: 'File URL', placeholder: 'https://...' },
            { key: 'file_type', label: 'File Type', type: 'select', options: ['link', 'pdf', 'image', 'video', 'other'] },
          ]}
          initial={modal.data || { file_type: 'link' }}
          table="deliverables"
        />
      )}
      {modal && modal.type === 'invoices' && (
        <FormModal title={modal.data ? 'Edit Invoice' : 'Add Invoice'} onClose={() => setModal(null)} onSaved={handleSaved}
          fields={[
            { key: 'invoice_number', label: 'Invoice # *', required: true, placeholder: 'INV-001' },
            { key: 'project_id', label: 'Project', type: 'select', options: [{ value: '', label: 'None' }, ...projects.map(p => ({ value: p.id, label: p.title }))] },
            { key: 'amount', label: 'Amount *', type: 'number', required: true, placeholder: '0.00' },
            { key: 'description', label: 'Description' },
            { key: 'status', label: 'Status', type: 'select', options: INVOICE_STATUSES },
            { key: 'due_date', label: 'Due Date', type: 'date' },
            { key: 'paid_date', label: 'Paid Date', type: 'date' },
          ]}
          initial={modal.data || { client_id: clientId, status: 'pending' }}
          table="invoices" extraData={{ client_id: clientId }}
        />
      )}
    </div>
  )

  async function handleDelete(table, id) {
    if (!confirm('Are you sure you want to delete this?')) return
    await supabase.from(table).delete().eq('id', id)
    handleSaved()
  }
}

// ─── Shared components ──────────────────────────────────────

function DataTable({ items, columns, renderRow, emptyIcon: Icon, emptyText }) {
  if (items.length === 0) return (
    <div style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '50px', textAlign: 'center' }}>
      <Icon size={28} color="#334155" />
      <p style={{ color: '#475569', fontSize: '13px', margin: '10px 0 0' }}>{emptyText}</p>
    </div>
  )
  return (
    <div style={styles.tableCard}>
      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead><tr>{columns.map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
          <tbody>{items.map(renderRow)}</tbody>
        </table>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const colors = {
    not_started: { c: '#64748B', bg: 'rgba(100,116,139,0.15)' },
    in_progress: { c: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
    review:      { c: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
    completed:   { c: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
    pending:     { c: '#64748B', bg: 'rgba(100,116,139,0.15)' },
    paid:        { c: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
    overdue:     { c: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
  }
  const { c, bg } = colors[status] || colors.pending
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, color: c, background: bg, border: `1px solid ${c}30`, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
      {status?.replace('_', ' ')}
    </span>
  )
}

function Actions({ onEdit, onDelete }) {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      <button onClick={onEdit} style={styles.actionBtn} onMouseEnter={e => { e.currentTarget.style.borderColor = '#00D4FF' }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}>
        <Edit2 size={13} />
      </button>
      <button onClick={onDelete} style={{ ...styles.actionBtn, color: '#EF4444' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#EF4444' }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}>
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function FormModal({ title, onClose, onSaved, fields, initial, table, extraData }) {
  const [form, setForm] = useState({ ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = { ...(extraData || {}) }
    fields.forEach(f => {
      let val = form[f.key]
      if (val === '' || val === undefined) val = null
      if (f.type === 'number' && val !== null) val = Number(val)
      payload[f.key] = val
    })

    try {
      let result
      if (form.id) {
        result = await supabase.from(table).update(payload).eq('id', form.id).select().single()
      } else {
        result = await supabase.from(table).insert(payload).select().single()
      }
      if (result.error) throw result.error
      onSaved()
    } catch (err) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={styles.overlay}>
      <div onClick={e => e.stopPropagation()} style={styles.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '13px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
            {fields.map(f => (
              <div key={f.key}>
                <label style={styles.fieldLabel}>{f.label}</label>
                {f.type === 'textarea' ? (
                  <textarea value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} rows={3} style={{ ...styles.fieldInput, resize: 'vertical' }} />
                ) : f.type === 'select' ? (
                  <select value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} style={{ ...styles.fieldInput, cursor: 'pointer' }}>
                    {Array.isArray(f.options) && typeof f.options[0] === 'object'
                      ? f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                      : f.options.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)
                    }
                  </select>
                ) : (
                  <input type={f.type || 'text'} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} min={f.min} max={f.max} style={styles.fieldInput} />
                )}
              </div>
            ))}
          </div>

          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px', color: '#FCA5A5', fontSize: '12px', marginBottom: '14px' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...styles.saveBtn, opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────

const styles = {
  backLink: { display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B', textDecoration: 'none', fontSize: '13px', width: 'fit-content' },
  headerCard: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '20px' },
  avatar: { width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: '#00D4FF' },
  tabBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '2px solid transparent', color: '#64748B', fontSize: '13px', fontWeight: 500, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer', transition: 'color 0.15s' },
  tabCount: { fontSize: '10px', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 },
  addBtn: { display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: '8px', color: '#020817', fontSize: '12px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  tableCard: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { padding: '12px 18px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#475569', letterSpacing: '0.07em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap', background: 'rgba(255,255,255,0.02)' },
  td: { padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle', color: '#CBD5E1' },
  actionBtn: { background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '5px', cursor: 'pointer', color: '#64748B', transition: 'border-color 0.15s' },
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,8,23,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' },
  modal: { background: '#0F172A', border: '1px solid rgba(0,212,255,0.15)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' },
  fieldLabel: { display: 'block', fontSize: '11px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' },
  fieldInput: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', padding: '10px 14px', color: '#F1F5F9', fontSize: '13px', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' },
  cancelBtn: { padding: '9px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', color: '#94A3B8', fontSize: '13px', fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  saveBtn: { padding: '9px 18px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: '9px', color: '#020817', fontSize: '13px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
}
