import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { LibraryPage } from './pages/LibraryPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { zh } from './i18n/zh'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/terms" element={<PlaceholderPage title={zh.nav.terms} task="T4" />} />
        <Route path="/skills" element={<PlaceholderPage title={zh.nav.skills} task="T5" />} />
        <Route path="/flows" element={<PlaceholderPage title={zh.nav.flows} task="T5" />} />
        <Route path="/projects" element={<PlaceholderPage title={zh.nav.projects} task="T5" />} />
        <Route path="/packs" element={<PlaceholderPage title={zh.nav.packs} task="T6" />} />
        <Route path="/settings" element={<PlaceholderPage title={zh.nav.settings} task="T8" />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  )
}
