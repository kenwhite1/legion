import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initTelegram } from './telegram'
import { initLang } from './i18n'
import './theme.css'

initLang()
initTelegram()
createRoot(document.getElementById('root')!).render(<App />)
