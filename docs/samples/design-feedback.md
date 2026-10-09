---
title: Sample design feedback
tags: [sample, prompts, design-practice]
generated: 2026-10-09
prompt-versions: [design-step-feedback-1, design-hint-1]
---

# Sample design feedback

Raw output of `scripts/design-feedback-check.ts` (real CLI, `--model sonnet --effort low`, 2 calls) on the dev fixture exercise (Pastebin Reference Solution, exercise 1). See [[Interview Protocol Implementation]] for the review.

## Problem statement

Design a service like Pastebin.com (or Bit.ly): anyone can paste a block of text and get a short random link to share it; whoever opens the link sees the text.

## Submission (functional requirements, mediocre on purpose)

```text
- L'utilisateur colle du texte et reçoit un lien
- Avec le lien on peut voir le texte
- Il faut que ce soit rapide et scalable
- On utilise des microservices et une base NoSQL
```

## Step feedback (8.0 s, prompt design-step-feedback-1)

- Summary: Tu as bien identifié les deux actions centrales : créer un lien et lire le texte. Mais le reste du périmètre manque : hors-périmètre, questions et hypothèses. Et tu mélanges des choix techniques dans une étape qui n'en demande pas.

- actors: **partial**. Tu parles de « l'utilisateur » qui colle du texte et ouvre le lien, mais tu ne distingues pas qui crée et qui lit, ni s'il est anonyme.

- core-use-cases: **partial**. Les deux actions (coller du texte → recevoir un lien, ouvrir le lien → voir le texte) sont les bonnes, mais il manque les entrées/sorties précises et le cas d'un lien inconnu.

- out-of-scope: **missing**. Tu n'écris rien sur ce qui est hors périmètre (comptes, modification, lien personnalisé, etc.).

- clarifying-questions: **missing**. Aucune question ni hypothèse : expiration, anonymat, analytics, taille du texte, volume de trafic ne sont pas abordés.

- Gaps: Tu ne dis pas si l'utilisateur doit avoir un compte ou peut rester anonyme. / Tu ne dis pas ce qui se passe si le lien n'existe pas ou si le texte a expiré. / Tu ne précises pas ce qui est hors périmètre : que veux-tu explicitement ne pas faire ? / Tu ne poses aucune question sur l'expiration, les statistiques de visites, la taille maximale d'un texte ou le volume attendu.

- Errors: « Microservices et base NoSQL » sont des choix de conception (design), pas des besoins fonctionnels : ils appartiennent à une étape ultérieure. / « Rapide et scalable » est trop vague : c'est une contrainte non fonctionnelle, sans chiffre ni exemple (par exemple : combien de lectures par seconde ?).

- Forgotten trade-offs: Le lien expire-t-il ou reste-t-il pour toujours ? Garder tous les textes coûte du stockage, mais supprimer risque de casser des liens déjà partagés.

- Next step: Réécris en quatre blocs : utilisateurs, cas d'usage (entrée → sortie), hors périmètre, questions/hypothèses. Retire les choix techniques pour l'étape suivante.

## Level 3 Hint (6.8 s, prompt design-hint-1)

> « Rapide », « scalable », « microservices » et « NoSQL » sont déjà des choix de design, pas du scope. Ajoute une partie « hors scope » : une courte liste de fonctionnalités que tu choisis de ne PAS traiter (par exemple les comptes utilisateurs ou la modification d'un paste). Ajoute aussi une ou deux hypothèses de comportement, comme « un paste peut-il expirer ? » ou « l'utilisateur est-il anonyme ? », avec la réponse que tu retiens.
