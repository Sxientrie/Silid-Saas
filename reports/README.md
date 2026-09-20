# /Silid/reports/ — acceptance reports and proof artifacts

This directory is the client-facing proof surface of the build (see
`spec/00-master-goal.md`, ACCEPTANCE REPORTS & PROOF CLIPS, and
`spec/builder-protocol.md` §4). The client reads what lands here instead
of logs or code.

## Layout

```
reports/
  phase-<NN>-acceptance.md      one generated client acceptance report per
                                phase, compiled by the acceptance-report
                                generator (@silid/testing) from the
                                phase file's acceptance inputs and that
                                phase's test results; every line is
                                green before a phase closes
  proof/                        machine evidence backing the reports
    e2e/                        Playwright output dir — each E2E test run
                                records a video clip (`.webm`) here,
                                one folder per test case (video
                                recording is always on; the clips are
                                the "proof clips" the acceptance report
                                links)
    mutation/                   Stryker mutation-gate reports (clear-text
                                summary plus html/json) per gated package
    coverage/                   coverage-gate summaries for the gated
                                packages (db, api)
    money-recomputation/        Money Recomputation Gate diff reports
                                (phases that produce peso figures)
    phase-00-fixture-acceptance.md
                                the acceptance-report generator's own
                                fixture-phase run (Deliverable 13's proof)
```

## Conventions

- Proof clips are recorded automatically by Playwright for **every** E2E
  test (`video: 'on'` in the workspace-root `playwright.config.ts`);
  nothing proof-worthy is recorded by hand.
- Reports are generated, never hand-edited; regenerating a phase report
  re-runs the generator with that phase's inputs and results.
- Binary clips are committed so the acceptance history is reviewable from
  any checkout; they are small (seconds-long clips of smoke tests).
