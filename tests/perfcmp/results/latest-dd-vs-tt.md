# Performance comparison: dd vs tt

Generated 2026-10-14T17:29:32.745Z. 5 runs per app and scenario, interleaved, CPU throttling x4, trace on.

| | |
| --- | --- |
| dd | telegram-dd port/perfcmp@9620b3c (built 9ddf170) |
| tt | telegram-tt copy tt@090e38f (reused build 66dcdfe) |
| machine | Apple M1 Pro, 10 cores, 16 GB, darwin 25.5.0 |
| software | node v24.3.0, Chromium 156.0.8078.4 (headless) |
| load (`uptime`) before | 22:23  up 2 days,  2:11, 1 user, load averages: 11.06 12.61 11.48 |
| load (`uptime`) after | 22:29  up 2 days,  2:18, 1 user, load averages: 13.94 17.47 14.39 |
| 1-min load average at the start of runs | min 9.7, median 18.4, max 34.8 |

Ratio = dd / tt of the medians; below 1 means dd is cheaper. "better" / "worse" mean more than 10% apart, "~" within 10% (see the A/A section of docs/quality-gates.md for what the method resolves). Min-max over the runs is in brackets.

## App shell boot

Cold start until `#Main` (the logged-in shell) is rendered, plus 1.5 s. Works before the chat list is ported.


| metric | dd | tt | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | 5 (4-6) | 7 | 0.71x | better |
| long tasks, total ms | 756 (687-807) | 898 (878-1059) | 0.84x | better |
| long task, max ms | 293 (287-308) | 298 (291-304) | 0.98x | ~ |
| total blocking time ms | 506 (487-528) | 548 (528-709) | 0.92x | ~ |
| longest task ms | 294.3 (287.9-308.9) | 298.5 (291.9-304.7) | 0.99x | ~ |
| script ms | 902 (866-924) | 1080 (1054-1257) | 0.84x | better |
| style ms | 19 (17-22) | 95 (92-124) | 0.20x | better |
| layout ms | 40 (36-45) | 83 (78-100) | 0.48x | better |
| paint ms | 9 (8-12) | 70 (68-78) | 0.13x | better |
| GC ms | 36 (30-37) | 33 (27-40) | 1.10x | ~ |
| frames dropped | 43 (41-45) | 65 (60-100) | 0.66x | better |
| DOM mutations | 241 | 552 | 0.44x | better |
| JS heap after GC MB | 10.9 (10.9-10.9) | 14.5 (14.5-15.3) | 0.75x | better |
| time to first chat row ms | 621 (599-653) | 883 (855-1572) | 0.70x | better |
| measured window ms | 2201 (2132-2239) | 2506 (2482-3176) | 0.88x |  |

## 1. Cold start to the chat list

Navigation to the first rendered chat row (1200 mocked chats, folders), plus 1.5 s of follow-up work.

- **dd: n/a** - the chat list is not rendered (not ported yet?)

| metric | dd | tt | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | n/a | 7 |  |  |
| long tasks, total ms | n/a | 932 (864-945) |  |  |
| long task, max ms | n/a | 296 (234-314) |  |  |
| total blocking time ms | n/a | 582 (514-595) |  |  |
| longest task ms | n/a | 296.6 (234.6-314.6) |  |  |
| script ms | n/a | 1106 (1036-1147) |  |  |
| style ms | n/a | 110 (97-129) |  |  |
| layout ms | n/a | 85 (79-100) |  |  |
| paint ms | n/a | 86 (76-89) |  |  |
| GC ms | n/a | 33 (29-58) |  |  |
| frames dropped | n/a | 67 (59-71) |  |  |
| DOM mutations | n/a | 553 |  |  |
| JS heap after GC MB | n/a | 14.6 (14.6-14.6) |  |  |
| time to first chat row ms | n/a | 1804 (1669-1975) |  |  |
| measured window ms | n/a | 3395 (3185-3488) |  |  |

## 2a. New messages, burst of 20

20 new messages in chats 9-28 of the list delivered in one task; each chat moves to the top.

- **dd: n/a** - the chat list is not rendered (not ported yet?)

| metric | dd | tt | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | n/a | 2 |  |  |
| long tasks, total ms | n/a | 227 (222-233) |  |  |
| long task, max ms | n/a | 172 (165-179) |  |  |
| total blocking time ms | n/a | 127 (122-133) |  |  |
| longest task ms | n/a | 171.9 (165.8-178.9) |  |  |
| script ms | n/a | 283 (272-294) |  |  |
| style ms | n/a | 52 (47-57) |  |  |
| layout ms | n/a | 12 (11-13) |  |  |
| paint ms | n/a | 74 (70-89) |  |  |
| GC ms | n/a | 24 (21-28) |  |  |
| frames dropped | n/a | 12 (12-17) |  |  |
| DOM mutations | n/a | 511 |  |  |
| JS heap after GC MB | n/a | 14.9 (14.9-15.0) |  |  |
| measured window ms | n/a | 2020 (2006-2023) |  |  |

## 2b. New messages, one by one

20 new messages in chats 9-28, one per task, 100 ms apart; each chat moves to the top.

- **dd: n/a** - the chat list is not rendered (not ported yet?)

| metric | dd | tt | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | n/a | 0 |  |  |
| long tasks, total ms | n/a | 0 |  |  |
| long task, max ms | n/a | 0 |  |  |
| total blocking time ms | n/a | 0 |  |  |
| longest task ms | n/a | 42.0 (33.9-49.6) |  |  |
| script ms | n/a | 653 (595-786) |  |  |
| style ms | n/a | 146 (134-164) |  |  |
| layout ms | n/a | 43 (37-50) |  |  |
| paint ms | n/a | 272 (263-314) |  |  |
| GC ms | n/a | 55 (49-62) |  |  |
| frames dropped | n/a | 6 (2-11) |  |  |
| DOM mutations | n/a | 1227 (1221-1227) |  |  |
| JS heap after GC MB | n/a | 15.2 (15.2-15.2) |  |  |
| measured window ms | n/a | 3620 (3575-3817) |  |  |

## 3. Typing / online storm

100 updates per second for 3 s: typing indicators and online/offline flips of the top private chats.

- **dd: n/a** - the chat list is not rendered (not ported yet?)

| metric | dd | tt | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | n/a | 0 |  |  |
| long tasks, total ms | n/a | 0 |  |  |
| long task, max ms | n/a | 0 |  |  |
| total blocking time ms | n/a | 0 |  |  |
| longest task ms | n/a | 10.1 (9.2-15.1) |  |  |
| script ms | n/a | 1171 (1126-1373) |  |  |
| style ms | n/a | 110 (104-132) |  |  |
| layout ms | n/a | 8 (6-9) |  |  |
| paint ms | n/a | 180 (176-206) |  |  |
| GC ms | n/a | 56 (52-89) |  |  |
| frames dropped | n/a | 0 |  |  |
| DOM mutations | n/a | 68 |  |  |
| JS heap after GC MB | n/a | 19.3 (19.3-19.3) |  |  |
| measured window ms | n/a | 4326 (4314-4410) |  |  |

## 4. Scroll the chat list

Scroll the 1200-chat list from the top to the bottom, 120 px per frame (the list pages in as it goes).

- **dd: n/a** - the chat list is not rendered (not ported yet?)

| metric | dd | tt | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | n/a | 20 (13-24) |  |  |
| long tasks, total ms | n/a | 1265 (861-1662) |  |  |
| long task, max ms | n/a | 121 (118-126) |  |  |
| total blocking time ms | n/a | 265 (211-462) |  |  |
| longest task ms | n/a | 121.4 (118.4-126.4) |  |  |
| script ms | n/a | 2405 (2212-2570) |  |  |
| style ms | n/a | 414 (389-422) |  |  |
| layout ms | n/a | 261 (250-265) |  |  |
| paint ms | n/a | 532 (513-551) |  |  |
| GC ms | n/a | 204 (184-226) |  |  |
| frames dropped | n/a | 84 (74-95) |  |  |
| DOM mutations | n/a | 3848 |  |  |
| JS heap after GC MB | n/a | 18.7 (18.7-18.8) |  |  |
| measured window ms | n/a | 14400 (14228-14590) |  |  |
| frames to reach the bottom | n/a | 731 |  |  |

## 5. Switch chat folders x10

10 folder switches (slide animation each, 200 ms rest between).

- **dd: n/a** - no folder tabs are rendered

| metric | dd | tt | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | n/a | 4 (3-4) |  |  |
| long tasks, total ms | n/a | 231 (185-437) |  |  |
| long task, max ms | n/a | 72 (66-121) |  |  |
| total blocking time ms | n/a | 35 (27-237) |  |  |
| longest task ms | n/a | 72.8 (66.3-120.9) |  |  |
| script ms | n/a | 488 (462-817) |  |  |
| style ms | n/a | 190 (184-239) |  |  |
| layout ms | n/a | 52 (51-75) |  |  |
| paint ms | n/a | 224 (217-320) |  |  |
| GC ms | n/a | 49 (38-55) |  |  |
| frames dropped | n/a | 9 (8-25) |  |  |
| DOM mutations | n/a | 673 |  |  |
| JS heap after GC MB | n/a | 23.4 (23.4-23.4) |  |  |
| measured window ms | n/a | 5503 (5470-5733) |  |  |

## 6. Updates during a blocking animation

A folder slide (blocking animation) starts, 20 new messages arrive during it (the first after 60 ms, then 10 ms apart); the longest task after the animation ended is the metric (the heavy-animation gating claim).

- **dd: n/a** - no folder tabs are rendered

| metric | dd | tt | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | n/a | 1 (1-4) |  |  |
| long tasks, total ms | n/a | 71 (66-257) |  |  |
| long task, max ms | n/a | 71 (66-92) |  |  |
| total blocking time ms | n/a | 21 (16-57) |  |  |
| longest task ms | n/a | 71.5 (66.4-92.4) |  |  |
| script ms | n/a | 382 (365-521) |  |  |
| style ms | n/a | 51 (47-56) |  |  |
| layout ms | n/a | 11 (10-14) |  |  |
| paint ms | n/a | 72 (62-77) |  |  |
| GC ms | n/a | 28 (27-121) |  |  |
| frames dropped | n/a | 6 (6-16) |  |  |
| DOM mutations | n/a | 735 (735-911) |  |  |
| JS heap after GC MB | n/a | 17.2 (17.2-17.3) |  |  |
| measured window ms | n/a | 2344 (2328-2809) |  |  |
| longest task after the animation ended ms | n/a | 46.2 (43.5-55.8) |  |  |
| long tasks after the animation ended ms | n/a | 0 (0-55) |  |  |
| frames dropped during the animation | n/a | 4 (4-14) |  |  |

## Metrics

| metric | source | "~" below |
| --- | --- | ---: |
| long tasks | PerformanceObserver longtask (>= 50 ms) | 1 |
| long tasks, total | sum of long-task durations | 20 ms |
| long task, max | longest long task (0 = none) | 20 ms |
| total blocking time | sum of (long task - 50 ms) | 20 ms |
| longest task | trace: main-thread task, any length | 10 ms |
| script | trace: self time of script events | 30 ms |
| style | trace: UpdateLayoutTree / stylesheet parse | 10 ms |
| layout | trace: Layout | 10 ms |
| paint | trace: Paint / PrePaint / Layerize / Commit | 10 ms |
| GC | trace: V8 GC on the main thread | 10 ms |
| frames dropped | rAF gaps > 1.5 frames (60 Hz) | 4 |
| DOM mutations | MutationObserver records | 30 |
| JS heap after GC | Runtime.getHeapUsage after 2x collectGarbage | 0.5 MB |
| time to first chat row | cold start: navigation to the ready selector | 30 ms |
| measured window | wall time of the window (information) | 0 ms |
| longest task after the animation ended | trace: tasks starting after the animation end | 10 ms |
| long tasks after the animation ended | sum of long tasks after the animation end | 20 ms |
| frames dropped during the animation | rAF gaps until the animation end | 3 |
| frames to reach the bottom | scroll steps (fewer = the scroll finished sooner) | 0 |
