# 🌐 Archipel

**Protocole de Réseau Décentralisé et Souverain**

Archipel n'est pas qu'un outil de transfert de fichiers. C'est une architecture souveraine, pensée pour la résilience. Face à la centralisation et aux points de défaillance uniques de l'internet moderne, Archipel propose une architecture P2P chiffrée de bout en bout, auto-découvrable et robuste.

---

## 🏗 Architecture

```text
       [ Node A ] <====== ( TCP: X25519 + AES-256-GCM ) ======> [ Node B ]
           |                                                       |
    ( UDP Multicast ) <--- Découverte & Beaconing --->      ( UDP Multicast )
           |                                                       |
       [ Node C ] <---------- ( TCP: Chunked Transfer ) -----------+
```

### Principes Fondamentaux :
1. **Découverte Automatique (UDP) :** Les nœuds se découvrent localement sans aucun serveur Trackers central (Multicast).
2. **Confiance Cryptographique :** L'identité d'un nœud est garantie par la cryptographie plutôt que par son adresse IP.
3. **Robustesse du Transfert :** Les fichiers sont découpés en _chunks_, hachés individuellement et transférés indépendamment.

---

### Stack Technique
Le projet est intégralement développé en Node.js (TypeScript). Ce choix repose sur trois piliers :

1. TypeScript pour la Fiabilité : La manipulation de buffers binaires (chunks, clés privées, nonces) nécessite une rigueur absolue. Le typage fort de TypeScript réduit drastiquement les erreurs de corruption de données en mémoire.

2. Modèle Asynchrone : La gestion simultanée de centaines de connexions TCP et de l'écoute UDP Multicast est nativement optimisée par l'Event Loop de Node.js, offrant une excellente montée en charge sans la complexité du multi-threading classique.

3. Écosystème Cryptographique : L'utilisation de libsodium-wrappers permet de manipuler des primitives C de haute performance tout en restant dans un environnement de développement moderne.

### Pourquoi l'hybride UDP / TCP ?
1. Nous avons séparé le plan de contrôle du plan de données pour maximiser la résilience :

2. UDP (Discovery) : Utilisé pour le beaconing (multicast). Contrairement à TCP, l'UDP permet d'annoncer sa présence à l'aveugle sur un réseau local sans connaître l'adresse IP des pairs au préalable. C'est le cœur de l'auto-découverte "Zero-Conf".

3. TCP (Transfert & Handshake) : Pour l'échange des fichiers et des secrets, la fiabilité est non-négociable. TCP garantit l'ordre des paquets et la gestion automatique de la congestion, ce qui est indispensable lors du transfert de chunks de 512 KB sur des réseaux instables.

## 🔐 Sécurité & Handshake

Nous avons volontairement évité TLS pour implémenter un handshake P2P souverain inspiré de Noise Protocol Framework, garantissant **Forward Secrecy** et indépendance vis-à-vis des autorités de certification (PKI).

L'identité des nœuds repose sur la pile cryptographique moderne **libsodium** :
- **Identité:** `Ed25519` (Signatures ultra-rapides et robustes, 128-bit security).
- **Échange de Clés:** `X25519` (Diffie-Hellman elliptique).
- **Dérivation (HKDF):** Génération de clés de session uniques par connexion.
- **Transport:** `AES-256-GCM` (Chiffrement authentifié avec un nonce aléatoire de 96-bits, empêchant les attaques par rejeu).

**Le Handshake simplifié :**
1. **HELLO :** A envoie sa clé publique éphémère à B.
2. **CHALLENGE :** B répond avec sa propre clé éphémère.
3. **DERIVE :** A et B calculent indépendamment le secret partagé via HKDF. La session est sécurisée.

_Note: Actuellement, la validation des identités suit un modèle TOFU (Trust On First Use)._

---

## 📦 Transfert de Fichiers (Chunking)

Pour garantir la stabilité face aux déconnexions :
- Les fichiers sont découpés en morceaux immuables de **512 KB**.
- Un Manifeste racine (contenant le `SHA-256` de chaque chunk) est d'abord échangé.
- Chaque chunk reçu est vérifié cryptographiquement. Un chunk compromis est jeté et redemandé.

---

## 🚀 Utilisation (CLI)

# Installation des dépendances
npm install

# Build du projet TypeScript
npm run build

# Lancer un noeud (via le binaire compilé ou ts-node)
./archipel start --port 7777

```bash
# Lancer un noeud sur le port 7777
archipel start --port 7777

# Voir les pairs découverts
archipel peers

# Envoyer un message sécurisé à un pair
archipel msg <node_id> "Hello, World!"

# Partager un fichier sur le réseau
archipel send ./matrix.mkv

# Télécharger un fichier via son identifiant
archipel download <file_id>

# État du nœud (Uptime, Peers, Sessions, Chunks)
archipel status
```

---

## ⚠️ Limites Actuelles (Prototype 24h)

- **Topologie réseau :** Les transferts sont directs. Le routage _Mesh_ multi-sauts n'est pas encore implémenté.
- **Distribution des Chunks :** Demande séquentielle au lieu d'une stratégie _Rarest-First_.
- **Web-of-Trust :** Pas de révocation de signatures ni de signatures croisées pour le moment.

## 🗺 Roadmap Future

1. **Routage en Oignon :** Anonymisation des messages via multi-sauts.
2. **Kademlia DHT :** Remplacer le Multicast local par un vrai routage mondial.
3. **BitTorrent Like Transfer :** Stratégies _Rarest First_ dynamiques, téléchargement chez N pairs simultanément.

---
