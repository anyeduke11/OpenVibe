import { z } from 'zod'
import { FLOW_KINDS } from '../constants'

export const StageSchema = z.object({
  name: z.string().min(1),
  checklist: z
    .array(z.object({ id: z.string().min(1), text: z.string().min(1) }))
    .default([]),
  artifacts: z.array(z.string()).default([]),
  /** 问答段的提示词模板（DEV-0074，可选 additive）：含 {{变量}} 时该阶段可问答生成正文；
   *  空/缺省=传统检查清单阶段。问答运行时同名变量跨阶段继承（上下文传递）。
   *  optional 而非 default——存量测试夹具（Stage 字面量）零改动即可通过 */
  prompt: z.string().optional(),
})
export type Stage = z.infer<typeof StageSchema>

export const FlowTemplateCreateInput = z.object({
  name: z.string().min(1),
  kind: z.enum(FLOW_KINDS),
  stages: z.array(StageSchema).min(1),
})
export type FlowTemplateCreateInput = z.infer<typeof FlowTemplateCreateInput>

/** 模板编辑入参（内置模板由仓储层挡下 403，此处不做分支判断） */
export const FlowTemplateUpdateInput = z.object({
  name: z.string().min(1).optional(),
  stages: z.array(StageSchema).min(1).optional(),
})
export type FlowTemplateUpdateInput = z.infer<typeof FlowTemplateUpdateInput>

export const FlowTemplateOut = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(FLOW_KINDS),
  stages: z.array(StageSchema),
  builtin: z.boolean(),
  seedHash: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type FlowTemplateOut = z.infer<typeof FlowTemplateOut>
