# StoreKit QA Summary

Status: FAIL

## Totals

- Passed: 19
- Failed: 3
- Skipped: 0

## Failed tests

- **02-auth-admin.spec.js > Store admin end-to-end QA > admin route /admin loads**: Error: Fatal console/page runtime errors

[2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

[32m- Expected  -  1[39m
[31m+ Received  + 12[39m

[32m- Array [][39m
[31m+ Array [[39m
[31m+   Object {[39m
[31m+     "text": "Failed to load resource: the server responded with a status of 404 (Not Found)",[39m
[31m+     "type": "error",[39m
[31m+     "url": "http://localhost:3000/admin",[39m
[31m+   },[39m
[31m+   Object {[39m
[31m+     "text": "Failed to load resource: the server responded with a status of 404 (Not Found)",[39m
[31m+     "type": "error",[39m
[31m+     "url": "http://localhost:3000/admin",[39m
[31m+   },[39m
[31m+ ][39m

[90m   at [39m../src/helpers.js:80

[0m [90m 78 |[39m   )[33m;[39m
 [90m 79 |[39m   [36mconst[39m apiFailures [33m=[39m watcher[33m.[39mbadResponses[33m.[39mfilter((r) [33m=>[39m [35m/\/api\//[39m[33m.[39mtest(r[33m.[39murl) [33m&&[39m [33m![39m[[35m401[39m[33m,[39m [35m403[39m[33m,[39m [35m404[39m][33m.[39mincludes(r[33m.[39mstatus))[33m;[39m
[31m[1m>[22m[39m[90m 80 |[39m   softExpect(fatalConsole[33m,[39m [32m'Fatal console/page runtime errors'[39m)[33m.[39mtoEqual([])[33m;[39m
 [90m    |[39m                                                                 [31m[1m^[22m[39m
 [90m 81 |[39m   softExpect(apiFailures[33m,[39m [32m'API 5xx or unexpected hard failures'[39m)[33m.[39mtoEqual([])[33m;[39m
 [90m 82 |[39m }
 [90m 83 |[39m[0m
[2m    at assertNoFatalRuntimeIssues (/Users/vikasithaherath/Downloads/storekit/qa-bot/src/helpers.js:80:65)[22m
[2m    at /Users/vikasithaherath/Downloads/storekit/qa-bot/tests/02-auth-admin.spec.js:36:13[22m
- **02-auth-admin.spec.js > Store admin end-to-end QA > admin route /admin/orders loads**: Error: Fatal console/page runtime errors

[2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

[32m- Expected  -  1[39m
[31m+ Received  + 12[39m

[32m- Array [][39m
[31m+ Array [[39m
[31m+   Object {[39m
[31m+     "text": "Failed to load resource: the server responded with a status of 404 (Not Found)",[39m
[31m+     "type": "error",[39m
[31m+     "url": "http://localhost:3000/admin/orders",[39m
[31m+   },[39m
[31m+   Object {[39m
[31m+     "text": "Failed to load resource: the server responded with a status of 404 (Not Found)",[39m
[31m+     "type": "error",[39m
[31m+     "url": "http://localhost:3000/admin/orders",[39m
[31m+   },[39m
[31m+ ][39m

[90m   at [39m../src/helpers.js:80

[0m [90m 78 |[39m   )[33m;[39m
 [90m 79 |[39m   [36mconst[39m apiFailures [33m=[39m watcher[33m.[39mbadResponses[33m.[39mfilter((r) [33m=>[39m [35m/\/api\//[39m[33m.[39mtest(r[33m.[39murl) [33m&&[39m [33m![39m[[35m401[39m[33m,[39m [35m403[39m[33m,[39m [35m404[39m][33m.[39mincludes(r[33m.[39mstatus))[33m;[39m
[31m[1m>[22m[39m[90m 80 |[39m   softExpect(fatalConsole[33m,[39m [32m'Fatal console/page runtime errors'[39m)[33m.[39mtoEqual([])[33m;[39m
 [90m    |[39m                                                                 [31m[1m^[22m[39m
 [90m 81 |[39m   softExpect(apiFailures[33m,[39m [32m'API 5xx or unexpected hard failures'[39m)[33m.[39mtoEqual([])[33m;[39m
 [90m 82 |[39m }
 [90m 83 |[39m[0m
[2m    at assertNoFatalRuntimeIssues (/Users/vikasithaherath/Downloads/storekit/qa-bot/src/helpers.js:80:65)[22m
[2m    at /Users/vikasithaherath/Downloads/storekit/qa-bot/tests/02-auth-admin.spec.js:36:13[22m
- **03-superadmin.spec.js > Super admin end-to-end QA > super admin login and dashboard load**: Error: Fatal console/page runtime errors

[2mexpect([22m[31mreceived[39m[2m).[22mtoEqual[2m([22m[32mexpected[39m[2m) // deep equality[22m

[32m- Expected  - 1[39m
[31m+ Received  + 7[39m

[32m- Array [][39m
[31m+ Array [[39m
[31m+   Object {[39m
[31m+     "text": "Failed to load resource: the server responded with a status of 429 (Too Many Requests)",[39m
[31m+     "type": "error",[39m
[31m+     "url": "http://localhost:3000/superadmin/login",[39m
[31m+   },[39m
[31m+ ][39m

[90m   at [39m../src/helpers.js:80

[0m [90m 78 |[39m   )[33m;[39m
 [90m 79 |[39m   [36mconst[39m apiFailures [33m=[39m watcher[33m.[39mbadResponses[33m.[39mfilter((r) [33m=>[39m [35m/\/api\//[39m[33m.[39mtest(r[33m.[39murl) [33m&&[39m [33m![39m[[35m401[39m[33m,[39m [35m403[39m[33m,[39m [35m404[39m][33m.[39mincludes(r[33m.[39mstatus))[33m;[39m
[31m[1m>[22m[39m[90m 80 |[39m   softExpect(fatalConsole[33m,[39m [32m'Fatal console/page runtime errors'[39m)[33m.[39mtoEqual([])[33m;[39m
 [90m    |[39m                                                                 [31m[1m^[22m[39m
 [90m 81 |[39m   softExpect(apiFailures[33m,[39m [32m'API 5xx or unexpected hard failures'[39m)[33m.[39mtoEqual([])[33m;[39m
 [90m 82 |[39m }
 [90m 83 |[39m[0m
[2m    at assertNoFatalRuntimeIssues (/Users/vikasithaherath/Downloads/storekit/qa-bot/src/helpers.js:80:65)[22m
[2m    at /Users/vikasithaherath/Downloads/storekit/qa-bot/tests/03-superadmin.spec.js:17:11[22m

## Next steps

1. Open `qa-bot/reports/playwright-html/index.html` for screenshots, traces, and videos.
2. Check runtime JSON files for API 4xx/5xx, console errors, and failed network requests.
3. Fix the highest severity defects and rerun `npm run qa`.
