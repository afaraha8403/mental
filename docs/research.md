# The research Mental is built on

Mental exists because orchestrating several repos and several agents is a **resumption problem** with extra hops. Developers already feel it as decision fatigue and brain fatigue. The HCI and organizational-behavior literature named the mechanisms years before coding agents arrived.

This page is the citation trail. The README keeps the short version.

Mental has not been run as a lab study. The claim is narrower and honest: the papers describe the tax, ask for an external cue, and Mental is that cue — a resume line, the decisions git cannot see, and the residue still in the air — shared with the next human or agent.

## Resumption is slow

[Parnin and Rugaber (2011)](https://doi.org/10.1007/s11219-010-9104-9), *Software Quality Journal* — 10,000 recorded sessions from 86 programmers, plus a survey of 414 — found that **only 10% of sessions start coding again within a minute** after an interruption, and **only 7% edit without first navigating elsewhere** to remember. Developers already cope with rehearsal, serialization, and cue priming (sticky notes, TODOs, compile errors left as roadblocks). IDEs still lack an explicit representation of goals, plans, and intermediate knowledge.

[Parnin and DeLine (CHI 2010)](https://doi.org/10.1145/1753326.1753342) surveyed 371 programmers: they rely heavily on note-taking across several media. In the lab, an explicit resumption cue **doubled task-completion success** versus notes alone.

[LaToza, Venolia, and DeLine (ICSE 2006)](https://doi.org/10.1145/1134285.1134355) — a Microsoft developer survey cited throughout this literature — found **62%** believed recovering from interruptions was a serious problem.

[van Solingen, Berghout, and van Latum (IEEE Software 1998)](https://doi.org/10.1109/52.714427) observed industrial software teams spending about **an hour a day** managing interruptions, with roughly **15 minutes** to recover from one.

Mental’s `heartbeat` is the explicit cue those papers asked for: one resume line, last outcome, git, residue, unsettled decisions. Agents call it instead of reconstructing from chat.

## Unfinished work leaks (attention residue)

[Leroy (2009)](https://doi.org/10.1016/j.obhdp.2009.04.002), *Organizational Behavior and Human Decision Processes*, named **attention residue**: cognitions about Task A persist after you have switched to Task B, and subsequent performance drops — especially when Task A is unfinished.

That is Mental’s `attention` type, in the product’s own words (“in the air”). Write the residue down the moment it surfaces. Cap seven on the heartbeat. Resolve it. Working memory can drop what the file is holding.

[Trafton, Altmann, Brock, and Mintz (2003)](https://doi.org/10.1016/S1071-5819(03)00023-5) showed that **prospective goal encoding** at the interruption — “what I will do when I come back” — shortens resumption lag. Mental’s journal `Resume:` line is that encoding.

## You pay in stress even when you “keep up”

[Mark, Gudith, and Klocke (CHI 2008)](https://doi.org/10.1145/1357054.1357072) found interrupted people finished **faster**, with no quality drop in that study — and with **more stress, frustration, time pressure, and effort**. After about 20 minutes of interrupted work, the workload ratings were already significantly higher.

[Mark, Gonzalez, and Harris (CHI 2005)](https://doi.org/10.1145/1054972.1055017) observed information workers switching about every **three minutes**, with **57% of tasks interrupted** and work fragmented into many small sessions.

The popular “23 minutes to refocus” figure comes from Mark’s later interviews about time-to-return, not from the 2008 CHI paper. We do not repeat it as a paper result.

Mental does not stop the hop. It stops you from paying a second tax: reconstructing intent from `git log` and yesterday’s agent chat.

## What this is not

- Not a claim that Mental was validated in those labs.
- Not Baumeister-style “ego depletion” / decision-fatigue as a glucose effect (that literature did not replicate cleanly). The fatigue developers describe is real; the mechanisms we cite are **resumption lag**, **attention residue**, and **interrupted-work stress**.
- Not a todo app. The papers warn that notes without a prospective cue fail. Mental stores the cue, not a backlog.

## Map to the product

| Finding | Mental |
| --- | --- |
| Resumption needs an explicit cue (Parnin, DeLine) | `mental` / `mental heartbeat --json` |
| Prospective goal encoding (Trafton) | Journal `Resume:` — one exact next action |
| Attention residue (Leroy) | `mental attention`, heartbeat “In the air”, cap 7 |
| Decisions that constrain the future | `mental decide` — git cannot see the why |
| Notes scattered across media (Parnin & DeLine survey) | One CLI, UUID identity, agents use `--json` |
| Next session / next agent is another interruption | Shared home slice; fail open if Mental is missing |
