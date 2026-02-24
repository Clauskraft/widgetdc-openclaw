/**
 * Consulting Workflow Skill — McKinsey/BCG process patterns for OpenClaw
 *
 * Based on Process Specialist Archive and WidgeTDC knowledge packs.
 * Guides agents through: Discovery → Synthesis → Delivery → Governance
 */

export interface Phase {
  id: string;
  name: string;
  steps: string[];
  tools: string[];
}

export const CONSULTING_PHASES: Phase[] = [
  {
    id: 'discovery',
    name: 'Discovery & Diagnosis',
    steps: [
      'Client problem intake',
      'Intelligence harvesting (graph + RAG)',
      'MECE issue tree generation',
      'Gap analysis & benchmarking',
      'Client archetype assessment',
    ],
    tools: ['kg_rag.query', 'graph.read_cypher', 'consulting.pattern.search', 'consulting.insight'],
  },
  {
    id: 'synthesis',
    name: 'Strategy Synthesis',
    steps: [
      'Framework application (McKinsey SRC, Porter)',
      'Sensitivity & risk analysis',
      'Strategic options mapping',
    ],
    tools: ['consulting.decision', 'consulting.pattern.search', 'context_folding.fold'],
  },
  {
    id: 'delivery',
    name: 'Production & Delivery',
    steps: [
      'High-fidelity asset creation',
      '1-Click deliverables (PPTX/SVG)',
    ],
    tools: ['docgen.powerpoint', 'docgen.word', 'docgen.diagram'],
  },
  {
    id: 'governance',
    name: 'Governance & Memory',
    steps: [
      'Decision logs & autopsies',
      'Pattern card capture',
      'Memory store for next session',
    ],
    tools: ['consulting.agent.memory.store', 'graph.write_cypher', 'notes.create'],
  },
];

export function getPhase(phaseId: string): Phase | undefined {
  return CONSULTING_PHASES.find((p) => p.id === phaseId);
}

export function getNextStep(phaseId: string, currentStepIndex: number): string | null {
  const phase = getPhase(phaseId);
  if (!phase || currentStepIndex >= phase.steps.length - 1) return null;
  return phase.steps[currentStepIndex + 1];
}

/**
 * Return workflow guidance for a consulting task.
 */
export async function consultingWorkflow(
  task: string,
  phaseHint?: string
): Promise<{ phase: Phase; suggestedTools: string[]; nextSteps: string[] }> {
  const phase = phaseHint ? getPhase(phaseHint) : CONSULTING_PHASES[0];
  const p = phase || CONSULTING_PHASES[0];
  return {
    phase: p,
    suggestedTools: p.tools,
    nextSteps: p.steps.slice(0, 3),
  };
}
