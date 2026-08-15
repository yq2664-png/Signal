export function hasConcreteArtifact(title: string, body = ""): boolean {
  const text = `${title}\n${body}`;
  return (
    /\b(repro|steps to reproduce|traceback|stack trace|expected behavior|actual behavior)\b/i.test(
      text
    ) ||
    /```/.test(text) ||
    /\b(mcp\.json|claude\.md|agents\.md|\.cursor\/mcp|stdio|function_call|calltoolresult|streamable http|session_id)\b/i.test(
      text
    ) ||
    /\b(fails? to start|silently dropped|retry budget|unknown mcp tool|tool output.{0,24}truncat)\b/i.test(
      text
    )
  );
}

export function hasProductImplication(title: string, body = "", topic?: string): boolean {
  const text = `${title}\n${body}`;
  if (
    topic === "install-platform" &&
    !/\b(mcp|tool|session|agent|sandbox)\b/i.test(text)
  ) {
    return false;
  }
  if (
    /\b(typo|export `?\w+`? string literal|update to typescript)\b/i.test(title)
  ) {
    return false;
  }
  if (
    topic &&
    [
      "mcp-runtime",
      "reliability-transport",
      "tool-calling",
      "session-failure",
      "memory-context",
      "auth-security",
      "workflow-skills",
    ].includes(topic)
  ) {
    return true;
  }
  return /\b(mcp|tool call(?:ing)?|session|memory|sandbox|agent|workflow|approval|stdio|production)\b/i.test(
    text
  );
}
