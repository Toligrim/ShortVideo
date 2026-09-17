#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
POLICY_PATH = ROOT / "tools" / "delegate_policy.json"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731"
DEFAULT_VISION_MODEL = "deepseek/deepseek-v4.1-flash"
DEFAULT_COMPACTOR_MODEL = DEFAULT_MODEL
MAX_API_RETRIES = 3
MAX_AGENT_STEPS = 160

ROLE_PROMPTS = {
    "scriptwriter": ROOT / ".claude" / "agents" / "scriptwriter.md",
    "animation-director": ROOT / ".claude" / "agents" / "animation-director.md",
    "critic": ROOT / ".claude" / "agents" / "critic.md",
}
PRODUCER_SKILL = ROOT / ".claude" / "skills" / "produce" / "SKILL.md"

CONTEXT_BUDGETS = {
    "orchestrator": (32_000, 48_000),
    "scriptwriter": (64_000, 96_000),
    "critic": (64_000, 96_000),
    "animation-director": (96_000, 144_000),
}

COMMON_SYSTEM = """ShortVideo OpenRouter harness protocol.

You are running inside a minimal agent harness. The only model-visible tools are
read_file, write_file, edit_file, grep, glob, bash, web_search and web_fetch.

Tool discipline:
- Prefer read_file/grep/glob to dumping large files through bash.
- bash has no external network and does not contain API keys. Use web_search and
  web_fetch for public research.
- Tool errors are structured JSON. Read error.type/message/hint before retrying;
  never repeat an identical failing call blindly.
- Long files should be searched first and read in ranges. Artifacts on disk are
  the durable state; do not keep rereading large content into conversation.
- Never use git stash, git reset --hard, git clean, mass checkout, kill/pkill,
  sudo, namespace tools or network command-line clients.
- /tmp is private, persistent scratch for this agent session.

Security:
- Do not try to discover or print environment secrets.
- Do not bypass worktree boundaries or sandbox restrictions.
- Do not modify the main repository from a delegate worktree.
- A read-only role must return findings instead of trying to write.

When legacy ShortVideo instructions mention Codex MCP, codex/codex-reply,
Claude subagents or SendMessage, preserve the SEMANTIC workflow but ignore that
old invocation mechanism. Under this runner delegation is internal harness
control-plane logic described in the orchestrator protocol below.
"""

ORCHESTRATOR_SYSTEM = """You are the ShortVideo producer/orchestrator.
Delegate and control the workflow; do not write script or animation content
yourself. The current produce skill follows this protocol and is included below.

OPENROUTER DELEGATION (control plane, not a ninth tool):
When the workflow requires scriptwriter, critic, or animation-director, call the
existing bash tool with exactly one command of this form:

python3 tools/openrouter_harness.py internal-delegate --role ROLE --slug SLUG --task 'TASK'

ROLE must be scriptwriter, critic or animation-director. The harness intercepts
this exact command before the sandbox, creates the existing isolated git
worktree/lease, starts a fresh nested OpenRouter agent using the role markdown,
validates its changed paths, merges through delegate_worktree.py and returns a
structured handoff. Never call Codex MCP for an OpenRouter run and never invent
another delegation mechanism.

If critic returns ПРАВКИ, invoke scriptwriter once more with the same slug and a
task containing the critic's concrete requested fixes. If critic returns БРАК
ТЕМЫ, stop that episode as the produce skill requires.

NETWORKED TTS:
The model-controlled shell has no network. Invoke Gemini TTS as a SEPARATE bash
call exactly in the documented form:
venv/bin/python tools/tts_scenes.py episodes/<slug>.json --out video/public/episodes/<slug>
The harness recognizes only that narrow command and executes the committed TTS
program with a sanitized host environment. Do not combine it with cp/&&; run
the copy as the next normal bash call.

All other production commands (validation, Remotion, overlap/motion checks,
metadata validation/review, git commit) run through normal sandboxed bash.
"""

ROLE_SYSTEM = {
    "scriptwriter": """You are a fresh scriptwriter delegate. Follow the role
prompt below as the source of truth. You may research the public web through
web_search/web_fetch. You work only in your assigned worktree. Do not delegate
other agents.""",
    "critic": """You are a fresh independent SCRIPT critic, before director and
before TTS. Follow the current critic role below. This role is read-only. It
does not visually inspect rendered frames; final visual acceptance is no longer
an LLM critic step. Do not delegate other agents.""",
    "animation-director": """You are a fresh animation-director delegate.
Follow the role prompt below. You may modify your worktree. When the role tells
you to inspect /tmp/forge.png or Preview frames, read_file on the image invokes
the harness vision backend internally. Do not delegate other agents.""",
}


def _strip_front_matter(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---\n", 4)
    if end < 0:
        return text
    return text[end + 5 :].lstrip()


def load_policy() -> dict[str, Any]:
    try:
        data = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise RuntimeError(f"invalid policy {POLICY_PATH}: {exc}") from exc
    if not isinstance(data, dict) or not isinstance(data.get("roles"), dict):
        raise RuntimeError("delegate_policy.json has invalid structure")
    return data


def role_config(role: str, policy: dict[str, Any]) -> dict[str, Any]:
    if role == "orchestrator":
        block = policy.get("openrouter_orchestrator") or {}
        return {
            "model": block.get("model", DEFAULT_MODEL),
            "effort": block.get("effort", "high"),
            "sandbox": block.get("sandbox", "workspace-write"),
            "vision_model": block.get("vision_model", DEFAULT_VISION_MODEL),
        }
    try:
        block = policy["roles"][role]
    except KeyError as exc:
        raise RuntimeError(f"role not allowed: {role}") from exc
    return {
        "model": block.get("openrouter_model", DEFAULT_MODEL),
        "effort": block.get("openrouter_effort", "high"),
        "sandbox": block.get("sandbox", "read-only"),
        "vision_model": block.get("openrouter_vision_model", DEFAULT_VISION_MODEL),
    }


def system_prompt_for(role: str) -> str:
    if role == "orchestrator":
        produce = _strip_front_matter(PRODUCER_SKILL.read_text(encoding="utf-8"))
        return COMMON_SYSTEM + "\n\n" + ORCHESTRATOR_SYSTEM + "\n\nCURRENT PRODUCE SKILL:\n\n" + produce
    prompt_path = ROLE_PROMPTS[role]
    role_text = _strip_front_matter(prompt_path.read_text(encoding="utf-8"))
    return COMMON_SYSTEM + "\n\n" + ROLE_SYSTEM[role] + "\n\nCURRENT ROLE PROMPT:\n\n" + role_text
