// ============================================================
// app.js — Logique SPA principale
// ============================================================

// ---- État global --------------------------------------------
const state = {
  role: null,           // 'enseignant' | 'eleve'
  user: null,           // Supabase user (enseignant) | objet élève
  classe: null,         // objet classe courant
  exercices: [],        // exercices de l'enseignant ou assignés à l'élève
  exerciceCourant: null,
  resultats: [],
  subscription: null,
  droite: null,         // instance DroiteNumerique

  // État exercice élève
  eleve: {
    tentatives: 0,
    indices: 0,
    debut: null,
    exerciceTermine: false
  }
};

// ---- Routing ------------------------------------------------
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  else console.error('Vue introuvable:', id);
}

// ---- Init ---------------------------------------------------
async function init() {
  const user = await getCurrentUser();
  if (user) {
    state.user = user;
    state.role = 'enseignant';
    await chargerDashboardEnseignant();
  } else {
    showView('view-login');
  }
}

// ============================================================
// LOGIN
// ============================================================

document.getElementById('btn-login-enseignant').addEventListener('click', () => {
  showView('view-login-enseignant');
});

document.getElementById('btn-login-eleve').addEventListener('click', () => {
  showView('view-login-eleve');
});

document.getElementById('btn-retour-login-ens').addEventListener('click', () => showView('view-login'));
document.getElementById('btn-retour-login-el').addEventListener('click', () => showView('view-login'));

// Connexion enseignant
document.getElementById('form-login-enseignant').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('ens-email').value.trim();
  const password = document.getElementById('ens-password').value;
  const btn = e.target.querySelector('button[type=submit]');
  const err = document.getElementById('ens-login-error');
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Connexion...';
  try {
    state.user = await loginEnseignant(email, password);
    state.role = 'enseignant';
    await chargerDashboardEnseignant();
  } catch (ex) {
    err.textContent = 'Email ou mot de passe incorrect.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }
});

// Inscription enseignant
document.getElementById('btn-signup').addEventListener('click', async () => {
  const email = document.getElementById('ens-email').value.trim();
  const password = document.getElementById('ens-password').value;
  const err = document.getElementById('ens-login-error');
  if (!email || password.length < 6) {
    err.textContent = 'Email valide et mot de passe (6+ chars) requis.';
    return;
  }
  try {
    await signupEnseignant(email, password);
    err.style.color = 'green';
    err.textContent = 'Compte créé ! Vérifiez votre email pour confirmer.';
  } catch (ex) {
    err.style.color = 'red';
    err.textContent = ex.message;
  }
});

// Connexion élève
document.getElementById('form-login-eleve').addEventListener('submit', async e => {
  e.preventDefault();
  const code = document.getElementById('el-code').value.trim().toUpperCase();
  const nom = document.getElementById('el-nom').value.trim();
  const btn = e.target.querySelector('button[type=submit]');
  const err = document.getElementById('el-login-error');
  err.textContent = '';
  if (!code || !nom) return;
  btn.disabled = true;
  btn.textContent = 'Connexion...';
  try {
    const classe = await getClasseByCode(code);
    if (!classe) throw new Error('Code classe introuvable.');
    const eleve = await getOrCreateEleve(nom, classe.id);
    state.role = 'eleve';
    state.user = eleve;
    state.classe = classe;
    // Persist session élève
    localStorage.setItem('eleve', JSON.stringify(eleve));
    localStorage.setItem('classe', JSON.stringify(classe));
    await chargerInterfaceEleve();
  } catch (ex) {
    err.textContent = ex.message || 'Erreur de connexion.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Rejoindre la classe';
  }
});

// ============================================================
// INTERFACE ÉLÈVE
// ============================================================

async function chargerInterfaceEleve() {
  showView('view-eleve-accueil');
  document.getElementById('el-bienvenue').textContent =
    `Bonjour ${state.user.nom} — Classe : ${state.classe.nom}`;
  await rafraichirExercicesEleve();

  // Écoute les nouvelles assignations en direct
  if (state.subscription) state.subscription.unsubscribe();
  state.subscription = subscribeAssignations(state.classe.id, async () => {
    await rafraichirExercicesEleve();
  });
}

async function rafraichirExercicesEleve() {
  const liste = document.getElementById('el-liste-exercices');
  liste.innerHTML = '<p class="loading">Chargement...</p>';
  try {
    const exos = await getExercicesAssignesAClasse(state.classe.id);
    state.exercices = exos;
    if (exos.length === 0) {
      liste.innerHTML = '<p class="empty">Aucun exercice assigné pour le moment.</p>';
      return;
    }
    liste.innerHTML = '';
    exos.forEach(ex => {
      const card = document.createElement('div');
      card.className = 'exercice-card';
      const niveauLabels = ['', 'Positifs (0-10)', 'Résultat positif', 'Entiers relatifs', 'Enchaîné'];
      card.innerHTML = `
        <div class="ex-titre">${ex.titre || `${ex.terme_a} ${ex.operateur} ${ex.terme_b}`}</div>
        <div class="ex-niveau">Niveau ${ex.niveau} — ${niveauLabels[ex.niveau] || ''}</div>
        <button class="btn-primary" onclick="demarrerExercice('${ex.id}')">Commencer</button>
      `;
      liste.appendChild(card);
    });
  } catch (err) {
    liste.innerHTML = '<p class="error">Erreur de chargement.</p>';
  }
}

function demarrerExercice(exerciceId) {
  const ex = state.exercices.find(e => e.id === exerciceId);
  if (!ex) return;
  state.exerciceCourant = ex;
  state.eleve = { tentatives: 0, indices: 0, debut: Date.now(), exerciceTermine: false };
  afficherExercice(ex);
}

function afficherExercice(ex) {
  showView('view-eleve-exercice');

  // Titre et opération
  document.getElementById('ex-enonce').innerHTML =
    `<span class="terme">${ex.terme_a}</span>
     <span class="operateur">${ex.operateur}</span>
     <span class="terme">${ex.terme_b}</span>
     <span class="egal">=</span>
     <input type="number" id="ex-reponse" class="input-reponse" placeholder="?" autocomplete="off">`;

  document.getElementById('ex-titre').textContent = ex.titre || 'Exercice';

  // Réinitialise la zone de rétroaction
  document.getElementById('ex-retro').innerHTML = '';
  document.getElementById('ex-retro').className = 'retro-zone';
  document.getElementById('btn-valider').disabled = false;
  document.getElementById('btn-valider').textContent = 'Valider';
  document.getElementById('btn-exercice-suivant').classList.add('hidden');

  // Focus sur le champ réponse
  setTimeout(() => document.getElementById('ex-reponse')?.focus(), 100);

  // Entrée clavier
  document.getElementById('ex-reponse')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') validerReponse();
  });

  // Droite numérique (sans résultat)
  if (!state.droite) {
    state.droite = new DroiteNumerique('dn-container', { showResult: false });
  }
  state.droite.showResult = false;
  state.droite.render(ex.terme_a, ex.terme_b, ex.operateur, false);
}

async function validerReponse() {
  if (state.eleve.exerciceTermine) return;
  const input = document.getElementById('ex-reponse');
  const valeur = parseInt(input?.value);
  if (isNaN(valeur)) {
    input?.focus();
    return;
  }

  const ex = state.exerciceCourant;
  const bEff = ex.operateur === '+' ? ex.terme_b : -ex.terme_b;
  const correct = ex.terme_a + bEff;
  const juste = valeur === correct;

  state.eleve.tentatives++;

  if (juste) {
    // Succès
    state.eleve.exerciceTermine = true;
    afficherRetro('correct',
      `<strong>Bravo !</strong> ${ex.terme_a} ${ex.operateur} ${ex.terme_b} = <strong>${correct}</strong>`);
    state.droite.render(ex.terme_a, ex.terme_b, ex.operateur, true);
    document.getElementById('btn-valider').disabled = true;
    document.getElementById('btn-exercice-suivant').classList.remove('hidden');
    await enregistrerResultat(ex, valeur, true);

  } else if (state.eleve.tentatives > 3) {
    // Épuisé les tentatives → révèle la réponse
    state.eleve.exerciceTermine = true;
    afficherRetro('revele',
      `La réponse est <strong>${correct}</strong>.<br>
       ${ex.terme_a} ${ex.operateur} ${ex.terme_b} = ${correct}.<br>
       <em>Observe la droite numérique pour comprendre le déplacement.</em>`);
    state.droite.render(ex.terme_a, ex.terme_b, ex.operateur, true);
    document.getElementById('btn-valider').disabled = true;
    document.getElementById('btn-exercice-suivant').classList.remove('hidden');
    await enregistrerResultat(ex, valeur, false);

  } else {
    // Indice socratique progressif
    const hint = getHint(ex.terme_a, ex.terme_b, ex.operateur, valeur, state.eleve.indices);
    state.eleve.indices++;
    afficherRetro('indice',
      `${hint.emoji} ${hint.texte}<br>
       <small class="hint-meta">Tentative ${state.eleve.tentatives}/3 — Indice ${state.eleve.indices}/3</small>`);
  }
}

function afficherRetro(type, html) {
  const zone = document.getElementById('ex-retro');
  zone.innerHTML = html;
  zone.className = `retro-zone retro-${type}`;
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function enregistrerResultat(ex, reponse, correct) {
  try {
    const temps = Math.round((Date.now() - state.eleve.debut) / 1000);
    await soumettreResultat({
      exercice_id: ex.id,
      eleve_id: state.user.id,
      reponse,
      correct,
      nb_tentatives: state.eleve.tentatives,
      nb_indices: state.eleve.indices,
      temps_secondes: temps
    });
  } catch (e) {
    console.error('Erreur enregistrement résultat:', e);
  }
}

document.getElementById('btn-valider').addEventListener('click', validerReponse);

document.getElementById('btn-exercice-suivant').addEventListener('click', () => {
  showView('view-eleve-accueil');
});

document.getElementById('btn-el-retour').addEventListener('click', () => {
  showView('view-eleve-accueil');
});

// ============================================================
// INTERFACE ENSEIGNANT
// ============================================================

async function chargerDashboardEnseignant() {
  showView('view-enseignant');
  document.getElementById('ens-email-display').textContent = state.user.email;
  await chargerClasses();
  afficherOnglet('tab-exercices');
}

// --- Onglets enseignant ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    afficherOnglet(btn.dataset.tab);
  });
});

function afficherOnglet(tab) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.getElementById(tab).classList.remove('hidden');
  if (tab === 'tab-exercices') chargerExercices();
  if (tab === 'tab-classe') chargerClasse();
  if (tab === 'tab-resultats') chargerResultats();
}

// --- Classes ---
async function chargerClasses() {
  const classes = await getClassesByEnseignant(state.user.id);
  if (classes.length > 0) {
    state.classe = classes[0];
    document.getElementById('ens-classe-nom').textContent = state.classe.nom;
    document.getElementById('ens-classe-code').textContent = state.classe.code_acces;
  }
  const select = document.getElementById('select-classe');
  select.innerHTML = '';
  classes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nom;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    state.classe = classes.find(c => c.id === select.value);
  });
  if (classes.length === 0) {
    document.getElementById('ens-classe-nom').textContent = '—';
    document.getElementById('ens-classe-code').textContent = '—';
  }
}

// Créer une classe
document.getElementById('form-create-classe').addEventListener('submit', async e => {
  e.preventDefault();
  const nom = document.getElementById('input-classe-nom').value.trim();
  if (!nom) return;
  try {
    const c = await createClasse(nom, state.user.id);
    state.classe = c;
    document.getElementById('input-classe-nom').value = '';
    await chargerClasses();
    afficherOnglet('tab-classe');
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
});

// --- Exercices ---
async function chargerExercices() {
  const liste = document.getElementById('ens-liste-exercices');
  liste.innerHTML = '<p class="loading">Chargement...</p>';
  const exos = await getExercicesByEnseignant(state.user.id);
  state.exercices = exos;
  if (exos.length === 0) {
    liste.innerHTML = '<p class="empty">Aucun exercice. Créez-en un ci-dessus.</p>';
    return;
  }
  liste.innerHTML = '';
  exos.forEach(ex => {
    const item = document.createElement('div');
    item.className = 'exercice-item';
    item.innerHTML = `
      <div>
        <strong>${ex.titre || `${ex.terme_a} ${ex.operateur} ${ex.terme_b}`}</strong>
        <span class="badge niveau-${ex.niveau}">N${ex.niveau}</span>
      </div>
      <div class="item-actions">
        <button class="btn-sm btn-assign" onclick="assignerExo('${ex.id}')">Assigner</button>
        <button class="btn-sm btn-tbi" onclick="ouvrirTBI('${ex.id}')">TBI</button>
        <button class="btn-sm btn-danger" onclick="supprimerExo('${ex.id}')">Supprimer</button>
      </div>
    `;
    liste.appendChild(item);
  });
}

// Créer un exercice
document.getElementById('form-create-exercice').addEventListener('submit', async e => {
  e.preventDefault();
  const titre = document.getElementById('ex-titre-input').value.trim();
  const a = parseInt(document.getElementById('ex-a').value);
  const b = parseInt(document.getElementById('ex-b').value);
  const op = document.getElementById('ex-op').value;
  const niveau = parseInt(document.getElementById('ex-niveau').value);
  if (isNaN(a) || isNaN(b)) return;
  try {
    await createExercice({ titre: titre || null, terme_a: a, terme_b: b, operateur: op, niveau, enseignant_id: state.user.id });
    e.target.reset();
    await chargerExercices();
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
});

// Générer exercice aléatoire
document.getElementById('btn-random-exo').addEventListener('click', async () => {
  const niveau = parseInt(document.getElementById('ex-niveau').value) || 1;
  let a, b, op = '+';
  switch (niveau) {
    case 1: a = rand(1, 10); b = rand(1, 10 - a); break;
    case 2: a = rand(-5, 10); b = rand(-5, 10); op = Math.random() > 0.5 ? '+' : '-'; break;
    case 3: a = rand(-12, 12); b = rand(-12, 12); op = Math.random() > 0.5 ? '+' : '-'; break;
    default: a = rand(-15, 15); b = rand(-15, 15); op = Math.random() > 0.5 ? '+' : '-';
  }
  document.getElementById('ex-a').value = a;
  document.getElementById('ex-b').value = b;
  document.getElementById('ex-op').value = op;
});

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function supprimerExo(id) {
  if (!confirm('Supprimer cet exercice ?')) return;
  await deleteExercice(id);
  await chargerExercices();
}

async function assignerExo(exerciceId) {
  if (!state.classe) {
    alert('Créez d\'abord une classe dans l\'onglet "Ma classe".');
    return;
  }
  try {
    await assignerExercice(exerciceId, state.classe.id);
    alert(`Exercice assigné à la classe "${state.classe.nom}" !`);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

function ouvrirTBI(exerciceId) {
  window.open(`tbi.html?exo=${exerciceId}&classe=${state.classe?.id || ''}`, '_blank');
}

// --- Classe ---
async function chargerClasse() {
  if (!state.classe) {
    document.getElementById('tab-classe').innerHTML =
      '<p>Créez une classe dans la section ci-dessus.</p>';
    return;
  }
  document.getElementById('classe-display-nom').textContent = state.classe.nom;
  document.getElementById('classe-display-code').textContent = state.classe.code_acces;

  const eleves = await getElevesByClasse(state.classe.id);
  const ul = document.getElementById('liste-eleves');
  ul.innerHTML = '';
  if (eleves.length === 0) {
    ul.innerHTML = '<li class="empty">Aucun élève connecté.</li>';
    return;
  }
  eleves.forEach(el => {
    const li = document.createElement('li');
    li.textContent = el.nom;
    ul.appendChild(li);
  });
}

// --- Résultats ---
async function chargerResultats() {
  if (!state.classe) {
    document.getElementById('resultats-container').innerHTML =
      '<p>Aucune classe sélectionnée.</p>';
    return;
  }
  const resultats = await getResultatsByClasse(state.classe.id);

  // Abonnement temps réel
  if (state.subscription) state.subscription.unsubscribe();
  state.subscription = subscribeResultats(state.classe.id, async () => {
    await chargerResultats();
  });

  afficherTableauResultats(resultats);
}

function afficherTableauResultats(resultats) {
  const container = document.getElementById('resultats-container');
  if (resultats.length === 0) {
    container.innerHTML = '<p class="empty">Aucun résultat pour le moment.</p>';
    return;
  }

  // Stats globales
  const nbCorrects = resultats.filter(r => r.correct).length;
  const tauxReussite = Math.round((nbCorrects / resultats.length) * 100);
  const moyTentatives = (resultats.reduce((s, r) => s + r.nb_tentatives, 0) / resultats.length).toFixed(1);
  const moyIndices = (resultats.reduce((s, r) => s + r.nb_indices, 0) / resultats.length).toFixed(1);

  container.innerHTML = `
    <div class="stats-bar">
      <div class="stat"><span class="stat-val">${resultats.length}</span><span class="stat-lbl">Réponses</span></div>
      <div class="stat"><span class="stat-val ${tauxReussite >= 70 ? 'ok' : 'warn'}">${tauxReussite}%</span><span class="stat-lbl">Réussite</span></div>
      <div class="stat"><span class="stat-val">${moyTentatives}</span><span class="stat-lbl">Moy. tentatives</span></div>
      <div class="stat"><span class="stat-val">${moyIndices}</span><span class="stat-lbl">Moy. indices</span></div>
    </div>
    <table class="resultats-table">
      <thead>
        <tr><th>Élève</th><th>Exercice</th><th>Réponse</th><th>Résultat</th><th>Tentatives</th><th>Indices</th><th>Temps</th></tr>
      </thead>
      <tbody>
        ${resultats.map(r => `
          <tr class="${r.correct ? 'row-ok' : 'row-err'}">
            <td>${r.eleves?.nom || '—'}</td>
            <td>${r.exercices?.titre || `${r.exercices?.terme_a} ${r.exercices?.operateur} ${r.exercices?.terme_b}`}</td>
            <td>${r.reponse ?? '—'}</td>
            <td>${r.correct ? '✓' : '✗'}</td>
            <td>${r.nb_tentatives}</td>
            <td>${r.nb_indices}</td>
            <td>${r.temps_secondes ? r.temps_secondes + 's' : '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

// --- Déconnexion ---
document.getElementById('btn-logout').addEventListener('click', async () => {
  await logoutEnseignant();
  state.user = null;
  state.role = null;
  state.classe = null;
  showView('view-login');
});

// ============================================================
// DÉMARRAGE
// ============================================================

// Vérifier session élève persistée
const savedEleve = localStorage.getItem('eleve');
const savedClasse = localStorage.getItem('classe');
if (savedEleve && savedClasse) {
  state.user = JSON.parse(savedEleve);
  state.classe = JSON.parse(savedClasse);
  state.role = 'eleve';
  chargerInterfaceEleve();
} else {
  init();
}
