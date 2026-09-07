import { motion } from 'framer-motion'
import { Zap, Heart, Target } from 'lucide-react'
import { useI18n } from '../i18n'

// Icons/accents only; titles and descriptions come from the locale dictionary.
const VALUE_CARDS = [
  { icon: Heart,  key: 'boutique', accent: '#00CFFF' },
  { icon: Zap,    key: 'aiFirst',  accent: '#FF6B00' },
  { icon: Target, key: 'results',  accent: '#00CFFF' },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
}

export default function About() {
  const { t } = useI18n()

  return (
    <section
      id="about"
      className="relative py-28 px-6 overflow-hidden"
      style={{ background: '#040D1A' }}
      aria-label={t('about.sectionAria')}
    >
      {/* Orbs */}
      <div
        className="orb orb-violet"
        style={{ width: 450, height: 450, top: '-5%', left: '-5%', opacity: 0.6 }}
        aria-hidden="true"
      />
      <div
        className="orb orb-cyan"
        style={{ width: 350, height: 350, bottom: '0%', right: '-5%', opacity: 0.5 }}
        aria-hidden="true"
      />

      <div className="max-w-6xl mx-auto">
        {/* Two-column layout: story + founder */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-24">
          {/* Story */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <span className="section-label">{t('about.label')}</span>
            <h2
              className="font-display font-black mt-4 mb-6 text-text-main"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', lineHeight: 1.15 }}
            >
              {t('about.title1')}{' '}
              <span className="gradient-text">{t('about.title2')}</span>
            </h2>
            <div className="space-y-4 text-muted text-base leading-relaxed">
              <p>{t('about.p1')}</p>
              <p>{t('about.p2')}</p>
              <p>{t('about.p3')}</p>
            </div>
          </motion.div>

          {/* Founder card */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="flex justify-center lg:justify-end"
          >
            <div
              className="glass-card p-8 max-w-xs w-full text-center"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              {/* Avatar */}
              <div className="flex justify-center mb-5">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="relative w-24 h-24 rounded-full flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(0,207,255,0.2), rgba(255,107,0,0.2))',
                    border: '2px solid rgba(0,207,255,0.3)',
                    boxShadow: '0 0 24px rgba(0,207,255,0.2)',
                  }}
                >
                  <span
                    className="font-display font-black text-3xl gradient-text"
                    aria-label="Josiah's avatar"
                  >
                    J
                  </span>
                  {/* Online indicator */}
                  <span
                    className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-background"
                    style={{ background: '#22c55e' }}
                    aria-label="Available"
                  />
                </motion.div>
              </div>

              <h3 className="font-display font-bold text-text-main text-lg mb-1">
                Josiah
              </h3>
              <p className="text-primary text-sm font-medium mb-1">
                {t('about.founderRole')}
              </p>
              <p className="text-muted text-xs mb-6 leading-relaxed">
                {t('about.founderBio')}
              </p>

              {/* Divider */}
              <div
                className="h-px w-full mb-5"
                style={{ background: 'linear-gradient(to right, transparent, rgba(0,207,255,0.2), transparent)' }}
              />

              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { val: '50+', lbl: t('about.statClients') },
                  { val: '3yrs', lbl: t('about.statExperience') },
                  { val: '98%', lbl: t('about.statSatisfaction') },
                ].map((s) => (
                  <div key={s.val}>
                    <div className="font-display font-bold text-primary text-base">{s.val}</div>
                    <div className="text-muted text-xs">{s.lbl}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Values */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          <motion.div variants={itemVariants} className="text-center mb-12">
            <h2
              className="font-display font-black text-text-main"
              style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)' }}
            >
              {t('about.valuesTitle1')}{' '}
              <span className="gradient-text">{t('about.valuesTitle2')}</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {VALUE_CARDS.map((val) => {
              const Icon = val.icon
              return (
                <motion.div
                  key={val.key}
                  variants={itemVariants}
                  whileHover={{
                    y: -6,
                    borderColor: `${val.accent}44`,
                    boxShadow: `0 16px 40px rgba(0,0,0,0.3), 0 0 20px ${val.accent}18`,
                  }}
                  className="glass-card p-7"
                  style={{ transition: 'all 0.3s ease' }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                    style={{
                      background: `${val.accent}15`,
                      border: `1px solid ${val.accent}30`,
                    }}
                  >
                    <Icon size={20} style={{ color: val.accent }} aria-hidden="true" />
                  </div>
                  <h3 className="font-display font-bold text-text-main text-base mb-3">
                    {t(`about.values.${val.key}.title`)}
                  </h3>
                  <p className="text-muted text-sm leading-relaxed">
                    {t(`about.values.${val.key}.description`)}
                  </p>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
