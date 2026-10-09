---
title: Sample Design Exercises feedback
tags: [sample, prompts, design-practice]
generated: 2026-10-09
prompt-versions: [design-step-feedback-3, design-step-feedback-4]
---

# Sample Design Exercises feedback

Raw output of `scripts/design-exercises-check.ts` (real CLI, `--model sonnet --effort low`, 6 calls) on the first two [[Design Exercises]]: the step feedback of a mediocre functional requirements submission, with the leak guard. See [[Design Exercises#Quality review]] for the review.

## Leak metric

Reference terms named by the feedback but absent from the submission, statement and title (curated terms, see [[Interview Protocol Implementation#Leak guard]]).

Before (prompt version 3, no guard, the run below of 2026-10-09, metric computed offline on its text, Hints left out): Pastebin **6/10** (anonymous users, custom short link, deleting expired pastes, editing, expiration, user accounts), Twitter **9/11** (analytics, fan-out to followers, firehose and streams, high availability, home timeline, keyword search, push notifications, user timeline, visibility settings). The level 1 Hints: Pastebin 1/10 (expiration), Twitter 0/11.

After (prompt version 4 and the leak guard). "Each CLI output" is the first output, then the retry when there was one:

| Run | Exercise | Each CLI output | Stored feedback | Calls |
|---|---|---|---|---|
| 1 | pastebin | 4/10 (anonymous users, expiration, page analytics, user accounts (out of scope)) then 0/10 (none) | 0/10 (none) | 2 |
| 2 | twitter | 2/11 (high availability, user timeline) then 0/11 (none) | 0/11 (none) | 2 |
| 3 | twitter | 3/11 (high availability, home timeline, user timeline) then 0/11 (none) | 0/11 (none) | 2 |

## Run 1: exercise 1, Design Pastebin.com (or Bit.ly)

Problem statement shown to the learner:

> Tu conçois un service web de partage de texte comme Pastebin.com : on y dépose du texte (du code, des logs, une note) pour le partager avec d'autres personnes grâce à un lien. Bit.ly, qui raccourcit des URL, est un problème très proche. Avant de dessiner quoi que ce soit, cadre ce que le service doit faire, et ce qu'il ne fera pas.

Submission (functional requirements, mediocre on purpose):

```text
- L'utilisateur colle du texte et obtient un lien
- On peut ouvrir le lien pour lire le texte
- Le site doit être rapide
- On stocke tout dans une base de données
```

### Step feedback (15.6 s, 2 CLI call(s))

Leak check stored with the feedback: `{"firstLeaked":["anonymous users","expiration","page analytics","user accounts (out of scope)"],"retried":true,"remaining":[]}`

- Summary: Tes deux premiers points forment un bon noyau : déposer du texte pour obtenir un lien, puis lire le texte via ce lien. Il manque l'essentiel du cadrage : le hors périmètre et les hypothèses. Deux de tes lignes sont aussi des choix techniques, pas des besoins fonctionnels.
- actors: **partial**. Tu parles de « l'utilisateur » qui colle et de « on » qui ouvre le lien, mais tu ne distingues pas clairement les acteurs ni leurs rôles.
- core-use-cases: **partial**. Les deux premières lignes (coller du texte → obtenir un lien, ouvrir le lien → lire le texte) sont de bons cas d'usage testables, mais il n'y en a que deux et ils restent très basiques.
- out-of-scope: **missing**. Tu n'écris rien sur ce que le service ne fera pas, donc le périmètre reste ouvert.
- clarifying-questions: **missing**. Aucune question ni hypothèse : tu ne dis rien sur les cas limites, sur qui peut faire quoi, ni sur ce que deviennent les données avec le temps.
- Gaps: Tu ne dis pas ce qui est hors périmètre : liste ce que tu choisis de ne pas faire pour garder un design réaliste. / Pense aux autres acteurs : qui d'autre que celui qui colle le texte agit ou interagit avec le système ? / Pense aux cas limites de tes cas d'usage : que se passe-t-il si le lien est inconnu, ou si le texte est très long ? / Tu ne dis pas ce que deviennent les données dans la durée : sont-elles gardées toujours, ou le service fait-il un travail de fond ?
- Errors: « Le site doit être rapide » n'est pas un cas d'usage : c'est une exigence de qualité (non fonctionnelle), vague et sans chiffre. Elle appartient à une autre étape. / « On stocke tout dans une base de données » est un choix de solution, pas un besoin. Au stade du cadrage, on décrit ce que fait le service, pas comment.
- Forgotten trade-offs: none
- Next step: Réécris ta liste en trois blocs : acteurs, cas d'usage (entrée → sortie), hors périmètre. Ajoute ensuite 3 ou 4 hypothèses sous forme de questions que tu poserais à l'interviewer.

## Run 2: exercise 2, Design the Twitter timeline and search

Problem statement shown to the learner:

> Tu conçois le cœur d'un réseau social comme Twitter : chacun y publie des messages courts et suit d'autres personnes pour lire ce qu'elles publient. On te demande la partie timeline et la recherche. Aucun chiffre de trafic n'est donné : pose tes propres hypothèses, estime les ordres de grandeur, puis dessine.

Submission (functional requirements, mediocre on purpose):

```text
- Un utilisateur peut poster un tweet
- Il voit les tweets des gens qu'il suit
- On peut liker et retweeter
- Il faut que ça tienne des millions d'utilisateurs
```

### Step feedback (16.8 s, 2 CLI call(s))

Leak check stored with the feedback: `{"firstLeaked":["high availability","user timeline"],"retried":true,"remaining":[]}`

- Summary: Tu as bien posé les deux actions de base : publier et lire les tweets des personnes suivies. Mais le périmètre n'est pas maîtrisé : la recherche de l'énoncé manque, il n'y a pas de hors périmètre ni d'hypothèses. Priorité : délimiter ce que tu fais et ce que tu ne fais pas.
- actors: **partial**. Tu parles d'« un utilisateur » qui poste et lit, mais tu ne distingues pas les autres acteurs ni les façons d'utiliser le système.
- core-use-cases: **partial**. « Poster un tweet » et « voir les tweets des gens qu'il suit » sont de bons cas d'usage, mais la recherche, demandée dans l'énoncé, n'apparaît pas et les entrées/sorties ne sont pas précisées.
- out-of-scope: **missing**. Tu n'écris aucune section « hors périmètre » ; liker et retweeter agrandissent le périmètre au lieu de le réduire.
- clarifying-questions: **missing**. Aucune question ni hypothèse : pas de cas limites, pas de règles sur qui peut faire quoi, rien sur la vie des données dans le temps.
- Gaps: Tu ne dis pas ce qui est hors périmètre, alors que le temps d'un entretien est court. / Tu ne couvres pas toute la demande de l'énoncé : relis-le et vérifie que chaque partie demandée a un cas d'usage. / Tu ne précises pas les entrées et sorties de chaque action (que fournit l'utilisateur, que reçoit-il ?). / Pense aux cas limites de tes cas d'usage et à qui d'autre que l'utilisateur agit sur le système.
- Errors: « Il faut que ça tienne des millions d'utilisateurs » est une contrainte de charge (non fonctionnelle), pas un cas d'usage ; elle appartient à une autre étape ou à une section séparée. / Liker et retweeter sont ajoutés sans justification : sans les marquer comme optionnels ou hors périmètre, tu élargis le problème.
- Forgotten trade-offs: Ajouter des fonctions comme liker et retweeter enrichit le produit mais alourdit la conception ; tu ne dis pas pourquoi tu les gardes.
- Next step: Réécris ta liste en trois blocs : acteurs, cas d'usage (avec entrée et sortie), hors périmètre. Ajoute ensuite 2 ou 3 hypothèses ou questions à l'interviewer.

## Run 3: exercise 2, Design the Twitter timeline and search

Problem statement shown to the learner:

> Tu conçois le cœur d'un réseau social comme Twitter : chacun y publie des messages courts et suit d'autres personnes pour lire ce qu'elles publient. On te demande la partie timeline et la recherche. Aucun chiffre de trafic n'est donné : pose tes propres hypothèses, estime les ordres de grandeur, puis dessine.

Submission (functional requirements, mediocre on purpose):

```text
- Un utilisateur peut poster un tweet
- Il voit les tweets des gens qu'il suit
- On peut liker et retweeter
- Il faut que ça tienne des millions d'utilisateurs
```

### Step feedback (21.4 s, 2 CLI call(s))

Leak check stored with the feedback: `{"firstLeaked":["high availability","home timeline","user timeline"],"retried":true,"remaining":[]}`

- Summary: Tu as deux actions de base bien formulées (poster, lire ce que suivent les gens). Mais le périmètre n'est pas posé : pas de hors périmètre, pas d'hypothèses, et ton dernier point est une contrainte de charge, pas un cas d'usage.
- actors: **partial**. Tu parles de « un utilisateur » qui poste et lit, mais tu ne distingues pas d'autres acteurs (services internes, rôles) ni leur façon d'utiliser le système.
- core-use-cases: **partial**. « Poster un tweet » et « voir les tweets des gens qu'il suit » sont des actions claires, mais sans entrées ni sorties précises, et la recherche de l'énoncé n'apparaît pas.
- out-of-scope: **missing**. Tu n'écris rien sur ce qui est hors périmètre ; liker et retweeter agrandissent même le périmètre sans justification.
- clarifying-questions: **missing**. Aucune question ni hypothèse : ni cas limites, ni qui peut faire quoi, ni ce que deviennent les données avec le temps.
- Gaps: Tu ne dis pas ce qui est hors périmètre : choisis ce que tu laisses de côté pour tenir dans le temps. / Tu ne précises pas les entrées et sorties de chaque action (que fournit l'utilisateur, que reçoit-il en retour). / Pense aux cas limites de tes cas d'usage : liste vide, liste très longue, contenu qui disparaît. / Qui d'autre que l'utilisateur agit sur le système ? Tu ne poses aucune question à l'interviewer.
- Errors: « Il faut que ça tienne des millions d'utilisateurs » n'est pas un cas d'usage : c'est une exigence de capacité, à préciser plus tard avec des estimations. / Liker et retweeter ne sont pas demandés par l'énoncé, qui parle de timeline et de recherche ; sans justification, tu élargis le périmètre.
- Forgotten trade-offs: none
- Next step: Réécris ta liste en trois blocs : acteurs, cas d'usage (action, entrée, sortie), hors périmètre. Ajoute 3 ou 4 questions ou hypothèses sur les cas limites et la durée de vie des données.

## Before: prompt version 3 (4 calls, no leak guard)

### Exercise 1: Design Pastebin.com (or Bit.ly)

Problem statement shown to the learner:

> Tu conçois un service web de partage de texte comme Pastebin.com : on y dépose du texte (du code, des logs, une note) pour le partager avec d'autres personnes grâce à un lien. Bit.ly, qui raccourcit des URL, est un problème très proche. Avant de dessiner quoi que ce soit, cadre ce que le service doit faire, et ce qu'il ne fera pas.

Submission (functional requirements, mediocre on purpose):

```text
- L'utilisateur colle du texte et obtient un lien
- On peut ouvrir le lien pour lire le texte
- Le site doit être rapide
- On stocke tout dans une base de données
```

#### Step feedback (8.8 s)

- Summary: Tu as les deux cas d'usage de base, clairement formulés. Mais ton cadrage s'arrête là : il manque les acteurs précisés, le hors périmètre et les hypothèses. Deux de tes lignes (« rapide », « base de données ») ne sont pas des fonctionnalités.
- actors: **partial**. Tu parles d'« utilisateur » qui colle et lit, mais tu ne précises pas s'il est anonyme ou connecté, ni s'il existe d'autres acteurs (par exemple le service lui-même).
- core-use-cases: **met**. « Coller du texte et obtenir un lien » et « ouvrir le lien pour lire » sont deux actions courtes, avec entrée et sortie claires.
- out-of-scope: **missing**. Tu ne dis rien de ce qui est exclu (comptes, édition, lien personnalisé, etc.), donc le périmètre reste flou.
- clarifying-questions: **missing**. Aucune question ni hypothèse : rien sur la durée de vie des textes, la taille maximale, ou ce qui se passe si le lien n'existe pas.
- Gaps: Tu ne dis pas qui est l'utilisateur : anonyme ? avec un compte ? Et le service a-t-il lui-même des tâches ? / Tu ne dis pas ce qui est hors périmètre : que laisses-tu volontairement de côté pour rester dans le temps ? / Tu ne dis pas ce qui arrive aux textes avec le temps : restent-ils pour toujours, ou peuvent-ils expirer ? / Tu ne poses aucune question de cadrage : taille maximale du texte, lien inexistant ou expiré, qui peut lire un texte ?
- Errors: « Le site doit être rapide » est une exigence de qualité (non fonctionnelle), pas un cas d'usage ; elle est trop vague pour être testée. / « On stocke tout dans une base de données » est un choix de conception, pas une fonctionnalité : il vient plus tard, pas dans le cadrage.
- Forgotten trade-offs: Garder le périmètre petit (pas de comptes, pas d'édition) rend la conception faisable dans le temps, mais limite ce que le service offre. / Un texte qui n'expire jamais est plus simple pour l'utilisateur, mais le stockage grossit sans fin ; une expiration demande un nettoyage.
- Next step: Réécris ta liste en trois blocs : acteurs, cas d'usage (en ajoutant par exemple ce qui arrive à un texte avec le temps), hors périmètre. Ajoute 3 questions que tu poserais à l'interviewer, avec l'hypothèse que tu retiens pour chacune.

#### Hint level 1 (3.7 s)

> Tes deux premiers cas d'usage sont clairs. Mais que se passe-t-il pour un texte une fois qu'il a été déposé : reste-t-il là pour toujours, et qui décide de ça ? Et ce service, qu'est-ce que tu choisis volontairement de ne PAS faire pour rester dans le temps de l'entretien ?

### Exercise 2: Design the Twitter timeline and search

Problem statement shown to the learner:

> Tu conçois le cœur d'un réseau social comme Twitter : chacun y publie des messages courts et suit d'autres personnes pour lire ce qu'elles publient. On te demande la partie timeline et la recherche. Aucun chiffre de trafic n'est donné : pose tes propres hypothèses, estime les ordres de grandeur, puis dessine.

Submission (functional requirements, mediocre on purpose):

```text
- Un utilisateur peut poster un tweet
- Il voit les tweets des gens qu'il suit
- On peut liker et retweeter
- Il faut que ça tienne des millions d'utilisateurs
```

#### Step feedback (8.7 s)

- Summary: Tu as les deux cas d'usage de base : poster et lire la timeline des personnes suivies. Il manque la recherche, les acteurs, le hors-périmètre et les hypothèses. Commence par cadrer clairement ce que tu fais et ce que tu laisses de côté.
- actors: **partial**. Tu parles d'« un utilisateur » qui poste et lit, mais tu ne distingues pas les autres acteurs (le service qui diffuse les tweets, les notifications) ni la façon dont ils s'en servent.
- core-use-cases: **partial**. Poster un tweet et voir les tweets des gens suivis sont de bons cas d'usage, mais la recherche, qui est dans l'énoncé, manque, et les entrées/sorties ne sont pas précisées.
- out-of-scope: **missing**. Tu ne dis rien de ce qui est hors périmètre, alors que tu ajoutes like et retweet sans dire si c'est voulu.
- clarifying-questions: **missing**. Aucune question ni hypothèse : pas de limite de taille du tweet, pas de cas limite, rien sur la durée de vie des données.
- Gaps: Tu ne mentionnes pas la recherche par mots-clés, pourtant demandée dans l'énoncé. / Tu ne distingues pas la timeline d'accueil (les gens que je suis) de la timeline d'un utilisateur (ses propres tweets). / Tu ne dis pas ce qui est hors périmètre (par exemple analytics, paramètres de visibilité, flux externes). / Tu ne poses aucune hypothèse : que se passe-t-il quand un utilisateur suit beaucoup de monde ? Les tweets sont-ils gardés pour toujours ? Y a-t-il des notifications ?
- Errors: « Il faut que ça tienne des millions d'utilisateurs » n'est pas un cas d'usage fonctionnel : c'est une exigence de scalabilité. Elle sera chiffrée à l'étape des estimations. Ici, pense plutôt à la haute disponibilité comme exigence du service.
- Forgotten trade-offs: Garder like et retweet dans le périmètre ajoute du travail (compteurs, nouveaux types de tweets) : est-ce raisonnable dans le temps d'un entretien ? / Une timeline qui se met à jour tout de suite coûte plus cher qu'une timeline qui accepte un léger retard : as-tu choisi ?
- Next step: Réécris ta liste en trois blocs : acteurs, cas d'usage (poster, voir les deux timelines, rechercher) et hors périmètre. Ajoute ensuite 3 questions que tu poserais à l'interviewer, avec l'hypothèse que tu retiens pour chacune.

#### Hint level 1 (3.2 s)

> Tu as déjà posté et lu des tweets, mais l'énoncé parle aussi de recherche. Qu'est-ce qu'un utilisateur doit pouvoir faire d'autre ici, et qu'est-ce que tu choisis de laisser de côté pour que le sujet reste faisable dans le temps de l'entretien ?
