#!/usr/bin/env python3
"""Рассказ о прогоне: связная хронология вместо сырых логов.

Оператор воспринимает происходящее рассказом, а не JSONL. Поэтому у каждого
прогона должен быть человеко-читаемый пересказ: как стартовал оркестратор,
кого и зачем он делегировал, что каждый делегат делал, где ошибся, чем всё
кончилось — в прозе, в том же духе, что
corrections/git-reset-clean-incident/INCIDENT-NARRATIVE.md, но собираемый
автоматически по каждому прогону, а не вручную после катастрофы.

Смысл именно в повседневности. Рассказ нужен не как форензика после аварии, а
как основной инструмент наблюдения: прочитав десяток рассказов о нормальных
прогонах, можно увидеть, какие возможности агенты реально применяют во вред, и
подрезать ТОЧЕЧНО эти — вместо того чтобы заранее умозрительно запрещать всё,
что кажется опасным, и лишать агентов возможности импровизировать. Обоснование
подхода — docs/agent-safety-architecture.md, раздел «Наблюдать, а не запрещать».

Два слоя, сознательно разделённые:

  1. ДЕТЕРМИНИРОВАННЫЙ (эта программа, без LLM) — собирает хронологию из
     runs/<run_id>/events.jsonl, runs/<run_id>/agents/*/actions.jsonl и
     manifest.json. Ничего не выдумывает: каждая фраза выводится из записи в
     журнале. Работает всегда, в том числе когда прогон убит, сеть лежит и
     никакой модели под рукой нет — то есть ровно в тех условиях, когда
     рассказ нужнее всего.
  2. ЛИТЕРАТУРНЫЙ (флаг --brief) — печатает готовый бриф для LLM, которая
     перескажет хронологию живой прозой. Модель получает только факты из слоя
     1 и прямой запрет что-либо добавлять от себя.

Почему CLI, а не скилл. Скилл `.claude/skills/story/` — это тонкая обёртка
поверх этой программы (см. архитектурный документ): рассказ должен собираться
и из cron, и из теста, и без единого токена, а слой 1 обязан быть
детерминированным и проверяемым — LLM-скилл ни одного из этих свойств не даёт.

    episode_story.py run   --run-id ID   [--out PATH] [--brief]
    episode_story.py slug  --slug SLUG   [--out PATH] [--brief]
    episode_story.py list
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_log  # noqa: E402

ROOT = pipeline_log.ROOT
RUNS = pipeline_log.RUNS

ROLE_RU = {
    "scriptwriter": "сценарист",
    "director": "режиссёр анимации",
    "animation-director": "режиссёр анимации",
    "critic": "критик",
    "researcher": "исследователь",
}

ANOMALY_RU = {
    "git_stash_untracked": "попытка спрятать рабочее дерево в stash вместе с untracked-файлами",
    "git_reset_hard": "попытка сделать git reset --hard",
    "git_clean": "попытка выполнить git clean",
    "process_kill": "попытка убить посторонний процесс",
    "git_force_push": "попытка force-push",
    "worktree_force_remove": "принудительное удаление worktree",
    "duplicate_delegation": "повторное делегирование уже занятой задачи",
    "untracked_drift": "ценные файлы остались вне git",
    "worktree_conflict": "конфликт при вливании результата делегата",
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except ValueError:
            continue
    return out


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def hhmm(ts: str | None) -> str:
    if not ts:
        return "??:??"
    try:
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        return dt.astimezone().strftime("%H:%M:%S")
    except ValueError:
        return str(ts)[:8]


def human_sec(sec: float | None) -> str:
    if sec is None:
        return "—"
    sec = float(sec)
    if sec < 60:
        return f"{sec:.0f} сек"
    if sec < 3600:
        return f"{sec / 60:.0f} мин"
    return f"{sec // 3600:.0f} ч {(sec % 3600) / 60:.0f} мин"


def shell_of(tool_input: str | None) -> str | None:
    """Достаёт shell-команду из обёртки вызова инструмента Codex.

    Codex оборачивает команду в JS: tools.exec_command({cmd: "...", ...}).
    Для рассказа нужна сама команда, а не обёртка.
    """
    if not tool_input:
        return None
    m = re.search(r'cmd:\s*"((?:[^"\\]|\\.)*)"', tool_input)
    if m:
        try:
            return json.loads(f'"{m.group(1)}"')
        except ValueError:
            return m.group(1)
    return tool_input.strip().splitlines()[0] if tool_input.strip() else None


def plan_of(tool_input: str | None) -> str | None:
    """Достаёт explanation из tools.update_plan({explanation:"...", ...}).

    Планы-вслух тонут в общем списке команд как обрезанная JS-строка вида
    `const r = await tools.update_plan({explanation:"..."`, хотя explanation —
    осмысленный текст, того же сорта, что agent_message. Для --detail их
    стоит показывать отдельно, целиком, а не как «команду».
    """
    if not tool_input or "update_plan" not in tool_input:
        return None
    m = re.search(r'explanation\s*:\s*"((?:[^"\\]|\\.)*)"', tool_input)
    if not m:
        return None
    try:
        return json.loads(f'"{m.group(1)}"')
    except ValueError:
        return m.group(1)


def clean_output(raw: str) -> str:
    """output_head часто хранит не голый текст, а сериализованный список
    content-блоков MCP (`[{"type": "input_text", "text": "..."}]`) — читать
    это как JSON неудобнее, чем сам текст внутри. Достаём text-поля; если
    структура другая — отдаём как есть, не выдумывая формат."""
    raw = raw.strip()
    if not raw or raw[0] not in "[{":
        return raw
    try:
        parsed = json.loads(raw)
    except ValueError:
        return raw
    if isinstance(parsed, list):
        texts = [str(b.get("text")) for b in parsed
                 if isinstance(b, dict) and isinstance(b.get("text"), str)]
        if texts:
            return "\n".join(texts)
    elif isinstance(parsed, dict) and isinstance(parsed.get("text"), str):
        return parsed["text"]
    return raw


def detailed_actions(actions: list[dict[str, Any]], *, char_limit: int = 4000,
                     output_limit: int = 800) -> list[str]:
    """Полная хронология для --detail: команда целиком (не только первая
    строка), сразу под ней — что она вернула, планы-вслух — отдельной
    строкой своим текстом, а не как обрезанная JS-обёртка.

    Ограничен потолок, который не убрать: сырые размышления модели между
    действиями (kind="reasoning") зашифрованы Codex и недоступны ни в каком
    режиме — см. предупреждение в part_agents().
    """
    results: dict[str, str] = {}
    for act in actions:
        if act.get("kind") == "tool_result" and act.get("call_id"):
            results[str(act["call_id"])] = str(act.get("output_head") or "")

    lines: list[str] = []
    for act in actions:
        if act.get("kind") != "tool_call":
            continue
        plan = plan_of(act.get("input"))
        if plan is not None:
            lines.append(f"{hhmm(act.get('ts'))}  [план] {plan[:char_limit]}")
            continue
        cmd = shell_of(act.get("input"))
        if not cmd:
            continue
        lines.append(f"{hhmm(act.get('ts'))}  {cmd.strip()[:char_limit]}")
        raw_out = results.get(str(act.get("call_id") or ""), "")
        out = clean_output(raw_out).strip() if raw_out else ""
        if out:
            lines.append(f"          → {out[:output_limit]}")
    return lines


def summarize_commands(actions: list[dict[str, Any]], limit: int | None = 12,
                       char_limit: int = 150) -> list[str]:
    """Короткая выжимка того, что делегат реально запускал.

    limit=None — без обрезки середины (весь список команд, только по
    char_limit на строку); используется в режиме --detail.
    """
    lines: list[str] = []
    for act in actions:
        if act.get("kind") != "tool_call":
            continue
        cmd = shell_of(act.get("input"))
        if not cmd:
            continue
        first = cmd.strip().splitlines()[0].strip()
        lines.append(f"{hhmm(act.get('ts'))}  {first[:char_limit]}")
    if limit is None or len(lines) <= limit:
        return lines
    head = lines[: limit // 2]
    tail = lines[-(limit - len(head)):]
    gap = len(lines) - len(head) - len(tail)
    return head + [f"     … ещё {gap} команд …"] + tail


class RunStory:
    def __init__(self, run_dir: Path, *, detail: bool = False) -> None:
        self.dir = run_dir
        self.detail = detail
        self.events = read_jsonl(run_dir / "events.jsonl")
        self.manifest = read_json(run_dir / "manifest.json") or {}
        self.agents_index = read_json(run_dir / "agents" / "index.json") or {}
        self.registry = read_json(run_dir / "delegations.json") or {}

    def event_of(self, kind: str) -> dict[str, Any]:
        return next((e for e in self.events if e.get("kind") == kind), {})

    def events_of(self, *kinds: str) -> list[dict[str, Any]]:
        return [e for e in self.events if e.get("kind") in kinds]

    # ---------------------------------------------------------------- разделы

    def part_opening(self) -> list[str]:
        start = self.event_of("run_start")
        end = self.event_of("run_end")
        runner = start.get("runner") or {}
        if isinstance(runner, str):
            runner = {"cli": runner}
        slug = start.get("slug") or self.manifest.get("slug") or "?"
        topic = start.get("topic") or (self.manifest.get("episode") or {}).get("topic")

        out = [f"# Прогон {self.dir.name}", ""]
        out.append(f"**Эпизод:** `{slug}`")
        if topic:
            out.append(f"**Тема:** {topic}")
        model = runner.get("model") or "?"
        cli = runner.get("cli") or "?"
        out.append(f"**Оркестратор:** {cli}, модель {model}, "
                   f"effort {runner.get('effort') or '?'}")
        out.append("")

        out.append("## Как всё началось")
        out.append("")
        out.append(f"В {hhmm(start.get('ts'))} планировщик открыл прогон и передал "
                   f"управление оркестратору ({cli}/{model}). "
                   + (f"Тема, с которой он стартовал: «{topic}». " if topic else "")
                   + f"Slug на весь прогон — `{slug}`.")
        if end:
            status = end.get("status") or "?"
            wall = (self.manifest.get("timing") or {}).get("wall_sec")
            verdict = {"ok": "штатно", "failed": "с ошибкой"}.get(status, status)
            out.append("")
            out.append(f"Забегая вперёд: прогон завершился **{verdict}** "
                       f"(код выхода {end.get('exit_code')}), заняв "
                       f"{human_sec(wall)}.")
        else:
            out.append("")
            out.append("**Прогон не был закрыт штатно** — записи `run_end` в журнале "
                       "нет. Либо он ещё идёт, либо был оборван так, что не успел "
                       "закрыться (именно так выглядел инцидент 31.08.2026).")
        out.append("")
        return out

    def part_delegations(self) -> list[str]:
        claims = self.events_of("delegation_claim")
        denials = self.events_of("delegation_denied")
        releases = {e.get("actor"): e for e in self.events_of("delegation_release")}
        out = ["## Кого и зачем оркестратор позвал", ""]

        if not claims and not denials:
            out.append("Оркестратор не регистрировал ни одного делегирования. Это "
                       "значит либо что он всё сделал сам, либо — что он делегировал "
                       "мимо реестра. Второе видно по разделу о делегатах ниже: если "
                       "там есть сессии, а здесь пусто, реестр обошли.")
            out.append("")
            return out

        for ev in claims:
            role = ROLE_RU.get(str(ev.get("role")), str(ev.get("role")))
            attempt = ev.get("attempt")
            line = (f"- В {hhmm(ev.get('ts'))} оркестратор поручил роль "
                    f"**{role}** делегату `{ev.get('actor')}` "
                    f"(задача `{ev.get('task_id')}`")
            if attempt and int(attempt) > 1:
                line += f", попытка №{attempt}"
            line += ")."
            out.append(line)
            if ev.get("reason"):
                out.append(f"  Мотивировка: {ev['reason']}")
            rel = releases.get(ev.get("actor"))
            if rel:
                st = {"ok": "успешно", "failed": "с ошибкой",
                      "abandoned": "брошен"}.get(str(rel.get("status")), str(rel.get("status")))
                out.append(f"  Закрыт {st} через {human_sec(rel.get('held_sec'))}."
                           + (f" {rel.get('detail')}" if rel.get("detail") else ""))
            else:
                out.append("  **Лиза не закрыта** — делегат не отчитался о завершении.")
        out.append("")

        if denials:
            out.append("Реестр при этом отказал в следующих попытках:")
            out.append("")
            for ev in denials:
                out.append(f"- В {hhmm(ev.get('ts'))} попытка занять задачу "
                           f"`{ev.get('task_id')}` отклонена: её уже держал "
                           f"`{ev.get('held_by')}` (с {ev.get('held_since')}). "
                           f"Это сработавшая защита от дублирующего делегирования — "
                           f"ровно того, что в инциденте 31.08 никто не остановил.")
            out.append("")
        return out

    def part_agents(self) -> list[str]:
        sessions = self.agents_index.get("sessions") or []
        out = ["## Что делали делегаты", ""]
        if not sessions:
            out.append("Сессии делегатов в каталог прогона не втянуты. Запусти "
                       "`python3 tools/codex_session_import.py import --run-id "
                       f"{self.dir.name}` — без этого шага действия делегатов "
                       "остаются только в ~/.codex/sessions и в рассказ не попадают.")
            out.append("")
            return out

        delegates = [s for s in sessions if s.get("is_delegate")]
        others = [s for s in sessions if not s.get("is_delegate")]
        out.append(f"В окне прогона нашлось {len(sessions)} сессий Codex: "
                   f"{len(delegates)} делегатских (запущенных через MCP) и "
                   f"{len(others)} прочих.")
        out.append("")

        for s in sorted(sessions, key=lambda x: str(x.get("started_at") or "")):
            sid = str(s.get("session_id") or "?")
            tag = "делегат" if s.get("is_delegate") else f"сессия ({s.get('source')})"
            out.append(f"### {tag} `{sid[:8]}`")
            out.append("")
            out.append(f"Стартовала в {hhmm(s.get('started_at'))}, рабочий каталог "
                       f"`{s.get('cwd')}`. Сделала {s.get('actions_total')} действий, "
                       f"из них {s.get('tool_calls')} вызовов инструментов и "
                       f"{s.get('agent_messages')} реплик.")

            if s.get("reasoning_items") and not s.get("reasoning_readable"):
                out.append("")
                out.append(f"Модель думала {s['reasoning_items']} раз, но сами "
                           "размышления зашифрованы Codex и прочитать их нельзя — "
                           "в рассказ попадает только то, что она сказала вслух, "
                           "и то, что реально сделала.")

            actions = read_jsonl(self.dir / "agents" / sid / "actions.jsonl")
            msgs = [a for a in actions if a.get("kind") == "agent_message" and a.get("text")]
            if msgs:
                out.append("")
                out.append("Что говорила по ходу дела:")
                out.append("")
                shown_msgs = msgs if self.detail else msgs[:6]
                msg_char_limit = 1500 if self.detail else 400
                for m in shown_msgs:
                    text = " ".join(str(m["text"]).split())[:msg_char_limit]
                    out.append(f"> {hhmm(m.get('ts'))} — {text}")
                    out.append("")
                if not self.detail and len(msgs) > 6:
                    out.append(f"_(и ещё {len(msgs) - 6} реплик — смотри `--detail`)_")
                    out.append("")

            if self.detail:
                cmds = detailed_actions(actions)
                label = "Что запускала (целиком, с результатами и планами вслух):"
            else:
                cmds = summarize_commands(actions, limit=12, char_limit=150)
                label = "Что запускала:"
            if cmds:
                out.append(label)
                out.append("")
                out.append("```")
                out.extend(cmds)
                out.append("```")
                out.append("")

            if s.get("dangers"):
                out.append("**Опасные действия:**")
                out.append("")
                for d in s["dangers"]:
                    name = ANOMALY_RU.get(d.get("anomaly_kind"), d.get("anomaly_kind"))
                    cmd = shell_of(d.get("evidence")) or d.get("evidence")
                    out.append(f"- {hhmm(d.get('ts'))} — {name}. {d.get('why')}")
                    out.append(f"  ```")
                    out.append(f"  {str(cmd).strip().splitlines()[0][:200]}")
                    out.append(f"  ```")
                out.append("")
        return out

    def part_stages(self) -> list[str]:
        stages = (self.manifest.get("timing") or {}).get("stages") or {}
        if not stages:
            return []
        out = ["## Как шёл сам конвейер", ""]
        order = sorted(stages.items(), key=lambda kv: -(kv[1].get("wall_sec") or 0))
        for name, data in order:
            st = {"ok": "прошёл", "failed": "упал",
                  "unknown": "остался незакрытым"}.get(str(data.get("status")),
                                                       str(data.get("status")))
            out.append(f"- **{name}** — {st}, {human_sec(data.get('wall_sec'))}"
                       + (" (начало восстановлено по соседним событиям)"
                          if data.get("inferred_start") else ""))
        cov = (self.manifest.get("timing") or {}).get("coverage_pct")
        if cov is not None:
            out.append("")
            out.append(f"Размеченными этапами покрыто {cov}% времени прогона; "
                       f"остальное — {human_sec((self.manifest.get('timing') or {}).get('unaccounted_sec'))} "
                       "конвейер не отчитался, чем был занят.")
        out.append("")
        return out

    def part_trouble(self) -> list[str]:
        anomalies = self.events_of("anomaly")
        incidents = self.events_of("incident")
        denials = self.events_of("delegation_denied")
        unreleased = [c for c in (self.registry.get("claims") or {}).values()
                      if c.get("state") == "running"]
        out = ["## Что пошло не так", ""]

        if not (anomalies or incidents or denials or unreleased):
            out.append("Ничего необычного: опасных действий не зафиксировано, "
                       "дублирующих делегирований не было, все лизы закрыты, "
                       "инцидентов конвейер не отметил.")
            out.append("")
            return out

        if anomalies:
            out.append("**Опасные действия агентов:**")
            out.append("")
            for e in anomalies:
                name = ANOMALY_RU.get(str(e.get("anomaly_kind")), e.get("anomaly_kind"))
                out.append(f"- {hhmm(e.get('ts'))} — `{e.get('actor')}`: {name}. "
                           f"{e.get('detail') or ''}")
            out.append("")

        if denials:
            out.append(f"**Дублирующих делегирований отклонено:** {len(denials)}. "
                       "Каждое такое — сигнал, что оркестратор терял уверенность в "
                       "уже запущенном делегате. Если их много, проблема не в "
                       "делегате, а в том, что оркестратор не видит его статуса.")
            out.append("")

        if unreleased:
            out.append("**Незакрытые лизы:**")
            out.append("")
            for c in unreleased:
                out.append(f"- `{c.get('agent_id')}` на задаче `{c.get('task_id')}` "
                           "так и не отчитался. Либо делегат умер, либо оркестратор "
                           "забыл его закрыть.")
            out.append("")

        if incidents:
            out.append("**Инциденты конвейера:**")
            out.append("")
            for e in incidents:
                out.append(f"- {hhmm(e.get('ts'))} — этап `{e.get('stage')}`, "
                           f"{e.get('severity')}: {e.get('detail')}")
            out.append("")
        return out

    def part_ending(self) -> list[str]:
        end = self.event_of("run_end")
        out = ["## Чем кончилось", ""]
        comp = self.manifest.get("composition") or {}
        arts = self.manifest.get("artifacts") or {}
        verdicts = self.manifest.get("verdicts") or []

        if not end:
            out.append("Штатного завершения не было — журнал обрывается на "
                       f"{hhmm(self.events[-1].get('ts')) if self.events else '??'}. "
                       "Всё, что должно было произойти после этого момента "
                       "(манифест, отправка на ревью, уведомление оператору), "
                       "не произошло.")
            out.append("")
            return out

        if comp.get("scene_count"):
            out.append(f"Готовый эпизод — {comp['scene_count']} сцен, "
                       f"{comp.get('spoken_words', '?')} слов, "
                       f"{human_sec(comp.get('video_sec'))} видео.")
        if verdicts:
            last = verdicts[-1]
            v = {"accepted": "принял", "revisions": "вернул на правки"}.get(
                str(last.get("verdict")), str(last.get("verdict")))
            out.append(f"Критик {v} с {last.get('issues', 0)} замечаниями "
                       f"на круге {last.get('round')}.")
        if arts.get("mp4"):
            out.append(f"Рендер лежит в `{arts['mp4']}`.")
        growth = self.manifest.get("library_growth") or {}
        if growth.get("new_story_visuals"):
            out.append(f"Библиотека визуалов подросла на "
                       f"{len(growth['new_story_visuals'])}: "
                       + ", ".join(f"`{v}`" for v in growth["new_story_visuals"]) + ".")
        out.append("")
        return out

    def render(self) -> str:
        parts: list[str] = []
        parts += self.part_opening()
        parts += self.part_delegations()
        parts += self.part_agents()
        parts += self.part_stages()
        parts += self.part_trouble()
        parts += self.part_ending()
        parts.append("---")
        parts.append("")
        parts.append("_Собрано автоматически `tools/episode_story.py` из "
                     "`events.jsonl`, `delegations.json`, `agents/*/actions.jsonl` "
                     "и `manifest.json` этого прогона. Каждое утверждение выше "
                     "выведено из записи в журнале; ничего не додумано._")
        return "\n".join(parts) + "\n"

    def brief(self) -> str:
        """Бриф для LLM: факты + жёсткий запрет добавлять своё."""
        return (
            "Ниже — детерминированная хронология одного прогона автономного "
            "конвейера ShortVideo, собранная из его журналов.\n\n"
            "Перескажи её живой связной прозой на русском, в духе рассказа "
            "(образец интонации — corrections/git-reset-clean-incident/"
            "INCIDENT-NARRATIVE.md): что происходило по порядку, кто что решил "
            "и почему, где ошибся. Пиши так, чтобы это было понятно на слух.\n\n"
            "ЖЁСТКОЕ ПРАВИЛО: не добавляй ни одного факта, которого нет ниже. "
            "Не домысливай мотивы агентов сверх того, что они сказали сами. "
            "Если чего-то в данных нет — так и скажи, что этого в логах не "
            "видно. Выдуманная деталь в таком рассказе опаснее отсутствующей: "
            "по этим рассказам принимаются решения о том, что агентам "
            "запрещать.\n\n"
            "=== ХРОНОЛОГИЯ ===\n\n" + self.render()
        )


def find_runs(slug: str | None = None) -> list[Path]:
    if not RUNS.is_dir():
        return []
    dirs = [d for d in sorted(RUNS.iterdir()) if d.is_dir() and not d.name.startswith(".")]
    if slug:
        dirs = [d for d in dirs if d.name.endswith(slug) or slug in d.name]
    return dirs


def write_out(text: str, out: Path | None) -> None:
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        print(f"рассказ записан: {out}", file=sys.stderr)
    else:
        sys.stdout.write(text)


def cmd_run(args: argparse.Namespace) -> int:
    run_dir = RUNS / args.run_id
    if not run_dir.is_dir():
        print(f"нет каталога прогона {run_dir}", file=sys.stderr)
        return 2
    story = RunStory(run_dir, detail=args.detail)
    text = story.brief() if args.brief else story.render()
    out = Path(args.out) if args.out else (None if args.brief else run_dir / "STORY.md")
    write_out(text, out)
    return 0


def cmd_slug(args: argparse.Namespace) -> int:
    dirs = find_runs(args.slug)
    if not dirs:
        print(f"прогонов по slug {args.slug!r} не найдено", file=sys.stderr)
        return 2
    chunks: list[str] = []
    if len(dirs) > 1:
        chunks.append(f"# Эпизод `{args.slug}` — {len(dirs)} прогона\n")
        chunks.append("Один и тот же эпизод производился несколько раз. "
                      "Ниже — все попытки по порядку.\n")
    for d in dirs:
        chunks.append(RunStory(d, detail=args.detail).render())
        chunks.append("\n---\n")
    text = "\n".join(chunks)
    if args.brief:
        text = RunStory(dirs[-1], detail=args.detail).brief() if len(dirs) == 1 else \
            ("Ниже — хронологии всех прогонов одного эпизода.\n\n" + text)
    out = Path(args.out) if args.out else None
    write_out(text, out)
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    dirs = find_runs()
    if not dirs:
        print("прогонов нет")
        return 0
    for d in dirs[-args.limit:]:
        story = RunStory(d)
        start = story.event_of("run_start")
        end = story.event_of("run_end")
        anomalies = len(story.events_of("anomaly"))
        mark = "!" if anomalies else " "
        status = end.get("status") if end else "НЕ ЗАКРЫТ"
        print(f"{mark} {d.name:<40} {str(status):<10} "
              f"аномалий={anomalies}  {start.get('topic') or ''}"[:150])
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="episode_story.py", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="рассказ по одному прогону")
    r.add_argument("--run-id", required=True)
    r.add_argument("--out", default=None)
    r.add_argument("--brief", action="store_true",
                   help="напечатать бриф для LLM вместо готового рассказа")
    r.add_argument("--detail", action="store_true",
                   help="все реплики и все команды каждой сессии целиком "
                        "(не только первая строка), с выводом каждой команды "
                        "и планами-вслух отдельно — не только первые 6 реплик "
                        "/ 12 команд с обрезкой середины")

    s = sub.add_parser("slug", help="рассказ по всем прогонам эпизода")
    s.add_argument("--slug", required=True)
    s.add_argument("--out", default=None)
    s.add_argument("--brief", action="store_true")
    s.add_argument("--detail", action="store_true")

    l = sub.add_parser("list", help="прогоны и есть ли в них аномалии")
    l.add_argument("--limit", type=int, default=20)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return {"run": cmd_run, "slug": cmd_slug, "list": cmd_list}[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
