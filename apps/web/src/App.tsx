import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { FlowsPage } from './pages/FlowsPage'
import { LibraryPage } from './pages/LibraryPage'
import { PackNewPage } from './pages/PackNewPage'
import { PacksPage } from './pages/PacksPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SkillsPage } from './pages/SkillsPage'
import { TermsPage } from './pages/TermsPage'

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
        <Route path="/packs" element={<PacksPage />} />
        <Route path="/packs/new" element={<PackNewPage />} />
        <Route path="/packs/:id/edit" element={<PackNewPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  )
}
