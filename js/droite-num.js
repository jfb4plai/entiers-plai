// ============================================================
// droite-num.js — Composant droite numérique SVG
//
// Fondements RISS :
//   - Hirsch & Roditi (2023) hal-05188689 : le placement des nombres
//     sur la droite numérique est fondamental pour leur apprentissage
//   - Barrouillet et al. (2007) hal-01570674 : les troubles de
//     l'espace perturbent la représentation spatiale analogique
//     des nombres → la droite doit être lisible et non surchargée
//
// Affiche 3 droites superposées (comme Sim Maths) :
//   1. Valeur de A
//   2. Valeur de B (déplacement)
//   3. Exécution de l'opération
// ============================================================

class DroiteNumerique {
  /**
   * @param {string} containerId - ID du div conteneur
   * @param {object} options
   *   min {number}    - valeur min de la droite (défaut -15)
   *   max {number}    - valeur max de la droite (défaut 15)
   *   showResult {boolean} - afficher le point résultat (défaut true)
   *   compact {boolean}    - hauteur réduite pour mode TBI (défaut false)
   */
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.min = options.min ?? -15;
    this.max = options.max ?? 15;
    this.showResult = options.showResult ?? true;
    this.compact = options.compact ?? false;

    // Dimensions internes SVG (viewBox)
    // lineH doit laisser assez de place sous l'axe pour le label "0"
    // (tickH=10 + décalage 14 + hauteur de texte) sans quoi il est
    // rogné par le viewBox — cf. retour terrain mode TBI.
    this.W = 900;
    this.lineH = this.compact ? 84 : 88;
    this.paddingX = 20;

    this.a = 0;
    this.b = 0;
    this.op = '+';

    if (!this.container) {
      console.error(`DroiteNumerique: conteneur #${containerId} introuvable`);
      return;
    }
    this._buildDOM();
  }

  _buildDOM() {
    this.container.innerHTML = '';
    this.container.style.width = '100%';

    // Trois blocs : A, B, Exécution
    this._svgA = this._createSection('Valeur de A');
    this._svgB = this._createSection('Valeur de B (déplacement)');
    this._svgExec = this._createSection('Exécution');
  }

  _createSection(label) {
    const wrap = document.createElement('div');
    wrap.className = 'dn-section';

    const lbl = document.createElement('div');
    lbl.className = 'dn-label';
    lbl.textContent = label;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${this.W} ${this.lineH}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    wrap.appendChild(lbl);
    wrap.appendChild(svg);
    this.container.appendChild(wrap);
    return svg;
  }

  // Convertit une valeur en coordonnée X dans le SVG
  _x(val) {
    const range = this.max - this.min;
    return this.paddingX + ((val - this.min) / range) * (this.W - 2 * this.paddingX);
  }

  _drawAxis(svg, highlighted = null) {
    svg.innerHTML = '';
    const mid = this.lineH / 2 + 10;

    // Axe principal
    this._el(svg, 'line', {
      x1: this.paddingX, y1: mid,
      x2: this.W - this.paddingX, y2: mid,
      stroke: '#4b5563', 'stroke-width': 2
    });

    // Pointes d'axe
    this._el(svg, 'polygon', {
      points: `${this.W - this.paddingX},${mid} ${this.W - this.paddingX - 8},${mid - 4} ${this.W - this.paddingX - 8},${mid + 4}`,
      fill: '#4b5563'
    });

    // Graduations + labels
    for (let v = this.min; v <= this.max; v++) {
      const x = this._x(v);
      const isZero = v === 0;
      const isHighlighted = v === highlighted;
      const tickH = isZero ? 10 : 5;

      this._el(svg, 'line', {
        x1: x, y1: mid - tickH,
        x2: x, y2: mid + tickH,
        stroke: isHighlighted ? '#7c3aed' : (isZero ? '#111' : '#9ca3af'),
        'stroke-width': isZero ? 2 : 1
      });

      // Labels : tous les 2 si plage > 20, sinon tous
      const range = this.max - this.min;
      if (range <= 20 || v % 2 === 0 || isZero) {
        this._el(svg, 'text', {
          x, y: mid + tickH + 14,
          'text-anchor': 'middle',
          'font-size': 12,
          fill: isHighlighted ? '#7c3aed' : (isZero ? '#111' : '#6b7280'),
          'font-weight': isZero || isHighlighted ? 'bold' : 'normal'
        }, String(v));
      }
    }
  }

  _drawArrow(svg, from, to, color, label, yOff = 0) {
    if (from === to) return;
    const mid = this.lineH / 2 + 10;
    const x1 = this._x(from);
    const x2 = this._x(to);
    const y = mid - 18 - yOff;
    const dir = to > from ? 1 : -1;
    const asz = 8;

    // Ligne de flèche
    this._el(svg, 'line', {
      x1, y1: y, x2, y2: y,
      stroke: color, 'stroke-width': 3,
      'stroke-linecap': 'round'
    });

    // Pointe
    this._el(svg, 'polygon', {
      points: `${x2},${y} ${x2 - dir * asz},${y - 4} ${x2 - dir * asz},${y + 4}`,
      fill: color
    });

    // Label centré sur la flèche
    if (label) {
      const mx = (x1 + x2) / 2;
      // Fond blanc pour lisibilité
      this._el(svg, 'rect', {
        x: mx - 22, y: y - 20,
        width: 44, height: 16,
        fill: 'white', rx: 3, opacity: 0.85
      });
      this._el(svg, 'text', {
        x: mx, y: y - 8,
        'text-anchor': 'middle',
        'font-size': 13,
        fill: color,
        'font-weight': 'bold'
      }, label);
    }
  }

  _drawDot(svg, val, color, size = 8) {
    const mid = this.lineH / 2 + 10;
    this._el(svg, 'circle', {
      cx: this._x(val), cy: mid,
      r: size, fill: color,
      stroke: 'white', 'stroke-width': 2
    });
  }

  // Helper pour créer un élément SVG
  _el(parent, tag, attrs = {}, text = null) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== null) el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  /**
   * Met à jour l'affichage des trois droites.
   * @param {number} a
   * @param {number} b
   * @param {string} op - '+' ou '-'
   * @param {boolean} showResult - override showResult de l'instance
   */
  render(a, b, op = '+', showResult = null) {
    this.a = a;
    this.b = b;
    this.op = op;
    const displayResult = showResult ?? this.showResult;
    const bEff = op === '+' ? b : -b;
    const result = a + bEff;

    // --- Droite A ---
    this._drawAxis(this._svgA, a);
    if (a !== 0) {
      this._drawArrow(this._svgA, 0, a, '#2563eb', `A = ${a}`);
    }
    this._drawDot(this._svgA, a, '#2563eb');

    // --- Droite B (déplacement depuis 0) ---
    this._drawAxis(this._svgB, b);
    if (b !== 0) {
      const bLabel = op === '+' ? (b >= 0 ? `+${b}` : `${b}`) : (b >= 0 ? `-${b}` : `+${Math.abs(b)}`);
      this._drawArrow(this._svgB, 0, b, '#d97706', `B = ${bLabel}`);
    }
    this._drawDot(this._svgB, b, '#d97706');

    // --- Droite Exécution ---
    this._drawAxis(this._svgExec, displayResult ? result : null);
    // Point de départ A
    this._drawDot(this._svgExec, a, '#2563eb', 6);
    if (displayResult) {
      // Flèche de A vers résultat
      const bLabel = op === '+' ? (bEff >= 0 ? `+${Math.abs(bEff)}` : `${bEff}`) : (bEff >= 0 ? `+${bEff}` : `${bEff}`);
      this._drawArrow(this._svgExec, a, result, '#d97706', bLabel);
      // Point résultat
      this._drawDot(this._svgExec, result, '#7c3aed', 9);
      // Label résultat
      const mid = this.lineH / 2 + 10;
      this._el(this._svgExec, 'text', {
        x: this._x(result),
        y: mid - 35,
        'text-anchor': 'middle',
        'font-size': 14,
        fill: '#7c3aed',
        'font-weight': 'bold'
      }, `= ${result}`);
    } else {
      // Point d'interrogation (résultat caché)
      const mid = this.lineH / 2 + 10;
      const xA = this._x(a);
      this._el(this._svgExec, 'text', {
        x: xA + 40, y: mid - 25,
        'text-anchor': 'middle',
        'font-size': 18, fill: '#9ca3af',
        'font-weight': 'bold'
      }, '?');
    }
  }

  /** Révèle le résultat avec une animation CSS simple */
  revealResult() {
    this.showResult = true;
    this.render(this.a, this.b, this.op, true);
    // Clignotement du résultat
    const circles = this._svgExec.querySelectorAll('circle');
    circles.forEach(c => {
      c.style.animation = 'none';
      c.style.transition = 'r 0.3s ease';
    });
  }
}
