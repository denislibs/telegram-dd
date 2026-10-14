# Performance comparison: tt vs tt (A/A noise check)

Generated 2026-10-14T17:23:13.261Z. 5 runs per app and scenario, interleaved, CPU throttling x4, trace on.

| | |
| --- | --- |
| tt-a | telegram-tt copy tt@090e38f (reused build 66dcdfe) |
| tt-b | telegram-tt copy tt@090e38f (reused build 66dcdfe) |
| machine | Apple M1 Pro, 10 cores, 16 GB, darwin 25.5.0 |
| software | node v24.3.0, Chromium 156.0.8078.4 (headless) |
| load (`uptime`) before | 22:12  up 2 days, 2 hrs, 1 user, load averages: 5.96 8.80 9.79 |
| load (`uptime`) after | 22:23  up 2 days,  2:11, 1 user, load averages: 11.50 12.73 11.52 |
| 1-min load average at the start of runs | min 6.1, median 11.7, max 19.4 |

Ratio = tt-a / tt-b of the medians; below 1 means tt-a is cheaper. "better" / "worse" mean more than 10% apart, "~" within 10%. Min-max over the runs is in brackets.

## A/A noise of the method

Both sides are the same app (telegram-tt). Over 100 comparable metrics, |ratio - 1| has median 3%, p90 22%, max 213%; over the 78 that are well above their resolution floor (4x the "~" threshold) median 2%, p90 14%, max 56%. Run-to-run spread of one side (relative MAD): median 4%, p90 17%, max 48%.

Widest ratios:

- folders / tbtMs: 3.13x
- heavy-animation / postReleaseMaxTaskMs: 1.93x
- folders / longTaskMaxMs: 1.56x
- folders / maxTaskMs: 1.56x
- heavy-animation / droppedFrames: 1.50x
- folders / droppedFrames: 1.38x

## App shell boot

Cold start until `#Main` (the logged-in shell) is rendered, plus 1.5 s. Works before the chat list is ported.


| metric | tt-a | tt-b | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | 7 (7-8) | 7 (7-8) | 1.00x | ~ |
| long tasks, total ms | 910 (859-1100) | 964 (870-1140) | 0.94x | ~ |
| long task, max ms | 297 (291-317) | 303 (287-328) | 0.98x | ~ |
| total blocking time ms | 560 (509-700) | 614 (520-740) | 0.91x | ~ |
| longest task ms | 297.2 (291.5-317.7) | 303.8 (288.0-328.3) | 0.98x | ~ |
| script ms | 1071 (1025-1208) | 1126 (1011-1253) | 0.95x | ~ |
| style ms | 95 (88-105) | 103 (96-116) | 0.93x | ~ |
| layout ms | 87 (80-104) | 88 (82-96) | 0.98x | ~ |
| paint ms | 67 (64-72) | 68 (64-70) | 0.99x | ~ |
| GC ms | 31 (27-51) | 38 (34-47) | 0.80x | ~ |
| frames dropped | 64 (58-78) | 68 (62-86) | 0.94x | ~ |
| DOM mutations | 552 | 552 | 1.00x | ~ |
| JS heap after GC MB | 14.5 (14.5-14.5) | 14.5 (14.5-15.3) | 1.00x | ~ |
| time to first chat row ms | 892 (849-999) | 918 (856-1087) | 0.97x | ~ |
| measured window ms | 2513 (2465-2664) | 2547 (2477-2800) | 0.99x |  |

## 1. Cold start to the chat list

Navigation to the first rendered chat row (1200 mocked chats, folders), plus 1.5 s of follow-up work.


| metric | tt-a | tt-b | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | 7 | 7 (7-9) | 1.00x | ~ |
| long tasks, total ms | 909 (863-1006) | 919 (871-1284) | 0.99x | ~ |
| long task, max ms | 297 (289-304) | 293 (288-323) | 1.01x | ~ |
| total blocking time ms | 559 (513-656) | 569 (521-834) | 0.98x | ~ |
| longest task ms | 297.2 (289.5-304.6) | 293.4 (288.2-323.7) | 1.01x | ~ |
| script ms | 1115 (1034-1189) | 1085 (1040-1302) | 1.03x | ~ |
| style ms | 105 (99-116) | 105 (98-129) | 1.00x | ~ |
| layout ms | 88 (79-93) | 81 (76-112) | 1.08x | ~ |
| paint ms | 81 (72-90) | 76 (71-89) | 1.07x | ~ |
| GC ms | 33 (28-37) | 35 (31-48) | 0.94x | ~ |
| frames dropped | 65 (58-73) | 64 (58-87) | 1.02x | ~ |
| DOM mutations | 553 | 553 (552-553) | 1.00x | ~ |
| JS heap after GC MB | 14.6 (14.6-14.7) | 14.6 (14.6-14.6) | 1.00x | ~ |
| time to first chat row ms | 1700 (1535-1787) | 1727 (1422-2054) | 0.98x | ~ |
| measured window ms | 3321 (3177-3375) | 3302 (2930-3631) | 1.01x |  |

## 2a. New messages, burst of 20

20 new messages in chats 9-28 of the list delivered in one task; each chat moves to the top.


| metric | tt-a | tt-b | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | 2 (1-2) | 2 (2-3) | 1.00x | ~ |
| long tasks, total ms | 219 (165-241) | 223 (212-391) | 0.98x | ~ |
| long task, max ms | 168 (163-182) | 171 (161-239) | 0.98x | ~ |
| total blocking time ms | 119 (115-141) | 123 (112-241) | 0.97x | ~ |
| longest task ms | 168.2 (163.4-182.6) | 171.5 (161.6-239.1) | 0.98x | ~ |
| script ms | 276 (256-295) | 280 (260-375) | 0.98x | ~ |
| style ms | 47 (43-51) | 52 (45-79) | 0.91x | ~ |
| layout ms | 11 (10-12) | 12 (10-50) | 0.99x | ~ |
| paint ms | 75 (73-79) | 79 (75-107) | 0.96x | ~ |
| GC ms | 22 (20-26) | 26 (23-30) | 0.88x | ~ |
| frames dropped | 12 (11-15) | 12 (12-23) | 1.00x | ~ |
| DOM mutations | 511 | 511 | 1.00x | ~ |
| JS heap after GC MB | 14.9 (14.9-15.0) | 14.9 (14.9-14.9) | 1.00x | ~ |
| measured window ms | 2014 (2003-2024) | 2012 (2002-2116) | 1.00x |  |

## 2b. New messages, one by one

20 new messages in chats 9-28, one per task, 100 ms apart; each chat moves to the top.


| metric | tt-a | tt-b | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | 0 | 0 | 1.00x |  |
| long tasks, total ms | 0 | 0 | 1.00x |  |
| long task, max ms | 0 | 0 | 1.00x |  |
| total blocking time ms | 0 | 0 | 1.00x |  |
| longest task ms | 37.1 (35.2-45.5) | 36.2 (31.3-43.0) | 1.02x | ~ |
| script ms | 595 (567-703) | 618 (578-656) | 0.96x | ~ |
| style ms | 142 (132-159) | 130 (125-151) | 1.09x | ~ |
| layout ms | 38 (34-45) | 38 (32-41) | 1.01x | ~ |
| paint ms | 252 (249-286) | 260 (256-261) | 0.97x | ~ |
| GC ms | 49 (44-56) | 48 (43-49) | 1.03x | ~ |
| frames dropped | 5 (3-8) | 5 (3-6) | 1.00x | ~ |
| DOM mutations | 1227 (1222-1232) | 1227 | 1.00x | ~ |
| JS heap after GC MB | 15.2 (15.2-15.2) | 15.2 (15.2-15.2) | 1.00x | ~ |
| measured window ms | 3625 (3564-3674) | 3578 (3568-3624) | 1.01x |  |

## 3. Typing / online storm

100 updates per second for 3 s: typing indicators and online/offline flips of the top private chats.


| metric | tt-a | tt-b | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | 0 | 0 | 1.00x |  |
| long tasks, total ms | 0 | 0 | 1.00x |  |
| long task, max ms | 0 | 0 | 1.00x |  |
| total blocking time ms | 0 | 0 | 1.00x |  |
| longest task ms | 10.2 (8.6-13.2) | 10.1 (8.2-28.7) | 1.01x | ~ |
| script ms | 1144 (1083-1240) | 1119 (1089-1283) | 1.02x | ~ |
| style ms | 119 (111-129) | 110 (96-132) | 1.08x | ~ |
| layout ms | 5 (4-6) | 6 (5-7) | 0.94x | ~ |
| paint ms | 176 (175-195) | 178 (173-212) | 0.99x | ~ |
| GC ms | 55 (50-58) | 56 (48-63) | 0.99x | ~ |
| frames dropped | 0 | 0 (0-3) | 1.00x |  |
| DOM mutations | 68 | 68 | 1.00x | ~ |
| JS heap after GC MB | 19.3 (19.3-19.3) | 19.3 (19.3-19.3) | 1.00x | ~ |
| measured window ms | 4319 (4313-4321) | 4315 (4310-4354) | 1.00x |  |

## 4. Scroll the chat list

Scroll the 1200-chat list from the top to the bottom, 120 px per frame (the list pages in as it goes).


| metric | tt-a | tt-b | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | 23 (18-28) | 24 (20-42) | 0.96x | ~ |
| long tasks, total ms | 1425 (1181-2090) | 1622 (1297-3054) | 0.88x | better |
| long task, max ms | 115 (114-133) | 129 (113-145) | 0.89x | ~ |
| total blocking time ms | 281 (221-690) | 422 (297-954) | 0.67x | better |
| longest task ms | 115.7 (113.7-133.1) | 128.9 (113.4-145.6) | 0.90x | better |
| script ms | 2378 (2369-2752) | 2498 (2375-3174) | 0.95x | ~ |
| style ms | 417 (411-474) | 439 (422-499) | 0.95x | ~ |
| layout ms | 262 (247-273) | 258 (250-327) | 1.01x | ~ |
| paint ms | 553 (522-574) | 556 (543-649) | 1.00x | ~ |
| GC ms | 211 (204-243) | 226 (182-266) | 0.93x | ~ |
| frames dropped | 85 (80-123) | 91 (84-139) | 0.93x | ~ |
| DOM mutations | 3848 | 3848 | 1.00x | ~ |
| JS heap after GC MB | 18.7 (18.6-18.8) | 18.7 (18.7-18.7) | 1.00x | ~ |
| measured window ms | 14446 (14336-15054) | 14538 (14400-15405) | 0.99x |  |
| frames to reach the bottom | 731 | 731 (730-731) | 1.00x |  |

## 5. Switch chat folders x10

10 folder switches (slide animation each, 200 ms rest between).


| metric | tt-a | tt-b | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | 4 (3-4) | 4 | 1.00x | ~ |
| long tasks, total ms | 315 (270-441) | 247 (226-386) | 1.28x | worse |
| long task, max ms | 117 (94-147) | 75 (64-149) | 1.56x | worse |
| total blocking time ms | 147 (70-241) | 47 (26-186) | 3.13x | worse |
| longest task ms | 117.3 (93.7-147.1) | 75.4 (64.0-149.7) | 1.56x | worse |
| script ms | 628 (513-829) | 523 (490-624) | 1.20x | worse |
| style ms | 206 (195-236) | 211 (177-216) | 0.98x | ~ |
| layout ms | 62 (53-81) | 64 (51-79) | 0.97x | ~ |
| paint ms | 265 (243-284) | 240 (234-275) | 1.10x | worse |
| GC ms | 52 (45-55) | 44 (41-55) | 1.17x | ~ |
| frames dropped | 18 (11-25) | 13 (9-21) | 1.38x | worse |
| DOM mutations | 673 | 673 | 1.00x | ~ |
| JS heap after GC MB | 23.4 (23.4-23.4) | 23.4 (23.4-23.4) | 1.00x | ~ |
| measured window ms | 5572 (5458-5628) | 5514 (5469-5582) | 1.01x |  |

## 6. Updates during a blocking animation

A folder slide (blocking animation) starts, 20 new messages arrive during it (the first after 60 ms, then 10 ms apart); the longest task after the animation ended is the metric (the heavy-animation gating claim).


| metric | tt-a | tt-b | ratio | |
| --- | ---: | ---: | ---: | :-- |
| long tasks | 1 (1-2) | 1 (1-2) | 1.00x | ~ |
| long tasks, total ms | 102 (62-142) | 83 (67-169) | 1.23x | ~ |
| long task, max ms | 92 (62-105) | 83 (67-103) | 1.11x | ~ |
| total blocking time ms | 42 (12-55) | 33 (17-69) | 1.27x | ~ |
| longest task ms | 92.0 (62.5-105.5) | 83.0 (67.0-102.9) | 1.11x | ~ |
| script ms | 461 (348-473) | 378 (363-507) | 1.22x | worse |
| style ms | 63 (46-65) | 53 (41-67) | 1.21x | worse |
| layout ms | 13 (9-16) | 12 (12-17) | 1.07x | ~ |
| paint ms | 81 (67-87) | 76 (63-94) | 1.07x | ~ |
| GC ms | 27 (25-32) | 27 (23-30) | 1.00x | ~ |
| frames dropped | 9 (5-10) | 6 (5-11) | 1.50x | ~ |
| DOM mutations | 735 | 735 | 1.00x | ~ |
| JS heap after GC MB | 17.2 (17.2-17.3) | 17.2 (17.2-17.2) | 1.00x | ~ |
| measured window ms | 2483 (2285-2540) | 2387 (2334-2578) | 1.04x |  |
| longest task after the animation ended ms | 42.3 (15.6-49.6) | 21.9 (15.3-45.4) | 1.93x | worse |
| long tasks after the animation ended ms | 0 (0-50) | 0 | 1.00x |  |
| frames dropped during the animation | 7 (3-10) | 6 (4-11) | 1.17x | ~ |

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
