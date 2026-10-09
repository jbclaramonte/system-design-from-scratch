---
title: Sample content for Cache
tags: [sample, prompts]
topic: cache
generated: 2026-10-09
prompt-versions: [notion-outline-1, lesson-1, quiz-1, remediation-lesson-1]
corpus-commit: ae9bbd7b02d90b9866215de185217d33f39ab733
---

# Sample content for Cache

Raw output of `scripts/prompt-quality-check.ts` (real CLI, `--model sonnet --effort low`). See [[Prompts]] for the review. Primer excerpts: Content from "The System Design Primer" by Donne Martin and contributors (https://github.com/donnemartin/system-design-primer), commit ae9bbd7b02d90b9866215de185217d33f39ab733, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).

> [!info] Automatic checks
> - Lesson citations: 9 distinct ids, unknown: []
> - Lesson notion markers in outline order: true (cache-basics, cache-layers, in-memory-cache, query-level-caching, object-level-caching, cache-aside, write-through-and-write-behind, refresh-ahead-and-invalidation)
> - Lesson recap section: true
> - Lesson words: 1776
> - Quiz types: single_choice, single_choice, multiple_choice, scenario, scenario, free_answer
> - Quiz notions covered: 6/8
> - Remediation citations unknown: []
> - Remediation words: 351
> - CLI calls: 4
> - call 1: 7.3 s, 935 output tokens
> - call 2: 29.2 s, 4638 output tokens
> - call 3: 16.3 s, 1895 output tokens
> - call 4: 8.2 s, 886 output tokens

## Notion Outline

| Slug | Title | Description | Sources |
|---|---|---|---|
| `cache-basics` | Pourquoi utiliser un cache | Comprendre qu'un cache accélère le chargement des pages, réduit la charge des servers et de la database, et absorbe les pics de trafic. | cache |
| `cache-layers` | Les niveaux de cache : client, CDN, web server, database | Savoir situer un cache à chaque niveau (client, CDN, reverse proxy, web server, database) et ce que chacun évite de recalculer. | cache/client-caching, cache/cdn-caching, cache/web-server-caching, cache/database-caching |
| `in-memory-cache` | Application caching avec Memcached et Redis | Comprendre qu'un in-memory cache est un key-value store en RAM, plus rapide que le disque, qui garde les données hot grâce à LRU. | cache/application-caching |
| `query-level-caching` | Caching au niveau de la database query | Comprendre qu'on stocke le résultat d'une query avec son hash comme clé, et pourquoi l'invalidation devient difficile. | cache/caching-at-the-database-query-level |
| `object-level-caching` | Caching au niveau de l'objet | Comprendre qu'on met en cache des objets assemblés par l'application, quoi cacher, et qu'on les retire quand les données changent. | cache/caching-at-the-object-level |
| `cache-aside` | Cache-aside (lazy loading) | Comprendre que l'application lit le cache, charge depuis la database en cas de cache miss, puis remplit le cache, avec ses limites. | cache/when-to-update-the-cache |
| `write-through-and-write-behind` | Write-through et write-behind | Comparer l'écriture synchrone via le cache (write-through) et l'écriture asynchrone (write-behind) : latence, données fraîches, risque de perte. | cache/when-to-update-the-cache |
| `refresh-ahead-and-invalidation` | Refresh-ahead et cache invalidation | Comprendre le refresh-ahead avant expiration, son risque de mauvaise prédiction, et pourquoi la cache invalidation reste un problème difficile. | cache, cache/when-to-update-the-cache |

## Lesson

### Le cache

Imagine une cuisine de restaurant. Le cuisinier garde les ingrédients les plus utilisés sur le plan de travail, au lieu d'aller les chercher dans la réserve à chaque commande. Un **cache** (une mémoire de stockage rapide pour des résultats déjà obtenus) fait la même chose pour un système : il garde à portée de main ce qui est souvent demandé. Dans cette leçon, tu vas voir pourquoi on l'utilise, où on le place, et comment le garder à jour.

#### Pourquoi utiliser un cache
<!-- notion: cache-basics -->

Un **cache** stocke le résultat d'une demande déjà faite, pour le renvoyer sans refaire tout le travail. Le **dispatcher** (le composant qui reçoit les requêtes) regarde d'abord si la requête a déjà été faite. S'il trouve le résultat précédent, il le renvoie et évite l'exécution réelle. [source: cache]

Le cache apporte trois bénéfices :

- Il **accélère le chargement des pages**. [source: cache]
- Il **réduit la charge** des servers et des databases. [source: cache]
- Il **absorbe les pics de trafic**. [source: cache]

Le troisième point mérite un exemple. Une database aime quand les lectures et les écritures sont réparties uniformément entre ses partitions. Or des éléments populaires peuvent fausser cette répartition et créer des goulots d'étranglement (**bottlenecks**). Si une boutique en ligne met un produit en vedette, tout le monde le demande en même temps. Un cache placé devant la database répond à sa place. [source: cache]

**Compromis** : il faut garder le cache cohérent avec la **source of truth** (la source de vérité, par exemple la database). Cela passe par la **cache invalidation**, qui ajoute de la complexité. Il faut aussi modifier l'application, par exemple pour ajouter Redis ou Memcached. [source: cache]

#### Les niveaux de cache
<!-- notion: cache-layers -->

Un cache peut se trouver à plusieurs endroits : côté client (OS ou navigateur), côté server, ou dans une couche de cache distincte. [source: cache/client-caching] Chaque niveau évite de refaire un travail.

- **Client** : le navigateur ou l'OS garde ce qu'il a déjà reçu. Il n'a pas besoin de redemander. [source: cache/client-caching]
- **CDN** : un CDN (réseau de distribution de contenu) est considéré comme un type de cache. [source: cache/cdn-caching]
- **Reverse proxy** : un reverse proxy (un intermédiaire placé devant les servers) et des caches comme **Varnish** peuvent servir du contenu statique et dynamique directement. [source: cache/web-server-caching]
- **Web server** : il peut mettre des requêtes en cache et répondre sans contacter les application servers. [source: cache/web-server-caching]
- **Database** : elle inclut en général un certain niveau de cache dans sa configuration par défaut, prévue pour un usage générique. [source: cache/database-caching]

Exemple : une page vue deux fois de suite peut être servie par le navigateur la seconde fois. Sinon, elle vient du reverse proxy, et l'application server n'est pas sollicité.

**Compromis** : la configuration par défaut de la database est générale. L'ajuster à ton usage peut encore améliorer la performance, mais cela demande du réglage. [source: cache/database-caching]

#### Application caching : Memcached et Redis
<!-- notion: in-memory-cache -->

Un **in-memory cache** comme **Memcached** ou **Redis** est un **key-value store** (un stockage où l'on retrouve une valeur grâce à sa clé). Il se place entre ton application et ton stockage de données. [source: cache/application-caching]

Pourquoi est-il rapide ? Ses données sont en **RAM** (la mémoire vive), bien plus rapide que les databases classiques qui écrivent sur disque. [source: cache/application-caching]

Mais la RAM est plus limitée que le disque. Il faut donc décider quoi garder. Un algorithme comme **LRU** (least recently used, le moins récemment utilisé) retire les entrées « cold » (peu utilisées) et garde les données « hot » (souvent utilisées) en RAM. [source: cache/application-caching]

Exemple : dans ta boutique, la fiche d'un produit très consultée reste en RAM. Celle d'un produit que personne ne regarde est retirée en premier.

Redis offre en plus une option de **persistence** et des structures de données intégrées, comme les sorted sets et les lists. [source: cache/application-caching]

**Compromis** : il vaut mieux éviter le cache basé sur des fichiers, car il complique le **cloning** et l'**auto-scaling**. [source: cache/application-caching]

#### Caching au niveau de la database query
<!-- notion: query-level-caching -->

Le **query-level caching** met en cache le résultat d'une requête. À chaque query sur la database, tu calcules un **hash** de la query (une empreinte courte du texte), tu l'utilises comme clé, et tu stockes le résultat dans le cache. [source: cache/caching-at-the-database-query-level]

Exemple : la query « les 10 produits les plus vendus » a toujours le même hash. La deuxième fois, le résultat vient du cache, pas de la database.

Le problème vient de l'expiration. Cette approche en souffre : [source: cache/caching-at-the-database-query-level]

- Il est difficile de supprimer un résultat en cache quand la query est complexe. [source: cache/caching-at-the-database-query-level]
- Si une seule donnée change, par exemple une cellule d'une table, il faut supprimer toutes les queries en cache qui pourraient contenir cette cellule. [source: cache/caching-at-the-database-query-level]

Si le prix d'un produit change, plusieurs queries peuvent l'avoir utilisé : la liste des meilleures ventes, une recherche, une catégorie. Retrouver toutes ces clés est pénible.

**Compromis** : c'est simple à mettre en place, mais l'**invalidation** devient vite difficile.

#### Caching au niveau de l'objet
<!-- notion: object-level-caching -->

Avec l'**object-level caching**, tu vois tes données comme un objet, comme dans ton code. L'application assemble les données de la database en une instance de classe ou une structure de données, puis tu mets cet objet en cache. [source: cache/caching-at-the-object-level]

Quoi cacher ? Voici les suggestions : [source: cache/caching-at-the-object-level]

- les **user sessions** ;
- les pages web entièrement rendues ;
- les **activity streams** ;
- les données de **user graph**.

Quand les données sous-jacentes changent, tu retires l'objet du cache. [source: cache/caching-at-the-object-level] Exemple : si un client modifie son adresse, tu retires l'objet « profil client » du cache. Le prochain accès le reconstruira.

Autre avantage : le traitement asynchrone. Des **workers** (des processus de travail en arrière-plan) assemblent les objets en consommant le dernier objet en cache. [source: cache/caching-at-the-object-level]

**Compromis** : c'est à l'application d'assembler les objets et de penser à les retirer au bon moment.

#### Cache-aside (lazy loading)
<!-- notion: cache-aside -->

Avec **cache-aside**, l'application gère elle-même la lecture et l'écriture du stockage. Le cache n'interagit pas directement avec le stockage. [source: cache/when-to-update-the-cache]

Voici le flux :

1. L'application cherche l'entrée dans le cache. Si elle n'y est pas, c'est un **cache miss**.
2. Elle charge l'entrée depuis la database.
3. Elle ajoute l'entrée au cache.
4. Elle renvoie l'entrée. [source: cache/when-to-update-the-cache]

Les lectures suivantes de cette donnée sont rapides. On parle aussi de **lazy loading** : seules les données demandées sont mises en cache, ce qui évite de remplir le cache avec des données que personne ne demande. Memcached est généralement utilisé ainsi. [source: cache/when-to-update-the-cache]

**Limites** :

- Chaque cache miss coûte trois trajets, ce qui peut causer un délai visible. [source: cache/when-to-update-the-cache]
- Les données peuvent devenir **stale** (périmées) si la database est modifiée. Un **TTL** (time-to-live, une durée de vie après laquelle l'entrée est refaite) ou le write-through atténue ce problème. [source: cache/when-to-update-the-cache]
- Si un node tombe en panne, il est remplacé par un node vide, ce qui augmente la latency. [source: cache/when-to-update-the-cache]

#### Write-through et write-behind
<!-- notion: write-through-and-write-behind -->

Ces deux stratégies traitent les **écritures**.

**Write-through** : l'application utilise le cache comme stockage principal. Le cache se charge d'écrire dans la database.

1. L'application ajoute ou met à jour l'entrée dans le cache.
2. Le cache écrit l'entrée **de façon synchrone** dans le data store.
3. La réponse est renvoyée. [source: cache/when-to-update-the-cache]

L'opération d'écriture est lente. En revanche, les lectures de données tout juste écrites sont rapides, et les données du cache ne sont pas stale. Les utilisateurs tolèrent généralement mieux la latency lors d'une mise à jour que lors d'une lecture. [source: cache/when-to-update-the-cache]

**Write-behind (write-back)** : l'application met à jour le cache, puis l'entrée est écrite **de façon asynchrone** dans le data store. Cela améliore la performance d'écriture. [source: cache/when-to-update-the-cache]

**Compromis** :

- Write-through : un nouveau node n'a pas les entrées tant qu'elles ne sont pas mises à jour dans la database. Beaucoup de données écrites ne seront peut-être jamais lues, ce qu'un TTL limite. [source: cache/when-to-update-the-cache]
- Write-behind : il y a un risque de **perte de données** si le cache tombe avant que son contenu atteigne le data store. Il est aussi plus complexe à implémenter. [source: cache/when-to-update-the-cache]

#### Refresh-ahead et cache invalidation
<!-- notion: refresh-ahead-and-invalidation -->

Avec **refresh-ahead**, tu configures le cache pour rafraîchir automatiquement toute entrée récemment consultée, avant son expiration. [source: cache/when-to-update-the-cache]

L'intérêt : la latency peut baisser par rapport à un read-through, si le cache prédit bien quels éléments seront utiles bientôt. [source: cache/when-to-update-the-cache] Exemple : une entrée très consultée est renouvelée avant d'expirer, donc le prochain visiteur ne subit pas de miss.

Le risque est la mauvaise prédiction. Si le cache devine mal, la performance peut être pire que sans refresh-ahead. [source: cache/when-to-update-the-cache]

Plus largement, la **cache invalidation** reste un problème difficile. Il faut garder le cache cohérent avec la source of truth, et décider quand mettre à jour le cache ajoute de la complexité. [source: cache] Comme la place est limitée, il faut aussi choisir la stratégie de mise à jour adaptée à ton cas. [source: cache/when-to-update-the-cache]

**Compromis** : chaque stratégie (TTL, write-through, refresh-ahead) a un coût. Aucune n'est parfaite.

#### Récapitulatif

- **Pourquoi utiliser un cache** : un cache accélère les pages, réduit la charge des servers et de la database, et absorbe les pics de trafic.
- **Les niveaux de cache** : on peut cacher au niveau du client, du CDN, du reverse proxy, du web server et de la database, pour éviter de refaire du travail.
- **Application caching : Memcached et Redis** : un in-memory cache est un key-value store en RAM, plus rapide que le disque, qui garde les données hot grâce à LRU.
- **Caching au niveau de la database query** : on stocke le résultat d'une query avec son hash comme clé, mais l'invalidation devient difficile.
- **Caching au niveau de l'objet** : on met en cache des objets assemblés par l'application, et on les retire quand les données changent.
- **Cache-aside (lazy loading)** : l'application lit le cache, charge depuis la database en cas de cache miss, puis remplit le cache, avec un risque de données stale.
- **Write-through et write-behind** : write-through écrit de façon synchrone avec des données fraîches mais lentes, write-behind écrit de façon asynchrone avec un risque de perte.
- **Refresh-ahead et cache invalidation** : refresh-ahead rafraîchit avant expiration mais peut mal prédire, et la cache invalidation reste un problème difficile.

## Quiz

### Q1. single_choice (cache-basics)

Une boutique en ligne met un produit en vedette et tout le monde le demande en même temps. Que fait un cache placé devant la database dans ce cas ?

- [x] Il répond à la place de la database et absorbe le pic de trafic.
- [ ] Il supprime la source of truth pour éviter les incohérences.
- [ ] Il répartit le produit sur plusieurs databases à la place du server.

Explanation: Un cache devant la database répond aux demandes populaires et absorbe les pics. Il ne remplace pas la source of truth (la database), qui reste la référence.

Sources: cache

### Q2. single_choice (cache-layers)

Une page est vue deux fois de suite par le même utilisateur. Quel cache permet de ne même pas redemander la page au réseau la seconde fois ?

- [ ] Le cache de la database
- [x] Le cache du navigateur (côté client)
- [ ] Le cache d'un application server

Explanation: Le navigateur ou l'OS garde ce qu'il a déjà reçu, donc il n'a pas besoin de redemander. Les autres niveaux sont plus loin, côté server.

Sources: cache/client-caching

### Q3. multiple_choice (in-memory-cache)

Pourquoi un in-memory cache comme Redis ou Memcached est-il rapide et utile ?

- [x] Ses données sont en RAM, plus rapide que le disque des databases classiques.
- [x] C'est un key-value store : on retrouve une valeur grâce à sa clé.
- [ ] Il garde toutes les données sans limite, donc il n'a jamais besoin de retirer d'entrées.
- [ ] Avec LRU, il retire d'abord les entrées les plus souvent utilisées.

Explanation: La RAM et le key-value store expliquent la vitesse. Mais la RAM est limitée : LRU retire les entrées cold (peu utilisées), pas les hot.

Sources: cache/application-caching

### Q4. scenario (query-level-caching)

*Ton application affiche les 10 produits les plus vendus grâce à une query dont le hash sert de clé dans le cache. Le prix d'un produit change. Ce produit apparaît aussi dans une recherche et une catégorie mises en cache de la même façon.*

Quel problème rencontres-tu avec ce query-level caching ?

- [ ] Le hash change à chaque lecture, donc le cache ne sert jamais.
- [x] Il faut retrouver et supprimer toutes les queries en cache qui contiennent ce produit.
- [ ] Le cache ne peut pas stocker le résultat d'une query complexe.

Explanation: Une seule donnée modifiée peut se trouver dans plusieurs résultats en cache, et retrouver toutes ces clés est difficile. Le hash d'une même query reste identique.

Sources: cache/caching-at-the-database-query-level

### Q5. scenario (write-through-and-write-behind)

*Tu gères une application où les utilisateurs mettent à jour leur profil. Tu veux que les données en cache ne soient jamais stale juste après une écriture. Les utilisateurs acceptent un peu de latency pendant la mise à jour, mais pas de perdre des données si le cache tombe.*

Quelle stratégie choisis-tu ?

- [ ] Write-behind, car l'écriture asynchrone est plus rapide et sans risque.
- [ ] Refresh-ahead, car il remplace toute écriture dans la database.
- [x] Write-through, car l'écriture synchrone garde le cache frais et évite la perte.
- [ ] Cache-aside sans TTL, car les données ne deviennent jamais stale.

Explanation: Write-through écrit de façon synchrone : écriture plus lente, mais données fraîches et pas de perte. Write-behind risque de perdre des données si le cache tombe avant l'écriture.

Sources: cache/when-to-update-the-cache

### Q6. free_answer (refresh-ahead-and-invalidation)

Explique ce qu'est le refresh-ahead et quel risque il présente.

Expected points:
- Le cache rafraîchit automatiquement les entrées récemment consultées avant leur expiration.
- Si le cache prédit mal les éléments utiles, la performance peut être pire que sans refresh-ahead.

Model answer: Avec le refresh-ahead, le cache rafraîchit tout seul les entrées récemment consultées avant qu'elles expirent, ce qui peut baisser la latency. Si la prédiction est mauvaise, la performance peut être pire que sans cette stratégie.

Sources: cache/when-to-update-the-cache

## Remediation Lesson (`query-level-caching`, angle: analogy)

#### Caching au niveau de la database query

Imagine un petit restaurant. Un client demande : « Le plat du jour avec une sauce sans oignon, pour deux personnes. » Le cuisinier prépare le plat, puis le range dans un frigo. Sur le frigo, il colle une étiquette qui reprend exactement la commande. La prochaine fois que quelqu'un passe la même commande, il sort le plat du frigo sans cuisiner.

Voici le lien avec la technique :

- La commande, c'est la query envoyée à la database (la base de données).
- L'étiquette, c'est le hash de la query, utilisé comme clé dans le cache.
- Le plat rangé, c'est le résultat de la query, stocké dans le cache. [source: cache/caching-at-the-database-query-level]

Jusque-là, tout va bien. Le problème arrive quand un ingrédient change. Par exemple, le restaurant n'a plus la même sorte de fromage. Quels plats du frigo contiennent ce fromage ? L'étiquette ne parle que de la commande, pas du contenu. Le cuisinier doit deviner quels plats sont touchés, ou les jeter tous.

C'est exactement la difficulté de l'invalidation (retirer du cache ce qui n'est plus à jour). Si une seule donnée change, comme une cellule d'une table, tu dois supprimer toutes les queries en cache qui pourraient contenir cette cellule. [source: cache/caching-at-the-database-query-level]

Et plus la query est complexe, plus c'est dur. Retrouver la bonne entrée à supprimer devient difficile. [source: cache/caching-at-the-database-query-level] Si tu en oublies une, le cache renvoie un ancien résultat, comme un plat périmé servi au client.

Là où l'analogie s'arrête : un cuisinier peut ouvrir le plat et voir ce qu'il contient, alors que le cache ne stocke qu'une clé de hash et un résultat, sans lien simple vers les données d'origine.

**À retenir**
- On stocke le résultat d'une query dans le cache, avec le hash de la query comme clé. [source: cache/caching-at-the-database-query-level]
- Le vrai problème est l'expiration : une seule donnée modifiée oblige à supprimer toutes les queries en cache qui pouvaient l'inclure. [source: cache/caching-at-the-database-query-level]
- Plus la query est complexe, plus il est difficile de supprimer le bon résultat en cache. [source: cache/caching-at-the-database-query-level]
