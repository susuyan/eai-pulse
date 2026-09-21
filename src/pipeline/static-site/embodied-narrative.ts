import { EmbodiedPipelineStageSchema, EventDataProfileSchema } from "../../domain/embodied-data.js";
import {
  type EmbodiedTrend,
  EmbodiedTrendSchema,
  type EvolutionPhase,
  EvolutionPhaseSchema,
} from "../../domain/embodied-narrative.js";
import type {
  PublicEmbodiedEvent,
  PublicEmbodiedNarrative,
  PublicEventRelation,
  PublicEvolutionPhase,
} from "./dto.js";

const shanghaiCalendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function eventDate(event: PublicEmbodiedEvent): string {
  const timestamp = Date.parse(event.happenedAt);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid event timestamp for embodied-data event: ${event.slug}`);
  }
  const parts = shanghaiCalendar.formatToParts(timestamp);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function assertUniqueSlugs(records: readonly { slug: string }[], kind: string): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.slug)) throw new Error(`duplicate ${kind} slug: ${record.slug}`);
    seen.add(record.slug);
  }
}

function assertDisjoint(main: readonly string[], counter: readonly string[], slug: string): void {
  if (counter.some((eventSlug) => main.includes(eventSlug))) {
    throw new Error(`Main and counter Event sets must be disjoint: ${slug}`);
  }
}

export function buildPublicEmbodiedNarrative(
  events: readonly PublicEmbodiedEvent[],
  phases: readonly EvolutionPhase[],
  trends: readonly EmbodiedTrend[],
): PublicEmbodiedNarrative {
  const parsedPhases = phases
    .map((phase) => EvolutionPhaseSchema.parse(phase))
    .sort((left, right) => left.start.localeCompare(right.start));
  const parsedTrends = trends.map((trend) => EmbodiedTrendSchema.parse(trend));
  assertUniqueSlugs(parsedPhases, "phase");
  assertUniqueSlugs(parsedTrends, "trend");
  for (const [index, phase] of parsedPhases.entries()) {
    if (phase.start > phase.end) throw new Error(`reversed phase range: ${phase.slug}`);
    const previous = parsedPhases[index - 1];
    if (!previous) continue;
    if (phase.start <= previous.end) throw new Error(`phase overlap: ${phase.slug}`);
    const nextDay = new Date(`${previous.end}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    if (phase.start !== nextDay.toISOString().slice(0, 10)) {
      throw new Error(`internal phase gap: ${phase.slug}`);
    }
  }
  if (parsedPhases[0]?.start !== "2022-01-31" || parsedPhases.at(-1)?.end !== "2026-09-20") {
    throw new Error("Phase outer range must be 2022-01-31 through 2026-09-20");
  }

  assertUniqueSlugs(events, "event");
  const eventBySlug = new Map(events.map((event) => [event.slug, event]));
  const resolve = (slug: string, role: string, phase?: EvolutionPhase): PublicEventRelation => {
    const event = eventBySlug.get(slug);
    if (!event) throw new Error(`Unknown event in published embodied-data map: ${slug}`);
    if (
      !event.publishedAt ||
      !Number.isFinite(Date.parse(event.publishedAt)) ||
      !EventDataProfileSchema.safeParse(event.dataProfile).success
    ) {
      throw new Error(`Expected a published embodied-data event: ${slug}`);
    }
    const date = eventDate(event);
    if (phase && (date < phase.start || date > phase.end)) {
      throw new Error(`Event outside phase range: ${slug} in ${phase.slug}`);
    }
    return { slug: event.slug, title: event.title, role };
  };

  return {
    phases: parsedPhases.map((phase): PublicEvolutionPhase => {
      assertDisjoint(phase.eventSlugs, phase.counterEventSlugs, phase.slug);
      const mainEvents = phase.eventSlugs.map((slug) =>
        resolve(slug, "supporting-evidence", phase),
      );
      const stageImpacts = Object.fromEntries(
        EmbodiedPipelineStageSchema.options.map((stage) => {
          const impact = phase.stageImpacts[stage];
          const stageEvents = impact.eventSlugs.map((slug) => {
            const relation = resolve(slug, "supporting-evidence", phase);
            if (!phase.eventSlugs.includes(slug)) {
              throw new Error(
                `Stage event must belong to phase main events: ${slug} in ${phase.slug}`,
              );
            }
            return relation;
          });
          return [
            stage,
            { summary: impact.summary, events: stageEvents, evidenceState: impact.evidenceState },
          ];
        }),
      ) as PublicEvolutionPhase["stageImpacts"];
      return {
        slug: phase.slug,
        start: phase.start,
        end: phase.end,
        title: phase.title,
        thesis: phase.thesis,
        turningPoint: phase.turningPoint,
        events: mainEvents,
        stageImpacts,
        counterEvents: phase.counterEventSlugs.map((slug) => resolve(slug, "counter-evidence")),
        nextSignals: phase.nextSignals,
      };
    }),
    trends: parsedTrends.map((trend) => {
      assertDisjoint(trend.eventSlugs, trend.counterEventSlugs, trend.slug);
      return {
        slug: trend.slug,
        title: trend.title,
        thesis: trend.thesis,
        whyNow: trend.whyNow,
        pipelineStages: trend.pipelineStages,
        events: trend.eventSlugs.map((slug) => resolve(slug, "supporting-evidence")),
        counterEvents: trend.counterEventSlugs.map((slug) => resolve(slug, "counter-evidence")),
        nextWatch: trend.nextWatch,
      };
    }),
  };
}
