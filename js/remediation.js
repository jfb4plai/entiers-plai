// ============================================================
// remediation.js — Remédiation socratique progressive
//
// Fondements RISS :
//   - Luengo (2009) hal-00699802 : rétroactions épistémiques dans les EIAH
//   - Le Vinh Thai (2017) tel-01579410 : guidage progressif et séquentiel
//   - Fouchet-Isambard & Millon Faure (2025) hal-05361521 :
//     typologie des erreurs pour feedbacks adaptatifs en maths
//
// Principe : 3 niveaux d'indices progressifs, jamais la réponse directe
// avant que l'élève ait épuisé ses tentatives.
// ============================================================

/**
 * Détecte le type d'erreur à partir de la réponse de l'élève.
 * @param {number} a - Terme A
 * @param {number} b - Terme B
 * @param {string} op - Opérateur ('+' ou '-')
 * @param {number} studentAnswer - Réponse de l'élève
 * @returns {string} Type d'erreur
 */
function analyzeError(a, b, op, studentAnswer) {
  const bEff = op === '+' ? b : -b;   // déplacement effectif sur la droite
  const correct = a + bEff;

  // Type 1 : l'élève est parti de 0 au lieu de A
  if (studentAnswer === bEff || studentAnswer === b) return 'depart_zero';

  // Type 2 : bonne amplitude, mauvais sens (direction inversée)
  if (studentAnswer === a - bEff) return 'mauvais_sens';

  // Type 3 : bon sens, amplitude légèrement erronée (erreur de comptage)
  const dirCorrecte = Math.sign(bEff);
  const dirEleve = Math.sign(studentAnswer - a);
  if (dirEleve === dirCorrecte && Math.abs(studentAnswer - correct) >= 1 && Math.abs(studentAnswer - correct) <= 3) {
    return 'mauvais_compte';
  }

  // Type 4 : inversion A et B (surtout pour la soustraction)
  if (op === '-' && studentAnswer === b - a) return 'inversion_ab';

  // Type 5 : signe de A erroné
  if (studentAnswer === -a + bEff) return 'signe_a';

  return 'general';
}

/**
 * Génère les 3 indices socratiques selon le type d'erreur.
 * Chaque indice est un objet { emoji, texte }.
 */
function buildHints(a, b, op, errorType) {
  const bEff = op === '+' ? b : -b;
  const direction = bEff > 0 ? 'droite' : 'gauche';
  const dirSymbol = bEff > 0 ? '&rarr;' : '&larr;';
  const bDisplay = op === '+' ? (b >= 0 ? `+${b}` : `${b}`) : (b >= 0 ? `-${b}` : `+${Math.abs(b)}`);

  const hintSets = {
    depart_zero: [
      { emoji: '❓', texte: `D'où part-on dans cette opération ? Est-ce toujours de zéro ?` },
      { emoji: '💡', texte: `On ne part pas de zéro. On part de <strong>A = ${a}</strong>. Repère A sur la droite d'exécution.` },
      { emoji: '🎯', texte: `Commence en <strong>${a}</strong> sur la droite d'exécution. Depuis là, déplace-toi de <strong>${Math.abs(bEff)}</strong> cases vers la <strong>${direction} ${dirSymbol}</strong>.` }
    ],
    mauvais_sens: [
      { emoji: '❓', texte: `Regarde bien la valeur effective du déplacement. Dans quel sens faut-il aller ?` },
      { emoji: '💡', texte: `Un déplacement <strong>positif</strong> va vers la droite &rarr;. Un déplacement <strong>négatif</strong> va vers la gauche &larr;. Ici, le déplacement est <strong>${bDisplay}</strong>.` },
      { emoji: '🎯', texte: `${bEff > 0 ? `Le déplacement est positif (${bDisplay}) : depuis A = ${a}, va vers la <strong>droite &rarr;</strong>.` : `Le déplacement est négatif (${bDisplay}) : depuis A = ${a}, va vers la <strong>gauche &larr;</strong>.`}` }
    ],
    mauvais_compte: [
      { emoji: '❓', texte: `Tu pars du bon endroit et tu vas dans le bon sens ! Mais combien de cases exactement ?` },
      { emoji: '💡', texte: `La valeur du déplacement indique le nombre exact de cases à parcourir. |${bDisplay}| = <strong>${Math.abs(bEff)}</strong> cases.` },
      { emoji: '🎯', texte: `Depuis A = ${a}, compte exactement <strong>${Math.abs(bEff)}</strong> cases vers la <strong>${direction} ${dirSymbol}</strong>. Utilise les graduations.` }
    ],
    inversion_ab: [
      { emoji: '❓', texte: `Quel est le point de départ dans A ${op} B : c'est A ou B ?` },
      { emoji: '💡', texte: `Dans A ${op} B, on part toujours de <strong>A</strong>, et on se déplace de <strong>B</strong>. Pas l'inverse.` },
      { emoji: '🎯', texte: `Commence en <strong>A = ${a}</strong>, puis applique le déplacement <strong>${bDisplay}</strong>.` }
    ],
    signe_a: [
      { emoji: '❓', texte: `Vérifie la valeur de A. Est-elle positive ou négative ?` },
      { emoji: '💡', texte: `A = <strong>${a}</strong>. Repère ce point sur la droite numérique : il est ${a >= 0 ? 'à droite de zéro' : 'à gauche de zéro'}.` },
      { emoji: '🎯', texte: `Place-toi en <strong>${a}</strong> sur la droite d'exécution, puis déplace-toi de <strong>${bDisplay}</strong>.` }
    ],
    general: [
      { emoji: '❓', texte: `Reprends depuis le début. D'où part-on, et dans quelle direction va-t-on ?` },
      { emoji: '💡', texte: `Étape 1 : repère <strong>A = ${a}</strong> sur la droite. Étape 2 : déplace-toi de <strong>${bDisplay}</strong> cases.` },
      { emoji: '🎯', texte: `Depuis <strong>${a}</strong>, déplace-toi de <strong>${Math.abs(bEff)}</strong> cases vers la <strong>${direction} ${dirSymbol}</strong>. Où arrives-tu ?` }
    ]
  };

  return hintSets[errorType] || hintSets.general;
}

/**
 * Point d'entrée principal.
 * @param {number} a
 * @param {number} b
 * @param {string} op
 * @param {number} studentAnswer
 * @param {number} hintLevel - 0, 1 ou 2
 * @returns {{ emoji: string, texte: string, errorType: string }}
 */
function getHint(a, b, op, studentAnswer, hintLevel) {
  const errorType = analyzeError(a, b, op, studentAnswer);
  const hints = buildHints(a, b, op, errorType);
  const idx = Math.min(hintLevel, hints.length - 1);
  return { ...hints[idx], errorType };
}
