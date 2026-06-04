import { useSearchParams } from 'react-router-dom'
import { LayoutDashboard, Bot, Mail, HelpCircle } from 'lucide-react'
import ConversationsDashboard from './ConversationsDashboard'
import AdminChatbot from './AdminChatbot'
import EmailAutoResponder from './EmailAutoResponder'
import FaqManager from './FaqManager'

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'web', label: 'Web Chat', icon: Bot },
  { key: 'email', label: 'Email Chat', icon: Mail },
  { key: 'faqs', label: 'FAQs', icon: HelpCircle },
]

export default function Conversations() {
  const [params, setParams] = useSearchParams()
  const active = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'dashboard'
  const setTab = (key) => setParams(key === 'dashboard' ? {} : { tab: key }, { replace: true })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div>
        <h2 style={styles.pageTitle}>Conversations</h2>
        <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>Web chat and email — analytics, the chatbot, and the email agent in one place</p>
      </div>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {TABS.map((t) => {
          const on = active === t.key
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ ...styles.tab, ...(on ? styles.tabActive : {}) }}>
              <Icon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      <div>
        {active === 'dashboard' && <ConversationsDashboard />}
        {active === 'web' && <AdminChatbot />}
        {active === 'email' && <EmailAutoResponder />}
        {active === 'faqs' && (
          <div>
            <h3 style={styles.faqTitle}>FAQs</h3>
            <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px' }}>One shared knowledge base. Both the Web Chat bot and the Email agent answer from these.</p>
            <FaqManager />
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  pageTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 },
  tabBar: { display: 'flex', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 0 },
  tab: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: '#64748B', fontSize: 13, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer', marginBottom: -1 },
  tabActive: { color: '#00D4FF', borderBottom: '2px solid #00D4FF' },
  faqTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 4px' },
}
