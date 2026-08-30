# The research Mental CLI is built on

Mental CLI exists because **agentic development is a continuity problem**, not a typing-speed problem.

Since late 2022, coding agents became the normal way many developers work. Git still records what changed. Chat still evaporates at the session boundary. The human is now the supervisor of one or several agents, across one or several repos: directing, verifying, correcting, then hopping. That hop — a new agent, Monday morning, a second clone — is what people feel as mental fry, decision exhaustion, and brain fatigue.

This page is the citation trail (2024–2026, peer-reviewed first). The README keeps the short version.

Mental CLI has not been run as a lab study. The claim is narrower and honest: the papers describe a tax the speed studies never measured, and Mental is the external cue that hop needs — a resume line, the decisions git cannot see, and the residue still in the air — shared with the next human or agent.

## The work shifted: you write less, you supervise more

[Vella and Blincoe (2026)](https://arxiv.org/abs/2605.23135) followed professional engineers for six months (158 → 95 matched). **82%** reported spending less time writing code. Effort moved toward **verification**. They name the new category **supervisory engineering work**: directing AI, evaluating its output, and correcting it.

They also named the **productivity–experience paradox**: **84%** still said productivity improved, at both time points, while the share reporting a worse developer experience in at least one dimension nearly doubled (**14% → 27%**). Flow and cognitive load eroded. Feedback loops improved. Feeling faster and feeling fried can be the same week.

[Chen, Talwalkar, Brennan, and Neubig (2025)](https://arxiv.org/abs/2507.08149) ran the first controlled comparison of copilots vs coding agents. Agents raised task correctness about **35%** and cut user effort roughly in half versus copilots, with lower reported cognitive load — and participants still wanted better **understanding of agent outputs**. Autonomy does not remove the supervisor. It moves the bottleneck to “did I actually understand what just landed?”

[Huang, Moreno Reyna, Lerner, Xia, and Hempel (2025)](https://arxiv.org/abs/2512.14012) observed professional developers using agents in 2025: they do not “vibe.” They **control** design and implementation — plan first, review or monitor every change, reject what does not fit. The expensive artifact is the control surface (constraints, next action, what is still unverified), not the chat transcript.

Mental CLI stores that control surface. Git cannot.

## Speed is not the same as continuity

Early Copilot labs reported large speedups on narrow tasks. Later field evidence split.

[Paradis et al. (ICSE-SEIP 2025)](https://doi.org/10.1109/icse-seip66354.2025.00060) — Google RCT, 96 full-time engineers, complex enterprise task — estimated about **21%** shorter time on task with internal AI features (wide confidence interval; summer 2024 tooling).

[Becker et al. / METR (2025)](https://arxiv.org/abs/2507.09089) — RCT of **16** experienced open-source developers, **246** real issues, primarily Cursor Pro with Claude 3.5/3.7 Sonnet (Feb–Jun 2025). Developers forecast a **24%** speedup and, after the fact, still believed they had been **20%** faster. Measured completion time was **19% longer**. Screen labels: less time writing and searching; more time **prompting, waiting, and reviewing**. They accepted **under 44%** of AI generations; about **9%** of time went to reviewing and cleaning AI output.

That gap — felt faster, often not — is the reconstruction and verification tax. Mental CLI does not make the model smarter. It stops the next session from paying the tax a second time.

[DORA 2025](https://dora.dev/dora-report-2025/) surveyed nearly 5,000 professionals: **90%** use AI at work, a median of **two hours a day**. More than **80%** say it increased productivity. **30%** report little or no trust in AI-generated code. High adoption plus low trust is not a contradiction. It is a standing verification load.

## Verification load is the fatigue you can measure

[Fan, Liu, Pan, and Zhang (CHI 2026)](https://doi.org/10.1145/3772318.3791176) held the model fixed and varied the interface (inline, chat, structured; N = 60). AI cut NASA-TLX workload by **18.2** points and time by **22%** versus no AI — and still, a **verification-load index** (failures, time-to-first-compile, churn, pauses, context switches) **partially mediated rising stress and fatigue across tasks**. Help can hurt when the leftover work is checking.

Their design guidance is the product brief: report verification load alongside outcomes; package work so it is **verification-aware**. Mental CLI’s journal `Resume:` line and open-loop list are that package for the *next* hop. They are not a compile-failure metric. They are the human-readable remainder: what still needs eyes, what was decided, what is still in the air.

## Switching got quieter, not cheaper

[Sergeyuk, Huang, Karaeva, Serova, Golubev, and Ahmed (ICSE 2026)](https://doi.org/10.1145/3744916.3787811) — JetBrains + UC Irvine — analyzed **151,904,543** IDE events from **800** developers (Oct 2022–Oct 2024, ChatGPT’s public life through mainstream in-IDE assistants). AI users wrote more and deleted more. Window switching trended **up** for AI users and not for non-users. In the survey arm, **74%** of AI-assisted developers said switching had **not** increased.

The hop no longer feels like an interruption. It feels like using the tool. Telemetry still looks like fragmentation. `mental park --resume` is the ready-to-resume plan for a hop you might not notice you took.

## Strain is a job-demand problem, not a character problem

[Feng, Afroz, and Sarma (ICSE-SEIS 2026)](https://doi.org/10.1145/3786581.3786934) surveyed **442** developers and modeled burnout with the Job Demands–Resources lens. GenAI adoption heightens burnout **through elevated organizational pressure and workload**. Autonomy and learning resources mitigate it. They cite the same redistribution others measured: time saved on generation reappears as debugging, security review, and oversight ([Harness 2025](https://www.harness.io/state-of-software-delivery) reported **67%** spending more time debugging AI-generated code).

Mental CLI is a **job resource** in that model: an external store for open loops so working memory is not the backlog. It is not a wellness app and it does not claim to prevent burnout.

## The intervention (ready-to-resume)

The mechanism is older than agents. [Leroy and Glomb (2018)](https://doi.org/10.1287/orsc.2017.1184), *Organization Science*, showed that a brief **ready-to-resume plan** — where you left off, what you will do when you return — reduces attention residue and improves performance on the interrupting task. Mental CLI’s `park` / `handoff` `Resume:` line is that plan, written by the agent, for a hop that is now an agent session or a second repo rather than a hallway tap.

We do not lead the product story with 1998–2011 interruption studies. Those papers described human resumption before agents existed. The hop they measured is real; the *source* of the hop changed.

## What this is not

- Not a claim that Mental CLI was validated in those labs or surveys.
- Not a claim that AI always slows you down (Google’s RCT found a speedup; METR found a slowdown in a different setting). The consistent finding is **redistribution**: generation gets cheaper, verification and continuity do not.
- Not Baumeister-style “ego depletion” as a glucose effect (that literature did not replicate cleanly). The fatigue developers describe is real; the mechanisms we cite are **supervisory load**, **verification load**, **stealth context switching**, and **unfinished-work residue**.
- Not a todo app. Notes without a prospective cue fail. Mental CLI stores the cue, not a backlog.
- Not a productivity scoreboard. We refuse to turn the pulse into analytics theater.

## Map to the product (what already ships)

| Finding | Mental CLI |
| --- | --- |
| Supervisory engineering / control surface (Vella, Huang) | `mental decide`, `--against PLAN.md`, journal body = only what git cannot explain |
| Session boundary = the new interruption (DORA 2h/day with AI; chat gone next session) | `mental` / `heartbeat --json` — one resume line, last outcome, git, residue, unsettled decisions |
| Ready-to-resume plan (Leroy & Glomb) | `park --resume` (mid-hop) and `handoff --resume` (planned close) |
| Verification remainder (Fan; METR review time) | `kind: verify` → heartbeat **Needs eyes** (cap 7, verify first). Resolve when reviewed. |
| Deferred thread ("come back to this") | `attention --status later` → heartbeat **Later**. Not a note. |
| Stealth switching (Sergeyuk et al.) | Agents `park` at a hop; TTY **Hops** = parks today (`hopsToday`). Not a scoreboard. |
| Several repos, several agents (orchestration load) | `pulse` — compact rows; `--via` names the client; re-heartbeat if another agent may have written |
| Control, don’t vibe (Huang) | **Settled** = newest decided titles on the pulse (cap 7, titles only) |
| Job resource vs demand dump (Feng) | Fail open; never auto-journal every turn; hooks off by default |

Demoted (not shipped): episodic git cue, `mental why`. The four research-shaped items above shipped in [Unreleased]; trail: [issue #5](https://github.com/afaraha8403/mental/issues/5).

Citations stay on this page so the README can stay a landing page.
