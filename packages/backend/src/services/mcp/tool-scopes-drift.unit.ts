import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const TOOLS_DIR = path.join(__dirname, 'tools');

const READ_TOOL_NAME = /^(get|list|search|preview)_/;
// Candidate lookup reads transactions without linking them or changing the subscription.
const READ_ONLY_TOOLS = ['suggest_subscription_matches'];

// Tools that permanently delete a record without `delete_` in their name. Kept by
// hand: a new destructive tool named otherwise is only checked once it is listed here.
const DESTRUCTIVE_TOOLS = ['merge_payees'];

function readToolSources(): Array<{ name: string; content: string }> {
  const tools: Array<{ name: string; content: string }> = [];
  for (const entry of fs.readdirSync(TOOLS_DIR)) {
    if (!entry.endsWith('.ts') || entry.includes('.unit.') || entry.includes('.e2e.')) continue;

    const content = fs.readFileSync(path.join(TOOLS_DIR, entry), 'utf-8');
    if (!content.includes('server.registerTool(')) continue;

    const registrations = [...content.matchAll(/server\.registerTool\(\s*['"]([^'"]+)['"]/g)];
    if (registrations.length === 0) throw new Error(`Could not read the tool name registered in ${entry}`);
    for (const [index, registration] of registrations.entries()) {
      tools.push({
        name: registration[1]!,
        content: content.slice(registration.index, registrations[index + 1]?.index),
      });
    }
  }
  return tools;
}

describe('MCP tool scopes', () => {
  it('every tool that is not a read tool checks a scope', () => {
    const unchecked = readToolSources()
      .filter(
        (t) =>
          !READ_TOOL_NAME.test(t.name) &&
          !READ_ONLY_TOOLS.includes(t.name) &&
          !/(?:requireScope|assertMcpMutationAllowed)\(/.test(t.content),
      )
      .map((t) => t.name);

    expect(unchecked).toEqual([]);
  });

  it('every tool that permanently deletes a record requires finance:delete', () => {
    const tools = readToolSources();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(DESTRUCTIVE_TOOLS));

    const wrongScope = tools
      .filter((t) => t.name.startsWith('delete_') || DESTRUCTIVE_TOOLS.includes(t.name))
      .filter(
        (t) =>
          !/(?:requireScope|assertMcpMutationAllowed)\(\s*\{[^}]*scope:\s*'finance:delete'/.test(t.content) ||
          t.content.includes("scope: 'finance:write'"),
      )
      .map((t) => t.name);

    expect(wrongScope).toEqual([]);
  });

  it('every goal write tool requires the goals feature', () => {
    const goalWrites = readToolSources().filter((t) => /_goals?$/.test(t.name) && !READ_TOOL_NAME.test(t.name));
    expect(goalWrites.map((t) => t.name)).toEqual(
      expect.arrayContaining(['create_goal', 'update_goal', 'delete_goal']),
    );

    const ungated = goalWrites
      .filter((t) => !t.content.includes('requireFeature({ userId, feature: FEATURES.goals })'))
      .map((t) => t.name);

    expect(ungated).toEqual([]);
  });
});
