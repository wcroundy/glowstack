// MCP inference policy, reviewed against OpenAI model/usage docs 2026-09-24.
// Keep prompts independent of routing. API mode retains its saved provider/models.
export const AI_TASK_MODELS = Object.freeze({
  chat: Object.freeze({ label: 'General chat', kind: 'chat', model: 'gpt-6-luna', effort: 'low' }),
  recommendations: Object.freeze({ label: 'Content recommendations', kind: 'chat', model: 'gpt-6-sol', effort: 'medium' }),
  auto_tag: Object.freeze({ label: 'Image and video auto-tagging', kind: 'vision', model: 'gpt-6-luna', effort: 'medium' }),
  video_scenes: Object.freeze({ label: 'Video scene analysis', kind: 'vision', model: 'gpt-6-sol', effort: 'medium' }),
});

export function taskModel(payload) {
  const task = payload.task ?? (payload.kind === 'chat' ? 'chat' : payload.kind === 'vision' ? 'auto_tag' : null);
  const policy = Object.hasOwn(AI_TASK_MODELS, task) ? AI_TASK_MODELS[task] : null;
  if (!policy || policy.kind !== payload.kind) throw new Error('Unknown or incompatible Glowstack AI task.');
  return { task, ...policy };
}

export function validateTaskModel(policy, catalog) {
  const model = catalog.find(m => m.model === policy.model);
  if (!model || (policy.kind === 'vision' && !model.inputModalities?.includes('image')) || !model.supportedReasoningEfforts?.some(e => e.reasoningEffort === policy.effort)) {
    throw new Error(`Glowstack requires ${policy.model} (${policy.effort}) for ${policy.label}. It is unavailable or incompatible with this Codex account. No model substitution was made.`);
  }
}
