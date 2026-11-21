import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'

/**
 * 路由级分包（T8f）：每个页面各自成一个 chunk，`import()` 的边界就是下载的边界。
 * 编辑器的 CodeMirror、预览的 react-markdown、拖拽的 @dnd-kit 都只在自己那页被用到，
 * 没有这一层它们全都会挤进首屏那一个文件里。
 * 命名导出需过一层 `{ default }` 适配——`lazy` 只认默认导出。
 *
 * 路由表按**成长阶段**组织（原型 `灵典-全功能Demo-成长视角-20261107.html` 的 NAV）：
 * 飞轮全景 → 跟随·F0 → 实践·F1 → 作者·F2 → 定标·F3 → 系统。
 * （2026-11-21 随成长视角路由重组收口入库。）
 */
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })))
const GuidePage = lazy(() => import('./pages/GuidePage').then((m) => ({ default: m.GuidePage })))
const LibraryPage = lazy(() =>
  import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })),
)
const TermsPage = lazy(() => import('./pages/TermsPage').then((m) => ({ default: m.TermsPage })))
const SkillsPage = lazy(() => import('./pages/SkillsPage').then((m) => ({ default: m.SkillsPage })))
const PlaybooksPage = lazy(() =>
  import('./pages/PlaybooksPage').then((m) => ({ default: m.PlaybooksPage })),
)
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
// M9「学习与开发」：原型 learn 视图 —— 开发能力（站位图/对照/源码解读）+ 学习资源
const LearnPage = lazy(() => import('./pages/LearnPage').then((m) => ({ default: m.LearnPage })))
const AgentPage = lazy(() => import('./pages/AgentPage').then((m) => ({ default: m.AgentPage })))
// 定标·F3：注入与漂移 / 加载协议（设计稿）/ 团队协作（设计稿）/ 成长与统计
const InjectPage = lazy(() => import('./pages/InjectPage').then((m) => ({ default: m.InjectPage })))
const LoadingPage = lazy(() =>
  import('./pages/LoadingPage').then((m) => ({ default: m.LoadingPage })),
)
const TeamPage = lazy(() => import('./pages/TeamPage').then((m) => ({ default: m.TeamPage })))
const GrowthPage = lazy(() => import('./pages/GrowthPage').then((m) => ({ default: m.GrowthPage })))
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/playbooks" element={<PlaybooksPage />} />
        <Route path="/flows" element={<FlowsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/packs" element={<PacksPage />} />
        <Route path="/packs/new" element={<PackNewPage />} />
        <Route path="/packs/:id/edit" element={<PackNewPage />} />
        <Route path="/learn" element={<LearnPage />} />
        <Route path="/agent" element={<AgentPage />} />
        <Route path="/inject" element={<InjectPage />} />
        <Route path="/loading" element={<LoadingPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/growth" element={<GrowthPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* 旧入口收敛到「学习与开发」：/dev 与 /resources 曾是两个独立页，
            原型 learn 视图把两者并成一页两签 ⇒ 旧链接跳转，不留死路。 */}
        <Route path="/dev" element={<Navigate to="/learn" replace />} />
        <Route path="/resources" element={<Navigate to="/learn" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
