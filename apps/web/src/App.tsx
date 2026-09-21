import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { FlowsPage } from './pages/FlowsPage'
import { LibraryPage } from './pages/LibraryPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { SkillsPage } from './pages/SkillsPage'
import { TermsPage } from './pages/TermsPage'
import { zh } from './i18n/zh'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/flows" element={<FlowsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/packs" element={<PlaceholderPage title={zh.nav.packs} task="T6" />} />
        <Route path="/settings" element={<PlaceholderPage title={zh.nav.settings} task="T8" />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  )
}
