// packages/adapters —— 平台契约层（design §8 v1.3：六专用 adapter + registry + 兼容矩阵）。
// adapter 只回答「主规则文件写到哪、套什么壳」；TERMS/CHECKLIST/SKILLS/manifest 由 composer 生成。
// R2：本包只依赖 @openvibe/shared，且不得被 packages/core import（编排在 apps/server）。
export * from './claude-code'
export * from './codebuddy'
export * from './compat'
export * from './cursor'
export * from './generic-agents'
export * from './minicode'
export * from './registry'
export * from './trae'
