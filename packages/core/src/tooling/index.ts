/**
 * @openvibe/core/tooling —— 仓库工具面（v0.2.3 批次 C CS1）。
 *
 * 这里装载的模块**只被 scripts/ 与 tests/ 消费**（采集、规格解析、静态守卫），
 * 与产品运行时（apps/server 的路由、CLI 命令）零耦合，却曾从主出口
 * `@openvibe/core` re-export——「core 是纯领域包」的口径被稀释（PRD-v0.2.3 E5）。
 * 现口径：**产品主出口不含本面**；工具脚本一律 `import … from '@openvibe/core/tooling'`。
 * 模块物理位置暂留 `src/db/`（其内部相对导入与 co-located 测试不受影响），物理归位随后。
 */

// P1.10 · DL-03 停更源标记 —— **采集脚本也用它**（scripts/ 走 @openvibe/core/tooling 导入）
// ⇒ 新鲜度标记的**算法只有一处**，采集脚本与守卫不会各算各的。
export {
  computeFreshness,
  yearsText,
  parseSpecStaleSources,
  readSpecStaleSources,
  specSourceNameToKey,
  validateFreshness,
  scanSourceFreshness,
  STALE_SOURCE_KEYS,
  type SourceFreshness,
  type FreshnessRule,
  type FreshnessViolation,
} from './m9-source-freshness'
// P1b · spec §1.6.1 口径读取器 —— **提取脚本与单测共用同一份解析**
// ⇒ 文档与实跑的对照不会「两边错得一模一样」（那会让对账闸变成同义反复）。
export {
  parseSpecResourceCounts,
  specSection161,
  type SpecResourceCounts,
  type SpecCategoryCount,
} from './m9-p1b-spec'
// P1b · 必要性矩阵（DL-48）—— **提取脚本与单测共用同一份解析**
export {
  parseNecRule,
  parseSpecDistribution,
  parseSpecNecDistribution,
  necessaryFor,
  computeDistribution,
  verifyNecessity,
  LANG_PROFILES,
  RESOURCE_TIERS,
  MAIN_RESOURCE_TIERS,
  TIER_LEGEND,
  NECESSITY_LABEL,
  type LangProfile,
  type ResourceTier,
  type MainResourceTier,
  type Necessity,
  type NecRule,
  type NecDistribution,
  type SpecNec,
  type NecRuleViolation,
} from './m9-p1b-necessity'
// P1d · 「测试写死日期 × 生产相对窗口」静态守卫 —— m9:collect 的守卫半边
export {
  findHardCodedDateUses,
  findRelativeWindowUses,
  findTimeDriftRisks,
  splitTestBlocks,
  type HardCodedDateUse,
  type RelativeWindowUse,
  type SourceFile,
  type TestBlock,
  type TimeDriftRisk,
} from './m9-time-window-guard'
export {
  parseSpecPhaseRows,
  parseSpecVibeStatic,
  tallyOutcomePrefixes,
  checkNoMappingStatements,
  specSection3171,
  type SpecPhaseRow,
  type SpecVibeStatic,
  type OutcomePrefixTally,
  type NoMappingCheck,
} from './m9-p1d-spec'
