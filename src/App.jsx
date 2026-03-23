import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Services from './components/Services'
import Portfolio from './components/Portfolio'
import About from './components/About'
import Contact from './components/Contact'
import Footer from './components/Footer'

/**
 * Haze Tech Solutions — Main App
 * Single-page scrollable site with anchor navigation.
 * All sections are composed here; routing is handled via
 * smooth-scroll anchors (no React Router needed).
 */
export default function App() {
  return (
    <div className="min-h-screen bg-background text-text-main font-body">
      <Navbar />
      <main>
        <Hero />
        <Services />
        <Portfolio />
        <About />
        <Contact />
      </main>
      <Footer />
    </div>
  )
}
