---
title: Sample content for Ordres de grandeur : unités, puissances de deux et latences
tags: [sample, prompts]
topic: orders-of-magnitude
generated: 2026-10-09
prompt-versions: [notion-outline-3, lesson-2, quiz-3, remediation-lesson-3]
grounded: false
---

# Sample content for Ordres de grandeur : unités, puissances de deux et latences

Raw output of `scripts/prompt-quality-check.ts` (real CLI, `--model sonnet --effort low`). Foundations Module topic: ungrounded, no primer excerpt. See [[Foundations Module Content]] for the review.

> [!info] Automatic checks
> - Lesson citations: 0 distinct ids, unknown: []
> - Lesson notion markers in outline order: true (bits-and-bytes, data-size-units, powers-of-two, per-day-to-per-second, requests-per-second, memory-disk-network-speed, back-of-the-envelope-estimation)
> - Lesson recap section: true
> - Lesson words: 1800
> - Quiz types: single_choice, single_choice, single_choice, multiple_choice, scenario, scenario, free_answer
> - Quiz notions covered: 7/7
> - Grounded: false (lesson sources: 0)
> - Remediation: skipped
> - CLI calls: 3
> - call 1: 6.2 s, 724 output tokens
> - call 2: 31.9 s, 4453 output tokens
> - call 3: 20.9 s, 2177 output tokens

## Notion Outline

| Slug | Title | Description | Sources |
|---|---|---|---|
| `bits-and-bytes` | Bits et bytes | Tu dois comprendre qu'un bit vaut 0 ou 1, qu'un byte regroupe 8 bits et sert d'unité de base pour mesurer les données. |  |
| `data-size-units` | Unités de taille : KB, MB, GB, TB | Tu dois savoir ranger KB, MB, GB et TB par taille et associer chaque unité à un ordre de grandeur de données concret. |  |
| `powers-of-two` | Puissances de deux | Tu dois comprendre pourquoi les unités de stockage reposent sur les puissances de deux et retenir que 2^10 vaut environ mille. |  |
| `per-day-to-per-second` | Conversion par jour en par seconde | Tu dois savoir qu'un jour compte 86 400 secondes, arrondi à environ 100 000, pour convertir un volume quotidien en débit par seconde. |  |
| `requests-per-second` | Requests per second (QPS) | Tu dois comprendre que les requests per second mesurent la charge d'un système et distinguer la moyenne du pic de trafic. |  |
| `memory-disk-network-speed` | Vitesse relative : memory, disk, network | Tu dois savoir que la memory est bien plus rapide que le disk local, lui-même en général plus rapide qu'un appel réseau lointain. |  |
| `back-of-the-envelope-estimation` | Estimation back-of-the-envelope pas à pas | Tu dois savoir estimer trafic, throughput et stockage en arrondissant les nombres et en enchaînant des étapes simples de calcul. |  |

## Lesson

### Ordres de grandeur : unités, puissances de deux et latences

Quand tu conçois un système, une question revient vite : « est-ce que ça tient ? ». Il faut savoir si un serveur va supporter 100 utilisateurs ou 10 millions, et si les données tiennent sur un disque ou sur mille. C'est comme estimer à l'œil si une valise rentre dans le coffre d'une voiture : tu n'as pas besoin des centimètres exacts, seulement de l'ordre de grandeur. Cette leçon te donne les unités, les repères et les calculs simples pour faire ces estimations.

#### Bits et bytes

<!-- notion: bits-and-bytes -->

Un **bit** est la plus petite unité d'information. Il vaut soit 0, soit 1. C'est comme un interrupteur : allumé ou éteint.

Un seul bit dit très peu de choses. On les regroupe donc. Un **byte** (octet) regroupe **8 bits**. C'est l'unité de base pour mesurer les données.

Comment ça marche, pas à pas :
- 1 bit donne 2 valeurs possibles (0 ou 1).
- 8 bits donnent 2^8 = 256 combinaisons possibles.
- Avec 256 combinaisons, on peut représenter par exemple un caractère simple comme la lettre « A ».

Exemple : le mot « chat » en texte simple (ASCII, un encodage où un caractère prend 1 byte) occupe environ 4 bytes.

Quand l'utiliser : tu mesures le **stockage** (fichiers, base de données) en bytes. Tu mesures souvent la vitesse d'un réseau en bits par seconde.

Piège principal : ne confonds pas **byte** (B majuscule) et **bit** (b minuscule). Une connexion à 100 Mb/s (mégabits) transfère en simplifiant environ 12 MB (mégabytes) par seconde, car 100 divisé par 8 donne environ 12. Se tromper d'un facteur 8 peut fausser toute une estimation.

#### Unités de taille : KB, MB, GB, TB

<!-- notion: data-size-units -->

Un seul byte est minuscule. Pour parler de grandes quantités, on utilise des multiples. Chaque unité vaut en gros **mille fois** la précédente :

- **KB** (kilobyte) : environ mille bytes.
- **MB** (megabyte) : environ mille KB.
- **GB** (gigabyte) : environ mille MB.
- **TB** (terabyte) : environ mille GB.

Ordres de grandeur concrets (ils varient selon les cas) :
- Un **KB** : un court texte, comme un e-mail sans pièce jointe.
- Un **MB** : une photo compressée de qualité moyenne, ou un livre en texte.
- Un **GB** : un film en qualité standard, ou des centaines de photos.
- Un **TB** : des centaines de films, ou une grosse base de données d'une petite entreprise.

Comment s'en servir : pour estimer le stockage, tu multiplies la taille d'un élément par leur nombre. Exemple : 1 million de photos de 1 MB font environ 1 million de MB, soit environ 1 TB.

Quand l'utiliser : dès que tu dois choisir si les données tiennent sur une machine ou s'il faut en répartir sur plusieurs.

Limite : ces repères sont approximatifs. Une photo peut peser 200 KB ou 10 MB selon sa qualité. Vérifie toujours l'hypothèse de départ.

#### Puissances de deux

<!-- notion: powers-of-two -->

Un ordinateur travaille avec des bits, qui ont 2 valeurs. Les tailles et les adresses mémoire sont donc naturellement des **puissances de deux** : 2, 4, 8, 16, 32, etc. Écrire 2^n veut dire « 2 multiplié par lui-même n fois ».

Exemples :
- 2^3 = 8 (c'est le nombre de bits d'un byte).
- 2^8 = 256.
- **2^10 = 1024**, soit **environ mille**.

C'est le point clé. Comme 1024 est très proche de 1000, on a adopté les préfixes kilo, méga, giga. Ainsi :
- 2^10 vaut environ mille (KB).
- 2^20 vaut environ un million (MB).
- 2^30 vaut environ un milliard (GB).
- 2^40 vaut environ mille milliards (TB).

Comment l'utiliser : chaque fois que tu ajoutes 10 à l'exposant, tu multiplies à peu près par mille. Pour un calcul rapide, tu peux remplacer 1024 par 1000.

Exemple : un identifiant sur 32 bits permet 2^32 valeurs, soit environ 4 milliards. C'est utile pour savoir si une taille d'ID suffit.

Limite : l'écart entre 1024 et 1000 est d'environ 2,4 % pour un KB, mais il grandit à chaque niveau (environ 10 % au niveau du TB). Pour une estimation, c'est négligeable. Pour un calcul exact, ça ne l'est pas.

#### Conversion par jour en par seconde

<!-- notion: per-day-to-per-second -->

Les volumes sont souvent donnés **par jour** (« 10 millions d'utilisateurs par jour »). Mais un serveur se dimensionne sur ce qu'il doit gérer **par seconde**. Il faut donc convertir.

Un jour compte exactement **86 400 secondes** (24 × 60 × 60). Pour calculer vite, on arrondit à **environ 100 000** (10^5).

Étapes :
1. Prends le volume par jour.
2. Divise-le par 100 000.
3. Tu obtiens un ordre de grandeur par seconde.

Exemple : une boutique en ligne reçoit 10 millions de visites par jour.
- 10 000 000 / 100 000 = 100 visites par seconde.
- Avec la valeur exacte, on trouve environ 116. L'ordre de grandeur est le même.

Quand l'utiliser : au début de toute estimation, pour passer d'un chiffre « business » (par jour) à un chiffre « technique » (par seconde).

Limite : l'arrondi donne un résultat un peu plus faible que la réalité (ici, environ 14 % en dessous). C'est acceptable pour estimer, mais garde ce biais en tête. De plus, le résultat est une **moyenne** : le trafic n'est pas réparti également sur la journée, ce que la section suivante détaille.

#### Requests per second (QPS)

<!-- notion: requests-per-second -->

Une **request** (requête) est une demande envoyée à un système, par exemple « affiche la page d'accueil ». Les **requests per second**, aussi appelées **QPS** (queries per second), comptent combien de requêtes arrivent chaque seconde. C'est la mesure principale de la **charge** d'un système.

Comment ça marche :
- Tu convertis le trafic quotidien en moyenne par seconde.
- Tu obtiens le QPS **moyen**.
- Mais le trafic varie. Il y a des moments calmes (la nuit) et des moments chargés (une soirée de soldes).

Le **pic de trafic** (peak) est le maximum de charge sur une période. Une règle courante, à adapter, consiste à supposer que le pic vaut un multiple de la moyenne, par exemple 2 à 5 fois. Le bon facteur dépend du produit.

Exemple : une boutique a un QPS moyen de 100. Si on suppose un pic de 3 fois, on prévoit environ 300 requêtes par seconde.

Quand l'utiliser : pour décider combien de serveurs prévoir. Un système doit tenir le **pic**, pas seulement la moyenne.

Compromis : prévoir pour le pic coûte cher si les serveurs restent inutilisés le reste du temps. Prévoir pour la moyenne fait planter le système aux heures chargées. On cherche donc un équilibre selon le coût et le risque acceptables.

#### Vitesse relative : memory, disk, network

<!-- notion: memory-disk-network-speed -->

Un système lit des données à trois endroits principaux. Leur vitesse diffère beaucoup. On mesure ce délai avec la **latency** (le temps d'attente avant d'obtenir une réponse).

- **Memory** (la RAM) : très rapide. Ordre de grandeur de la centaine de nanosecondes pour un accès (une nanoseconde = un milliardième de seconde).
- **Disk** local : plus lent. Selon le type, de l'ordre de la dizaine à la centaine de microsecondes pour un SSD, et de l'ordre de plusieurs millisecondes pour un disque dur classique (une milliseconde = un millième de seconde).
- **Network** : un appel vers un serveur lointain prend en général de l'ordre de dizaines à centaines de millisecondes, car il faut traverser de la distance.

Ces chiffres sont des ordres de grandeur. Ils dépendent du matériel et évoluent avec le temps.

Ce qu'il faut retenir : la memory est bien plus rapide que le disk local, lui-même en général plus rapide qu'un appel réseau lointain. Chaque étage est souvent des dizaines ou des milliers de fois plus lent que le précédent.

Exemple : lire une donnée dans un **cache** (une copie gardée en memory) évite un aller-retour vers une **database** (base de données) sur le disk ou sur le réseau.

Compromis : la memory est rapide mais chère, plus petite, et elle perd ses données si la machine s'éteint. Le disk est moins cher et garde les données durablement.

#### Estimation back-of-the-envelope pas à pas

<!-- notion: back-of-the-envelope-estimation -->

L'estimation **back-of-the-envelope** (« au dos d'une enveloppe ») est un calcul rapide, avec des nombres arrondis, pour juger si une conception est réaliste. Le but n'est pas la précision, mais le bon ordre de grandeur.

Exemple : un site de partage de photos avec 10 millions d'utilisateurs actifs par jour.

1. **Hypothèse** : chaque utilisateur envoie 1 photo par jour, de 1 MB.
2. **Trafic** : 10 millions d'envois par jour. On divise par 100 000 : environ 100 requêtes par seconde en moyenne. Avec un pic supposé de 3 fois : environ 300.
3. **Throughput** (débit de données) : 100 photos par seconde × 1 MB = environ 100 MB par seconde en moyenne.
4. **Stockage** : 10 millions × 1 MB = 10 millions de MB, soit environ 10 TB par jour. Sur un an (environ 365 jours, arrondi à 400 pour simplifier), on trouve de l'ordre de 4 000 TB, soit quelques PB (petabytes, mille TB).

Conseils :
- Écris tes hypothèses, pour pouvoir les corriger.
- Arrondis sans scrupule (86 400 devient 100 000).
- Enchaîne des étapes simples plutôt qu'une grosse formule.

Limite : le résultat dépend entièrement des hypothèses. Si elles sont fausses, le calcul l'est aussi. Utilise-le pour comparer des options, pas comme une mesure exacte.

#### Récapitulatif

- **Bits et bytes** : un bit vaut 0 ou 1, et un byte regroupe 8 bits pour servir d'unité de base des données.
- **Unités de taille : KB, MB, GB, TB** : chaque unité vaut environ mille fois la précédente, d'un court texte (KB) à de grosses bases de données (TB).
- **Puissances de deux** : les tailles reposent sur les puissances de deux car l'ordinateur travaille en binaire, et 2^10 = 1024 vaut environ mille.
- **Conversion par jour en par seconde** : un jour compte 86 400 secondes, arrondi à environ 100 000, donc on divise le volume quotidien par 100 000 pour obtenir un débit par seconde.
- **Requests per second (QPS)** : le QPS mesure la charge, et il faut dimensionner le système pour le pic de trafic, pas seulement pour la moyenne.
- **Vitesse relative : memory, disk, network** : la memory est bien plus rapide que le disk local, lui-même en général plus rapide qu'un appel réseau lointain.
- **Estimation back-of-the-envelope pas à pas** : on estime trafic, throughput et stockage en arrondissant les nombres et en enchaînant des étapes simples, en notant ses hypothèses.

## Quiz

### Q1. single_choice (bits-and-bytes)

Combien de bits contient un byte (octet) ?

- [x] 8 bits
- [ ] 2 bits
- [ ] 10 bits
- [ ] 1024 bits

Explanation: Par définition, 1 byte regroupe 8 bits. 1024 est la valeur de 2^10, ce qui est une autre notion (le lien entre KB et bytes), pas la taille d'un byte.

Sources: 

### Q2. single_choice (data-size-units)

Quel est le bon classement des unités, de la plus petite à la plus grande ?

- [ ] MB, KB, TB, GB
- [x] KB, MB, GB, TB
- [ ] KB, GB, MB, TB
- [ ] GB, KB, MB, TB

Explanation: Chaque unité vaut environ mille fois la précédente : KB, puis MB, puis GB, puis TB. Les autres classements mélangent l'ordre.

Sources: 

### Q3. single_choice (powers-of-two)

Pourquoi les tailles en informatique reposent-elles sur des puissances de deux, et que vaut 2^10 environ ?

- [x] Car l'ordinateur travaille avec des bits à 2 valeurs ; 2^10 = 1024, environ mille.
- [ ] Car l'ordinateur travaille avec des bits à 2 valeurs ; 2^10 vaut environ un million.
- [ ] Car les disques sont toujours fabriqués par paires ; 2^10 = 1024, environ mille.
- [ ] Car c'est une simple convention commerciale ; 2^10 vaut environ cent.

Explanation: Un bit a 2 valeurs, donc les tailles sont naturellement des puissances de deux. 2^10 = 1024, proche de mille, ce qui explique les préfixes kilo, méga, giga.

Sources: 

### Q4. multiple_choice (memory-disk-network-speed)

Parmi ces affirmations sur la vitesse d'accès aux données, lesquelles sont vraies (en ordre de grandeur) ?

- [x] La memory est bien plus rapide que le disk local.
- [x] Un disk local est en général plus rapide qu'un appel réseau lointain.
- [ ] Un appel réseau lointain est en général plus rapide que la memory.
- [x] Lire dans un cache en memory évite souvent un aller-retour vers la database.
- [ ] La memory garde ses données même si la machine s'éteint.

Explanation: L'ordre est memory, puis disk local, puis network lointain. Le cache en memory évite donc des accès lents. En revanche, la memory perd ses données à l'extinction : c'est le disk qui les garde.

Sources: 

### Q5. scenario (per-day-to-per-second, requests-per-second)

*Une application de messagerie reçoit 50 millions de requests par jour. Tu veux une estimation rapide du QPS (requests per second) moyen pour dimensionner les serveurs.*

Quel est le QPS moyen approximatif, en arrondissant un jour à 100 000 secondes ?

- [ ] Environ 50 requests par seconde
- [ ] Environ 5 000 requests par seconde
- [x] Environ 500 requests par seconde
- [ ] Environ 50 000 requests par seconde

Explanation: 50 000 000 / 100 000 = 500 par seconde en moyenne. Les autres réponses se trompent d'une ou plusieurs puissances de dix.

Sources: 

### Q6. scenario (requests-per-second)

*Un site de soldes a un QPS moyen de 200. Ses soirées de promotion sont beaucoup plus chargées que la nuit, et on suppose un pic de 3 fois la moyenne. Une panne aux heures chargées serait très coûteuse pour l'entreprise.*

Pour quelle valeur de QPS dois-tu dimensionner le système ?

- [ ] Environ 200, car la moyenne représente la charge normale.
- [x] Environ 600, car le système doit tenir le pic.
- [ ] Environ 67, car il faut diviser la moyenne par le facteur de pic.
- [ ] Environ 2 000, car il faut toujours viser dix fois la moyenne.

Explanation: Un système doit tenir le pic : 200 × 3 = 600. Viser la moyenne ferait planter le système aux heures chargées. Le facteur dépend du produit, il n'est pas toujours 10.

Sources: 

### Q7. free_answer (back-of-the-envelope-estimation, per-day-to-per-second, data-size-units)

Un site reçoit 1 million d'envois de fichiers de 2 MB par jour. Estime en quelques étapes le stockage ajouté par jour et le throughput moyen par seconde.

Expected points:
- Stockage par jour : 1 million × 2 MB = environ 2 TB
- QPS moyen : 1 million / 100 000 = environ 10 par seconde
- Throughput : 10 × 2 MB = environ 20 MB par seconde

Model answer: Stockage : 1 million × 2 MB = 2 millions de MB, soit environ 2 TB par jour. Trafic : 1 million / 100 000 = environ 10 envois par seconde, donc un throughput moyen d'environ 20 MB par seconde.

Sources: 

## Review (by hand)

Summary in [[Foundations Module Content#Quality review (2026-10-09, sonnet, effort low)]].

- **Factual errors**: none outright. Arithmetic checked: 100 Mb/s ≈ 12.5 MB/s, 10M / 86,400 ≈ 116, rounding to 100,000 is about 14 % low, 2^40 / 10^12 ≈ 1.10, 10 TB/day × 400 ≈ 4 PB.
- **Contestable simplification**: "les tailles reposent sur les puissances de deux" and "on a adopté les préfixes kilo, méga, giga" because 1024 ≈ 1000, with no word on decimal units (SI: disk makers, network speeds) versus binary units (KiB, MiB). Q3 tests that simplified "why".
- **Numbers**: the ungrounded rules held. Latencies are orders of magnitude with a "depends on hardware, changes over time" caveat (memory about 100 ns, SSD tens to hundreds of µs, HDD a few ms, distant network call tens to hundreds of ms); the peak factor "2 à 5 fois" is framed as a rule to adapt. Same-datacenter network calls (well under a millisecond) are not mentioned, so "disk faster than network" only holds for the "lointain" case the lesson states.
- **French**: "la memory", "le disk", "network" inside French sentences; "byte" without "octet", "Mo", "Go", which a French learner sees every day.
- **Quiz**: answer keys correct and answerable. Q1 and Q2 are recall; Q3 bundles two questions; Q5 to Q7 test the estimation reasoning well.
