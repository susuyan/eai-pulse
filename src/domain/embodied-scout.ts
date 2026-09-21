export const embodiedScoutKinds = [
  "collection-route",
  "capture-system",
  "production-operations",
  "data-standard",
  "quality-feedback",
  "peer-opportunity",
] as const;

export type EmbodiedScoutKind = (typeof embodiedScoutKinds)[number];

export interface EmbodiedScoutEvent {
  title: string;
  fact_summary: string;
  technical_insight: string;
  industry_insight: string;
  future_outlook: string;
  business_value: string;
  confidence_score: number;
  heat_score: number;
  impact_score: number;
  value_score: number;
}

interface KindCopy {
  title(event: EmbodiedScoutEvent): string;
  hypothesis(event: EmbodiedScoutEvent): string;
  targetAudience: string;
  artifactIdea: string;
  counterSignals: string;
}

const kindCopy: Record<EmbodiedScoutKind, KindCopy> = {
  "collection-route": {
    title: (event) => `验证「${event.title}」的采集路线复现边界`,
    hypothesis: (event) =>
      `路线假设：${event.technical_insight} 只有在目标任务、设备基线和现场约束下可复现，才值得扩大采集投入。`,
    targetAudience: "具身数据负责人、采集运营负责人和机器人研发负责人",
    artifactIdea: "路线对比表、复现记录、单位有效轨迹成本和继续或停止决策",
    counterSignals:
      "若跨设备复现失败、单位有效轨迹成本失控或任务覆盖没有增加，则停止扩站或切换路线。",
  },
  "capture-system": {
    title: (event) => `验证「${event.title}」的采集系统增量价值`,
    hypothesis: (event) =>
      `系统假设：${event.technical_insight} 新模态或新设备只有降低不可恢复误差并改善任务结果，才构成有效增量。`,
    targetAudience: "采集设备负责人、系统集成工程师和质量负责人",
    artifactIdea: "同步与标定报告、掉帧清单、操作负担记录和模态消融结果",
    counterSignals:
      "若新增设备只增加带宽、标定和操作负担，却不改善任务成功率或问题定位效率，则不应扩配。",
  },
  "production-operations": {
    title: (event) => `把「${event.title}」转成可审计的生产运营试验`,
    hypothesis: (event) =>
      `运营假设：${event.industry_insight} 只有产能、返工、停机和版本记录能共同解释交付结果，流程才具备规模化价值。`,
    targetAudience: "数据生产运营负责人、交付经理和采购验收负责人",
    artifactIdea: "站点运营看板、返工原因表、停机记录和交付审计包",
    counterSignals:
      "若过程指标不能预测返工、验收或交付周期，或审计成本高于可避免损失，则降低自动化优先级。",
  },
  "data-standard": {
    title: (event) => `核验「${event.title}」的数据契约与迁移边界`,
    hypothesis: (event) =>
      `标准假设：${event.technical_insight} 格式可读不等于语义兼容，必须同时验证 episode、坐标系、单位和终止原因。`,
    targetAudience: "数据工程负责人、训练平台工程师和交付规范负责人",
    artifactIdea: "字段映射表、契约测试、转换审计报告和回滚样本",
    counterSignals:
      "若转换后无法复算关键指标、动作语义丢失或版本升级不能回滚，则该标准不能进入主交付链路。",
  },
  "quality-feedback": {
    title: (event) => `用「${event.title}」建立质量与训练反馈闭环`,
    hypothesis: (event) =>
      `闭环假设：${event.technical_insight} 训练失败只有能稳定归因到任务、数据或设备，并触发有优先级的返采，才会改善数据资产。`,
    targetAudience: "质检负责人、训练评测工程师和返采运营负责人",
    artifactIdea: "黄金任务集、失败分类表、返采队列和训练增量复盘",
    counterSignals:
      "若失败无法稳定归因、返采后指标没有改善或黄金任务集不能复现，则暂停扩大闭环范围。",
  },
  "peer-opportunity": {
    title: (event) => `核验「${event.title}」对应的同行能力与采购机会`,
    hypothesis: (event) =>
      `同行假设：${event.industry_insight} 公开声明只有转成可复现样例、明确交付物和验收指标，才可用于采购或竞争判断。`,
    targetAudience: "业务负责人、采购负责人、战略负责人和同行研究人员",
    artifactIdea: "能力证据卡、采购问题清单、差距矩阵和失效条件记录",
    counterSignals:
      "若能力仅有发布方叙事、无法导出原始数据或没有独立复现，则保持观察，不进入采购评分。",
  },
};

export function buildEmbodiedScoutCard(event: EmbodiedScoutEvent, kind: EmbodiedScoutKind) {
  const copy = kindCopy[kind];
  return {
    title: copy.title(event),
    observation: `触发事实：${event.fact_summary}`,
    hypothesis: copy.hypothesis(event),
    why_now: `当前观察窗口：${event.future_outlook}`,
    target_audience: copy.targetAudience,
    suggested_action: event.business_value,
    artifact_idea: copy.artifactIdea,
    counter_signals: `失效条件与反向证据：${copy.counterSignals}`,
    horizon: "7-30d",
    confidence_score: Math.min(92, event.confidence_score),
    evidence_score: Math.min(95, Math.round((event.confidence_score + event.impact_score) / 2)),
    novelty_score: Math.min(95, Math.round((event.impact_score + event.value_score) / 2)),
    leverage_score: Math.min(96, event.value_score),
    total_score: Math.min(
      96,
      Math.round(
        event.confidence_score * 0.3 +
          event.impact_score * 0.25 +
          event.value_score * 0.3 +
          event.heat_score * 0.15,
      ),
    ),
  };
}

export function isEmbodiedScoutKind(value: string): value is EmbodiedScoutKind {
  return (embodiedScoutKinds as readonly string[]).includes(value);
}
