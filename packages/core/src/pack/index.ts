// packages/core/src/pack —— 标准包生成器（design §7 契约的**唯一**实现，Web/CLI 共用）。
// 全部纯函数：不读库、不落盘、不 import adapters（adapter 能力由调用方注入，见 composer）。
export { composePack, SKILLS_MD_DIVIDER, SKILLS_MD_HEADER } from './composer'
export type { AdapterBundle, ComposeDeps, RenderedPack } from './composer'
export { resolvePack, type PackDefinition, type ResolveDeps } from './resolve'
export { fileSha256, fingerprintOf } from './fingerprint'
export { validatePackFiles } from './validate'
export {
  buildBundle,
  bundleFileName,
  bundleJson,
  directoryFileName,
  directoryFiles,
} from './bundle'
export { estimateBundle, estimateTokens, SIZE_WARN_THRESHOLD, type TokenEstimate } from './size'
