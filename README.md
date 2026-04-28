# Entiers Relatifs — PLAI

Application web pédagogique : addition et soustraction d'entiers relatifs sur droite numérique, avec remédiation socratique et dashboard enseignant temps réel.

## Fondements scientifiques (corpus RISS)

| Référence | Apport |
|---|---|
| Hirsch & Roditi (2023) `hal-05188689` | La droite numérique est fondamentale pour l'apprentissage des nombres |
| Barrouillet et al. (2007) `hal-01570674` | Troubles de l'espace → représentation visuelle indispensable pour dyscalculie |
| Hérold (2012) `hal-01780008` | EIAH adaptatif pour entiers relatifs avec profils d'apprenants |
| Luengo (2009) `hal-00699802` | Rétroactions épistémiques progressives dans les EIAH |
| Le Vinh Thai (2017) `tel-01579410` | Guidage progressif et séquentiel |
| Fouchet-Isambard & Millon Faure (2025) `hal-05361521` | Typologie des erreurs pour feedbacks adaptatifs en maths |

## Stack technique

- Vanilla HTML/CSS/JS (aucun framework)
- Supabase (base de données + auth + realtime)
- Déploiement : Vercel via GitHub

## Structure des fichiers

```
entiers-relatifs/
├── index.html              # SPA principale (login + élève + enseignant)
├── tbi.html                # Mode tableau blanc interactif
├── css/
│   └── style.css
├── js/
│   ├── config.js           # ← À REMPLIR avec vos clés Supabase
│   ├── db.js               # Couche d'accès Supabase
│   ├── droite-num.js       # Composant droite numérique SVG
│   ├── remediation.js      # Remédiation socratique
│   └── app.js              # Logique SPA
└── supabase-schema.sql     # Schéma à exécuter dans Supabase
```

## Mise en place

### 1. Supabase

1. Créer un projet sur https://supabase.com
2. Dans **SQL Editor**, coller et exécuter `supabase-schema.sql`
3. Récupérer **Project URL** et **anon key** dans Settings > API

### 2. Configuration

Ouvrir `js/config.js` et remplacer les placeholders :

```javascript
const SUPABASE_URL = 'https://VOTRE_URL.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_ANON_KEY';
```

### 3. Déploiement Vercel

```bash
# Pousser sur GitHub, puis connecter le repo à Vercel
# Pas de build step — déploiement direct du dossier racine
```

## Utilisation

### Enseignant

1. Créer un compte (bouton "Créer un compte" à la connexion)
2. Créer une classe → noter le **code d'accès** à 6 lettres
3. Créer des exercices (manuel ou aléatoire par niveau)
4. Assigner les exercices à la classe
5. Onglet "Résultats" → suivi temps réel
6. Bouton "TBI" → ouvre le mode tableau blanc sur un nouvel onglet

### Élève

1. Saisir le code classe + son prénom
2. Choisir un exercice assigné
3. Estimer la réponse, la saisir et valider
4. Si erreur : indices socratiques progressifs (3 niveaux)
5. La droite numérique est toujours visible comme aide visuelle

### Mode TBI

- Affiche l'énoncé en grand pour la projection
- Réponses des élèves apparaissent en temps réel (cartes colorées)
- Bouton "Révéler la réponse" → affiche le résultat + animation droite numérique
- Barre de progression collective visible

## Remédiation socratique

Quand l'élève se trompe, 3 niveaux d'indices progressifs selon le **type d'erreur détecté** :

| Type d'erreur | Description |
|---|---|
| `depart_zero` | Parti de 0 au lieu de A |
| `mauvais_sens` | Bonne amplitude, mauvaise direction |
| `mauvais_compte` | Bon sens, erreur de comptage |
| `inversion_ab` | A et B inversés |
| `signe_a` | Signe de A mal interprété |
| `general` | Erreur non identifiable |

Après 3 tentatives infructueuses : révélation de la réponse avec explication.

## Niveaux de difficulté

| Niveau | Description |
|---|---|
| 1 | Entiers positifs 0–10 |
| 2 | Résultat toujours positif |
| 3 | Entiers relatifs complets |
| 4 | Libre (enseignant choisit A et B) |
