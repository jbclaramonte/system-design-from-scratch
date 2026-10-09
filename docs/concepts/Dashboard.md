---
title: Dashboard
tags: [concept, assessment]
---

# Dashboard

Screen showing mastery per notion, attempt history and weak points.

## Related

- Includes the [[Notion Map]]
- Reads [[Attempt]]s
- Lists [[Weak Point]]s

## In code

Read model `src/main/dashboard/` (`loadDashboardSnapshot` in `queries.ts`, pure `buildDashboard` in `model.ts`), channel `dashboard:get` (`dashboardIpc.ts`), types in `src/shared/dashboard.ts`. Screen `src/renderer/src/dashboard/DashboardScreen.tsx`, opened from the app header. See [[Dashboard Implementation]].
