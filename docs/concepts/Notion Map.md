---
title: Notion Map
tags: [concept, assessment]
---

# Notion Map

View of mastery per [[Notion]], built from [[Attempt]]s. Part of the [[Dashboard]].

## Related

- Built from [[Attempt]]s
- Shown in the [[Dashboard]]

## In code

`notionMap` of the Dashboard read model (`notionMapTopic` and `notionTrend` in `src/main/dashboard/model.ts`, `NotionMapTopic` and `NotionMapCell` in `src/shared/dashboard.ts`): per notion its latest score, scores by round, attempts, last practiced, trend and mastered flag against the current [[Mastery Threshold]]. Heat grid `src/renderer/src/dashboard/NotionMap.tsx`. See [[Dashboard Implementation#Notion Map]].
