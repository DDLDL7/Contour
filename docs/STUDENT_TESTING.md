# Student usability and device test protocol

Status: prepared; no participants have been tested. Do not count this document as a completed usability study.

Recruit secondary-school and university students separately. Aim for at least three in each group for this first qualitative pass. Use ordinary tasks relevant to their current course. Participation should be voluntary; follow the school's consent requirements. Use participant codes, avoid personal data in project files and do not record students without permission.

Use a blank QA workspace and a separate test project for each participant. Allow 30–40 minutes. Tell the student: “We are testing the calculator, not you. Please say what you expect to happen. If something is confusing, that helps us improve it.” Observe before giving instructions. Record a prompt as assistance, even if the task later succeeds.

## Tasks

1. Plot `y = sin(x)`, adjust the visible graph, then save a project file. Success: the function is visible and a file exists which can be reopened.
2. Plot `y = a*x^2`. Compare positive, zero and negative values of `a`, and explain what changes. Success: the student finds the parameter control and relates it to the graph.
3. Enter five x/y pairs in the spreadsheet: `(0,1), (1,3), (2,5), (3,7), (4,9)`. Fit a line and change one y value. Success: the student finds the fit and sees it update.
4. Choose a notebook activity from **Activity templates**, edit a prompt, check an answer and add a parameter action. Success: the student understands the appended activity and runs the action intentionally.
5. Export a JPEG or PNG graph and an HTML worksheet. Open both files; print/save the worksheet as PDF if the platform supports it. Success: files show the expected content, and answer visibility matches the chosen option.
6. Wait for **Offline maths ready**, disable networking using the test device's normal controls, close/reopen the app and perform a symbolic calculation. Success: saved work returns and the local mathematics engine produces a result. Restore networking afterward.

For university students, add a domain task: compare `sqrt(x^2)` with `x`, or investigate the two-sided limit of `1/x` at zero. Success: the student distinguishes domain restrictions, one-sided behaviour and approximate results.

## Device and accessibility checks

Repeat core tasks on a baseline student laptop and a real touch device. Record device model, RAM, OS/browser version, orientation, viewport and whether the app is native or web. On touch, inspect selection, dragging, sliders, keyboard opening, scroll, toolbar reachability and export. Emulation alone does not complete these checks.

Perform a separate keyboard-only run, then a VoiceOver run with an experienced user. Include expression entry, calculation/result announcements, parameter editing, Help open/close, templates, export, spreadsheet navigation and project reopen. Test 200% and 400% zoom and reduced motion. Record the spoken output; an accessibility-tree label alone is not proof that VoiceOver announces it correctly.

Measure input-to-paint and 2D interaction on documented scenes; record a 3D performance trace while rotating a sphere, torus and combined solids/field scene. The target is at least 30 FPS for representative 3D scenes, with ordinary input feedback around 100 ms. Check memory after a sustained 30-minute session and note thermal/battery effects. Node computation benchmarks do not establish these browser/GPU targets.

## Result sheet — duplicate per session

| Field | Result |
|---|---|
| Participant code / school or university group | |
| Date / build commit | |
| Device / RAM / OS / browser | |
| Input method / zoom / accessibility tools | |
| Task 1: completion, time, assistance, observation | |
| Task 2 | |
| Task 3 | |
| Task 4 | |
| Task 5 | |
| Task 6 | |
| Domain task, if used | |
| Browser input / 3D performance measurements | |
| Confusing label or action, in student's own words | |
| Highest-impact issue / reproduction steps | |

After the sessions, prioritise task failures, data loss and inaccessible paths first. Fix findings, rerun the affected tasks and update the release report with actual evidence. Leave untested platforms and tasks explicitly open.
