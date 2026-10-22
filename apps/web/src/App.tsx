import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'

/**
 * 路由级分包（T8f）：九个页面各自成一个 chunk，`import()` 的边界就是下载的边界。
 * 编辑器的 CodeMirror、预览的 react-markdown、拖拽的 @dnd-kit 都只在自己那页被用到，
 * 没有这一层它们全都会挤进首屏那一个文件里。
 * 命名导出需过一层 `{ default }` 适配——`lazy` 只认默认导出。
 */
const GrowthPage = lazy(() =>
  import('./pages/GrowthPage').then((m) => ({ default: m.GrowthPage })),
)
const WorkbenchPage = lazy(() =>
  import('./pages/WorkbenchPage').then((m) => ({ default: m.WorkbenchPage })),
)
const LibraryPage = lazy(() =>
  import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })),
)
const TermsPage = lazy(() => import('./pages/TermsPage').then((m) => ({ default: m.TermsPage })))
// M9「开发能力」页（§3.5 · dev-plan §6.9 P3）
const DevAbilityPage = lazy(() =>
  import('./pages/DevAbilityPage').then((m) => ({ default: m.DevAbilityPage })),
)
// M9「学习资源」页（owner 2026-10-22 裁定：独立资源页 ＋ 支持筛选 · §3.20）
const ResourcePage = lazy(() =>
  import('./pages/ResourcePage').then((m) => ({ default: m.ResourcePage })),
)
const PlaybooksPage = lazy(() =>
  import('./pages/PlaybooksPage').then((m) => ({ default: m.PlaybooksPage })),
)
const SkillsPage = lazy(() => import('./pages/SkillsPage').then((m) => ({ default: m.SkillsPage })))
const FlowsPage = lazy(() => import('./pages/FlowsPage').then((m) => ({ default: m.FlowsPage })))
const ProjectsPage = lazy(() =>
  import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
)
const ProjectDetailPage = lazy(() =>
  import('./pages/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })),
)
const PacksPage = lazy(() => import('./pages/PacksPage').then((m) => ({ default: m.PacksPage })))
const PackNewPage = lazy(() =>
  import('./pages/PackNewPage').then((m) => ({ default: m.PackNewPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<WorkbenchPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/dev" element={<DevAbilityPage />} />
        <Route path="/resources" element={<ResourcePage />} />
        <Route path="/playbooks" element={<PlaybooksPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/flows" element={<FlowsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/packs" element={<PacksPage />} />
        <Route path="/packs/new" element={<PackNewPage />} />
        <Route path="/packs/:id/edit" element={<PackNewPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/growth" element={<GrowthPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
