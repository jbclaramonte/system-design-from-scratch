---
title: Sample content for Comment fonctionne le web : client, serveur et HTTP
tags: [sample, prompts]
topic: how-the-web-works
generated: 2026-10-09
prompt-versions: [notion-outline-3, lesson-2, quiz-3, remediation-lesson-3]
grounded: false
---

# Sample content for Comment fonctionne le web : client, serveur et HTTP

Raw output of `scripts/prompt-quality-check.ts` (real CLI, `--model sonnet --effort low`). Foundations Module topic: ungrounded, no primer excerpt. See [[Foundations Module Content]] for the review.

> [!info] Automatic checks
> - Lesson citations: 0 distinct ids, unknown: []
> - Lesson notion markers in outline order: true (client-server-model, request-response-cycle, url-structure, http-methods, http-status-codes, headers-and-body, statelessness-and-cookies, json-payload)
> - Lesson recap section: true
> - Lesson words: 2059
> - Quiz types: single_choice, single_choice, single_choice, multiple_choice, scenario, scenario, free_answer, free_answer
> - Quiz notions covered: 8/8
> - Grounded: false (lesson sources: 0)
> - Remediation: skipped
> - CLI calls: 3
> - call 1: 7.6 s, 730 output tokens
> - call 2: 35.6 s, 4904 output tokens
> - call 3: 16.1 s, 2324 output tokens

## Notion Outline

| Slug | Title | Description | Sources |
|---|---|---|---|
| `client-server-model` | Modèle client-server | Comprendre que le client demande un service et que le server répond, et que ces deux rôles sont distincts. |  |
| `request-response-cycle` | Cycle request / response | Comprendre le déroulement d'un échange où le client envoie une request, puis le server renvoie une response, que ce soit pour une page ou une API. |  |
| `url-structure` | Structure d'une URL | Savoir identifier les parties d'une URL : schéma, host, port, path et query string, et leur rôle pour atteindre une ressource. |  |
| `http-methods` | Méthodes HTTP (GET, POST, PUT, DELETE) | Savoir choisir la méthode HTTP selon l'intention : lire, créer, modifier ou supprimer une ressource. |  |
| `http-status-codes` | Familles de status codes (2xx, 3xx, 4xx, 5xx) | Savoir interpréter une response grâce à la famille de son status code : succès, redirection, erreur client ou erreur server. |  |
| `headers-and-body` | Headers et body HTTP | Distinguer les headers, qui portent les métadonnées d'un message, du body, qui transporte les données elles-mêmes. |  |
| `statelessness-and-cookies` | Statelessness et cookies | Comprendre que HTTP est stateless, et que les cookies permettent au server de reconnaître un client d'une request à l'autre. |  |
| `json-payload` | JSON comme format de payload | Savoir lire la structure d'un JSON et comprendre pourquoi les API l'utilisent pour échanger des données. |  |

## Lesson

### Comment fonctionne le web : client, serveur et HTTP

Quand tu ouvres un site, des dizaines de machines doivent se comprendre sans se connaître. Pour que cela marche, il faut des règles communes : qui demande, qui répond, dans quel format. C'est comme commander dans un restaurant : tu lis le menu, tu passes commande au serveur, la cuisine prépare, et on t'apporte le plat. Chacun a un rôle clair et un langage partagé. Sur le web, ce langage s'appelle **HTTP** (HyperText Transfer Protocol, le protocole d'échange du web).

#### Modèle client-server

<!-- notion: client-server-model -->

Le **client** est le programme qui demande un service. Le **server** est le programme qui répond à cette demande. Ce sont deux rôles distincts, souvent sur deux machines différentes.

Exemple : tu ouvres une boutique en ligne dans ton navigateur.
- Ton navigateur est le client.
- La machine qui héberge le site est le server.

Comment ça marche, étape par étape :
1. Le client prend l'initiative et contacte le server.
2. Le server écoute en permanence, en attente de demandes.
3. Le server traite la demande et renvoie un résultat.

Le client n'est pas forcément un navigateur. Ce peut être une application mobile, ou même un autre server. Un même programme peut être client dans un échange et server dans un autre : ton site de boutique est server pour ton navigateur, mais client pour le service de paiement qu'il appelle.

Pourquoi séparer les rôles ? Un seul server peut servir beaucoup de clients, et on peut mettre à jour le server sans toucher aux appareils des utilisateurs.

Le principal inconvénient : le client dépend du server. Si le server tombe en panne ou si le réseau est coupé, le client ne peut plus rien obtenir. En simplifiant, le server est un **point de dépendance** pour tous ses clients.

#### Cycle request / response

<!-- notion: request-response-cycle -->

Un échange sur le web suit toujours le même schéma : le client envoie une **request** (requête, la demande), puis le server renvoie une **response** (la réponse). Le server ne parle pas en premier : il répond à une request.

Voici le déroulement, en simplifiant :
1. Le client trouve l'adresse du server et ouvre une connexion.
2. Il envoie la request : « donne-moi la page des produits ».
3. Le server lit la request et prépare le résultat, par exemple en consultant une **database** (base de données).
4. Le server envoie la response.
5. Le client utilise la response : il affiche une page ou traite des données.

Deux cas fréquents :
- **Une page web** : la response contient du HTML que le navigateur affiche.
- **Une API** (interface pour que des programmes se parlent) : la response contient des données brutes, que l'application du client met en forme elle-même.

Exemple : une application mobile demande la liste des commandes d'un utilisateur à une API. Le server renvoie les données, et l'application les affiche.

Quand l'utiliser ? C'est le mode normal du web. Son inconvénient : le temps d'attente. Chaque aller-retour prend un peu de temps (la **latency**, le délai de réponse). Si une page demande beaucoup de requests, elle s'affiche plus lentement. De plus, le server ne peut pas, en simplifiant, envoyer spontanément une information au client sans que celui-ci ait demandé.

#### Structure d'une URL

<!-- notion: url-structure -->

Une **URL** est l'adresse d'une **ressource** (une page, une image, une donnée). Elle indique où aller et quoi demander.

Prenons cet exemple :

`https://www.boutique.com:443/produits/42?couleur=rouge`

Ses parties :
- **Schéma** : `https`. C'est le protocole utilisé. HTTPS est la version chiffrée de HTTP.
- **Host** : `www.boutique.com`. C'est le nom de la machine à contacter.
- **Port** : `443`. C'est la « porte » d'entrée sur cette machine. Par convention, 443 est le port d'HTTPS et 80 celui de HTTP. On l'écrit rarement, car le navigateur le déduit du schéma.
- **Path** : `/produits/42`. C'est le chemin de la ressource sur le server. Ici, le produit numéro 42.
- **Query string** : `?couleur=rouge`. Elle commence par `?` et contient des paramètres sous la forme `clé=valeur`. Plusieurs paramètres se séparent par `&`.

Comment l'utiliser ? Le host et le port servent à joindre le bon server. Le path désigne la ressource. La query string affine la demande, par exemple pour filtrer ou trier.

Inconvénient : tout ce qui est dans l'URL est visible, par exemple dans l'historique du navigateur. Il ne faut donc pas y mettre de données sensibles comme un mot de passe. Les URLs très longues peuvent aussi poser des limites pratiques, qui dépendent des outils utilisés.

#### Méthodes HTTP (GET, POST, PUT, DELETE)

<!-- notion: http-methods -->

Une request HTTP contient une **méthode** : un verbe qui dit ce que le client veut faire de la ressource. Choisis la méthode selon ton intention.

- **GET** : lire une ressource. Exemple : `GET /produits/42` renvoie le produit 42.
- **POST** : créer une ressource. Exemple : `POST /commandes` crée une nouvelle commande.
- **PUT** : modifier une ressource, en général en la remplaçant par la version envoyée. Exemple : `PUT /produits/42` met à jour ce produit.
- **DELETE** : supprimer une ressource. Exemple : `DELETE /produits/42` retire le produit.

Pourquoi ces conventions ? Elles rendent les échanges lisibles : en voyant la méthode et le path, on comprend l'intention sans lire le code.

Une notion utile : un GET ne devrait pas changer l'état du server. C'est une simple lecture. On dit qu'il est **safe** (sans effet de bord). Cela permet de le mémoriser dans un **cache** (copie gardée pour aller plus vite) ou de le rejouer sans risque.

Inconvénient : ces règles sont des conventions, pas des obligations. Un server mal conçu peut supprimer des données avec un GET. Par ailleurs, il existe d'autres méthodes (comme PATCH, pour une modification partielle), et certaines API font des choix différents. Dans la pratique, suis les conventions de l'API que tu utilises.

#### Familles de status codes (2xx, 3xx, 4xx, 5xx)

<!-- notion: http-status-codes -->

Chaque response contient un **status code** : un nombre à trois chiffres qui résume le résultat. Le premier chiffre donne la famille, ce qui suffit souvent pour comprendre la situation.

- **2xx : succès.** La request a été traitée. Exemple : `200` (OK).
- **3xx : redirection.** La ressource est ailleurs, le client doit faire une autre request. Exemple : une ancienne URL qui renvoie vers la nouvelle.
- **4xx : erreur du client.** La request est incorrecte ou refusée. Exemple : `404` (ressource introuvable), ou `403` (accès interdit).
- **5xx : erreur du server.** La request était valable, mais le server a échoué. Exemple : `500` (erreur interne).

Comment l'utiliser ? Devant une response inconnue, regarde d'abord le premier chiffre :
1. Un 4xx ? Corrige la request avant de réessayer.
2. Un 5xx ? Le problème vient du server. Réessayer plus tard peut aider.
3. Un 3xx ? Suis la nouvelle adresse.

Exemple : tu tapes `/produits/9999` pour un produit qui n'existe pas. Le server répond `404`. La faute est côté request, pas côté server.

Inconvénient : la famille ne dit pas tout. Un `400` peut avoir plusieurs causes, et un `500` ne dit pas ce qui a cassé. Le body de la response contient souvent un message plus précis, mais son format dépend du server.

#### Headers et body HTTP

<!-- notion: headers-and-body -->

Un message HTTP, request comme response, se compose de deux parties principales.

Les **headers** (en-têtes) portent les **métadonnées**, c'est-à-dire des informations *sur* le message. Chaque header est une paire nom : valeur. Exemples :
- `Content-Type: application/json` indique le format des données.
- `Host: www.boutique.com` indique le server visé.
- `Authorization` peut porter une preuve d'identité.

Le **body** (corps) transporte les données elles-mêmes. Exemple : pour créer une commande, la request POST contient dans son body le détail de la commande. Pour une response, le body contient la page HTML ou les données demandées.

Pense à une lettre : l'enveloppe (adresse, type de courrier) correspond aux headers, et la feuille à l'intérieur correspond au body.

Comment ça se lit ? Le receveur lit d'abord les headers. Il sait ainsi comment interpréter le body : quel format, quelle taille, quelle langue.

Un GET n'a en général pas de body, puisqu'il ne fait que lire. Un POST ou un PUT en a souvent un.

Inconvénient : les headers ajoutent un petit volume à chaque message, ce qui compte quand il y a énormément de requests. Et, comme l'URL, ils peuvent être lus en chemin si la connexion n'est pas chiffrée. D'où l'intérêt de HTTPS.

#### Statelessness et cookies

<!-- notion: statelessness-and-cookies -->

HTTP est **stateless** (sans état) : en simplifiant, le server traite chaque request indépendamment et ne garde pas de mémoire de la précédente. Pour lui, deux requests successives du même client sont deux inconnus.

Pourquoi ce choix ? Un server sans mémoire est plus simple à multiplier. N'importe quel server peut répondre à n'importe quelle request, ce qui aide à servir beaucoup de clients.

Mais il y a un problème : comment rester connecté à ton compte sur la boutique ? C'est le rôle des **cookies**, de petites données que le navigateur garde et renvoie à chaque request.

Voici le déroulement :
1. Tu envoies ton login et ton mot de passe.
2. Le server vérifie, puis répond avec un header `Set-Cookie` contenant un identifiant de **session** (la mémoire de ta connexion).
3. Le navigateur stocke ce cookie.
4. À chaque request suivante, il renvoie le cookie dans un header `Cookie`.
5. Le server retrouve ta session grâce à cet identifiant.

Exemple : ton panier d'achat est lié à ton identifiant de session.

Inconvénients : le cookie est envoyé à chaque request, et s'il est volé, quelqu'un peut se faire passer pour toi. Il faut donc le protéger, notamment avec HTTPS. Il faut aussi que le server retrouve les données de session, ce qui demande un stockage partagé.

#### JSON comme format de payload

<!-- notion: json-payload -->

Le **payload** est le contenu utile transporté dans le body. Les API utilisent très souvent le format **JSON** (JavaScript Object Notation) pour l'écrire.

Un JSON est du texte avec une structure simple :
- **Objet** : entre accolades `{}`, avec des paires clé : valeur.
- **Tableau** : entre crochets `[]`, une liste de valeurs.
- **Valeurs** : texte (entre guillemets), nombre, `true` ou `false`, `null`, ou un objet ou tableau imbriqué.

Exemple de response pour un produit :

```json
{
  "id": 42,
  "nom": "Casque audio",
  "prix": 59.9,
  "disponible": true,
  "tags": ["audio", "sans fil"]
}
```

Pour le lire : l'objet a cinq clés. `id` vaut le nombre 42, et `tags` est une liste de deux textes.

Pourquoi les API l'utilisent-elles ?
- Il est lisible par un humain.
- Il est léger, sans balises répétées.
- Presque tous les langages de programmation savent le lire et l'écrire.

Dans l'échange, le header `Content-Type: application/json` annonce que le body est du JSON.

Inconvénients : c'est du texte, donc moins compact qu'un format binaire. Il n'a pas de type pour les dates, qu'on écrit en général comme du texte. Il ne contient pas non plus de commentaires. Le meilleur choix de format dépend du besoin : lisibilité ou performance.

#### Récapitulatif

- **Modèle client-server** : le client demande un service, le server répond, et ces deux rôles sont distincts.
- **Cycle request / response** : chaque échange commence par une request du client et se termine par une response du server, que ce soit pour une page ou une API.
- **Structure d'une URL** : schéma, host, port, path et query string indiquent ensemble comment et où atteindre une ressource.
- **Méthodes HTTP (GET, POST, PUT, DELETE)** : on choisit la méthode selon l'intention : lire, créer, modifier ou supprimer.
- **Familles de status codes (2xx, 3xx, 4xx, 5xx)** : le premier chiffre indique succès, redirection, erreur client ou erreur server.
- **Headers et body HTTP** : les headers portent les métadonnées du message, le body transporte les données.
- **Statelessness et cookies** : HTTP ne garde pas de mémoire entre deux requests, et les cookies permettent au server de reconnaître un client.
- **JSON comme format de payload** : le JSON est un texte structuré en objets et tableaux, simple à lire et pris en charge par presque tous les langages.

## Quiz

### Q1. single_choice (client-server-model)

Dans le modèle client-server, quel est le rôle du server ?

- [x] Il écoute en permanence et répond aux demandes des clients.
- [ ] Il prend l'initiative et contacte le client pour lui envoyer des pages.
- [ ] Il affiche la page à l'écran de l'utilisateur.
- [ ] Il est toujours le même programme que le client, sur la même machine.

Explanation: Le server attend les demandes et y répond. C'est le client qui prend l'initiative, pas le server. Les deux rôles sont distincts, souvent sur des machines différentes.

Sources: 

### Q2. single_choice (url-structure)

Dans l'URL `https://www.boutique.com/produits/42?couleur=rouge`, quelle partie est la query string ?

- [ ] /produits/42
- [x] ?couleur=rouge
- [ ] www.boutique.com
- [ ] https

Explanation: La query string commence par `?` et contient des paramètres clé=valeur. `/produits/42` est le path, `www.boutique.com` le host et `https` le schéma.

Sources: 

### Q3. single_choice (http-methods)

Tu veux supprimer le produit 42 d'une API qui suit les conventions HTTP. Quelle request est la plus adaptée ?

- [ ] GET /produits/42
- [ ] POST /produits/42
- [x] DELETE /produits/42
- [ ] PUT /produits/42

Explanation: DELETE sert à supprimer une ressource. GET lit, POST crée et PUT modifie, donc aucune ne correspond à l'intention de supprimer.

Sources: 

### Q4. multiple_choice (headers-and-body)

Parmi ces éléments, lesquels sont des métadonnées portées par les headers d'un message HTTP ?

- [x] Le format des données, avec Content-Type.
- [x] Le server visé, avec Host.
- [ ] Le détail d'une commande à créer dans une request POST.
- [ ] La page HTML renvoyée par le server.

Explanation: Les headers décrivent le message (format, server visé). Le détail de la commande et la page HTML sont des données, donc ils sont dans le body.

Sources: 

### Q5. scenario (http-status-codes)

*Un développeur appelle l'API d'une boutique pour afficher un produit. Il tape `/produits/9999`, un produit qui n'existe pas. Le server répond avec le status code 404. Il hésite entre corriger sa request ou prévenir l'équipe qui gère le server.*

Que doit-il conclure en regardant la famille du status code ?

- [ ] C'est une erreur server (5xx) : il doit réessayer plus tard.
- [x] C'est une erreur du client (4xx) : la request est à corriger.
- [ ] C'est une redirection (3xx) : il doit suivre une nouvelle adresse.
- [ ] C'est un succès (2xx) : le produit a bien été trouvé.

Explanation: Un 404 est dans la famille 4xx : la ressource demandée est introuvable, la faute est côté request. Un 5xx signalerait un échec du server sur une request valable.

Sources: 

### Q6. scenario (statelessness-and-cookies)

*Tu te connectes à une boutique avec ton login et ton mot de passe. Tu cliques ensuite sur une autre page, et le site te reconnaît sans te redemander tes identifiants. Pourtant, HTTP est stateless.*

Comment le server te reconnaît-il d'une request à l'autre ?

- [ ] Le server garde une connexion ouverte pour toi et se souvient de ta dernière request.
- [x] Le navigateur renvoie à chaque request un cookie contenant un identifiant de session.
- [ ] Le navigateur écrit ton mot de passe dans l'URL à chaque page.
- [ ] Le server devine qui tu es grâce au path de la page demandée.

Explanation: Le server envoie un header Set-Cookie, puis le navigateur renvoie le cookie à chaque request. Mettre un mot de passe dans l'URL serait dangereux, car l'URL est visible.

Sources: 

### Q7. free_answer (json-payload)

Lis ce JSON : {"id": 7, "nom": "Clavier", "tags": ["usb", "noir"]}. Combien de clés l'objet contient-il, et quel est le type de la valeur de "tags" ? Explique en une phrase pourquoi les API utilisent souvent JSON.

Expected points:
- L'objet a trois clés (id, nom, tags).
- tags est un tableau (une liste) de textes.
- JSON est lisible, léger et lu par presque tous les langages.

Model answer: L'objet a trois clés, et "tags" est un tableau de deux textes. Les API utilisent JSON car il est lisible, léger et pris en charge par presque tous les langages.

Sources: 

### Q8. free_answer (request-response-cycle, client-server-model)

Une application mobile affiche la liste des commandes d'un utilisateur en appelant une API. Décris en 2 ou 3 phrases ce qui se passe entre le client et le server, et dis qui prend l'initiative.

Expected points:
- Le client envoie une request au server et prend l'initiative.
- Le server traite la demande (par exemple avec une database) et renvoie une response.
- La response contient des données que l'application met en forme.

Model answer: L'application, qui est le client, envoie une request à l'API, car c'est elle qui prend l'initiative. Le server consulte sa database puis renvoie une response avec les données des commandes. L'application les met ensuite en forme pour les afficher.

Sources: 

## Review (by hand)

Summary in [[Foundations Module Content#Quality review (2026-10-09, sonnet, effort low)]].

- **Factual errors**: none found. Caveats are standard and correct (GET is safe by convention only, PUT usually replaces the resource, PATCH exists, a GET usually has no body, the server cannot push data "en simplifiant").
- **Scope**: stays off the primer topics (no DNS mechanics, no REST vs RPC, no CDN or load balancer).
- **French**: heavy franglais from the language rule: "le server", "la request", "la response" in every sentence, while the topic title says "serveur". "Request" and "response" are glossed once, then never in French.
- **Beginner level**: clear, one example per idea, but 2059 words for 8 notions is long for a first lesson.
- **Quiz**: answer keys correct and answerable from the lesson. Q2 and Q3 are recall; the Q5 scenario gives the answer away ("un produit qui n'existe pas"); Q7 asks three things in one free answer.
