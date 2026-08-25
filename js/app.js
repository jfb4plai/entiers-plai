// ============================================================
// app.js — Logique SPA principale
// ============================================================

// ---- État global --------------------------------------------
const state = {
  role: null,           // 'enseignant' | 'eleve'
  user: null,           // Supabase user (enseignant) | objet élève
  classe: null,         // objet classe courant
  exercices: [],        // exercices de l'enseignant
  taches: [],           // tâches de l'enseignant
  tacheActive: null,    // tâche en cours d'édition (enseignant)
  tacheCourante: null,  // tâche en cours (élève)
  tacheIndex: 0,        // index exercice courant dans la tâche (élève)
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
  // Arrivée via QR code (?code=XXXXXX) : va directement au formulaire
  // élève avec le code pré-rempli, il ne reste que le prénom à saisir.
  const codeScan = new URLSearchParams(location.search).get('code');
  if (codeScan) {
    showView('view-login-eleve');
    document.getElementById('el-code').value = codeScan.toUpperCase();
    document.getElementById('el-nom').focus();
    return;
  }

  onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      showView('view-recovery');
    }
  });

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

// Mot de passe oublié
document.getElementById('btn-forgot').addEventListener('click', () => {
  document.getElementById('ens-pwd-group').classList.add('hidden');
  document.getElementById('btn-submit-login').classList.add('hidden');
  document.getElementById('btn-send-reset').classList.remove('hidden');
  document.getElementById('btn-signup').classList.add('hidden');
  document.getElementById('btn-forgot').classList.add('hidden');
  document.getElementById('btn-cancel-reset').classList.remove('hidden');
  document.getElementById('ens-login-error').textContent = '';
});

document.getElementById('btn-cancel-reset').addEventListener('click', () => {
  document.getElementById('ens-pwd-group').classList.remove('hidden');
  document.getElementById('btn-submit-login').classList.remove('hidden');
  document.getElementById('btn-send-reset').classList.add('hidden');
  document.getElementById('btn-signup').classList.remove('hidden');
  document.getElementById('btn-forgot').classList.remove('hidden');
  document.getElementById('btn-cancel-reset').classList.add('hidden');
  document.getElementById('ens-login-error').textContent = '';
});

document.getElementById('btn-send-reset').addEventListener('click', async () => {
  const email = document.getElementById('ens-email').value.trim();
  const err = document.getElementById('ens-login-error');
  if (!email) {
    err.style.color = 'red';
    err.textContent = 'Entrez votre email.';
    return;
  }
  try {
    await sendPasswordReset(email);
    err.style.color = 'green';
    err.textContent = 'Email envoyé ! Vérifiez votre boîte mail.';
  } catch (ex) {
    err.style.color = 'red';
    err.textContent = ex.message;
  }
});

// Nouveau mot de passe (après lien de réinitialisation)
document.getElementById('form-recovery').addEventListener('submit', async e => {
  e.preventDefault();
  const password = document.getElementById('rec-password').value;
  const err = document.getElementById('rec-error');
  err.textContent = '';
  if (password.length < 6) {
    err.textContent = '6 caractères minimum.';
    return;
  }
  try {
    await updatePassword(password);
    state.user = await getCurrentUser();
    state.role = 'enseignant';
    await chargerDashboardEnseignant();
  } catch (ex) {
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
    const taches = await getTachesAssigneesAClasse(state.classe.id);
    state.taches = taches;
    if (taches.length === 0) {
      liste.innerHTML = '<p class="empty">Aucune tâche assignée pour le moment.</p>';
      return;
    }
    liste.innerHTML = '';
    taches.forEach(t => {
      const nbEx = t.exercices?.length || 0;
      const card = document.createElement('div');
      card.className = 'exercice-card';
      card.innerHTML = `
        <div>
          <div class="ex-titre">${t.titre}</div>
          <div class="ex-niveau">${nbEx} exercice${nbEx !== 1 ? 's' : ''}</div>
        </div>
        <button class="btn-primary" onclick="demarrerTache('${t.id}')">Commencer</button>
      `;
      liste.appendChild(card);
    });
  } catch (err) {
    liste.innerHTML = '<p class="error">Erreur de chargement.</p>';
  }
}

function demarrerTache(tacheId) {
  const tache = state.taches.find(t => t.id === tacheId);
  if (!tache || !tache.exercices?.length) {
    alert('Cette tâche ne contient aucun exercice.');
    return;
  }
  state.tacheCourante = tache;
  state.tacheIndex = 0;
  demarrerExerciceDeTache();
}

function demarrerExerciceDeTache() {
  const ex = state.tacheCourante.exercices[state.tacheIndex];
  if (!ex) return;
  state.exerciceCourant = ex;
  state.eleve = { tentatives: 0, indices: 0, debut: Date.now(), exerciceTermine: false };
  afficherExercice(ex);
  mettreAJourProgressionTache();
}

function mettreAJourProgressionTache() {
  const bar = document.getElementById('tache-progress-bar');
  if (!state.tacheCourante) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const total = state.tacheCourante.exercices.length;
  const current = state.tacheIndex + 1;
  const pct = Math.round((state.tacheIndex / total) * 100);
  document.getElementById('tache-progress-label').textContent =
    `${state.tacheCourante.titre} — Exercice ${current}/${total}`;
  document.getElementById('tache-progress-fill').style.width = pct + '%';
  // Points de progression
  const dots = document.getElementById('tache-dots');
  dots.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const d = document.createElement('div');
    d.style.cssText = `width:10px; height:10px; border-radius:50%; background:${
      i < state.tacheIndex ? '#16a34a' : i === state.tacheIndex ? '#2563eb' : '#d1d5db'
    };`;
    dots.appendChild(d);
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
  if (state.tacheCourante) {
    state.tacheIndex++;
    if (state.tacheIndex < state.tacheCourante.exercices.length) {
      // Exercice suivant dans la tâche
      demarrerExerciceDeTache();
    } else {
      // Tâche terminée
      state.tacheCourante = null;
      state.tacheIndex = 0;
      document.getElementById('tache-progress-bar').classList.add('hidden');
      showView('view-eleve-accueil');
    }
  } else {
    showView('view-eleve-accueil');
  }
});

document.getElementById('btn-el-retour').addEventListener('click', () => {
  state.tacheCourante = null;
  state.tacheIndex = 0;
  document.getElementById('tache-progress-bar').classList.add('hidden');
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
  if (tab === 'tab-taches') chargerTaches();
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
// Génère (ou régénère) le QR code permettant à un élève de rejoindre
// la classe directement, sans taper le code d'accès à la main —
// utile pour les élèves dyslexiques/dyspraxiques pour qui la saisie
// manuelle d'un code à 6 lettres est une friction inutile.
function afficherQRClasse(containerId, code) {
  const container = document.getElementById(containerId);
  if (!container || !code) return;
  container.innerHTML = '';
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}index.html?code=${code}`;
  new QRCode(container, {
    text: url,
    width: 120,
    height: 120,
    colorDark: '#111827',
    colorLight: '#ffffff'
  });
}

async function chargerClasse() {
  const infoBox = document.getElementById('classe-info-box');
  const elevesSection = document.getElementById('eleves-section');

  if (!state.classe) {
    // Pas encore de classe : cacher info + élèves, garder le formulaire visible
    if (infoBox) infoBox.classList.add('hidden');
    if (elevesSection) elevesSection.classList.add('hidden');
    return;
  }

  // Classe existante : tout afficher
  if (infoBox) infoBox.classList.remove('hidden');
  if (elevesSection) elevesSection.classList.remove('hidden');

  document.getElementById('classe-display-nom').textContent = state.classe.nom;
  document.getElementById('classe-display-code').textContent = state.classe.code_acces;
  afficherQRClasse('classe-qr', state.classe.code_acces);

  const eleves = await getElevesByClasse(state.classe.id);
  const ul = document.getElementById('liste-eleves');
  ul.innerHTML = '';
  if (eleves.length === 0) {
    ul.innerHTML = '<li class="empty">Aucun élève connecté pour le moment.</li>';
    return;
  }
  eleves.forEach(el => {
    const li = document.createElement('li');
    li.textContent = el.nom;
    ul.appendChild(li);
  });
}

// --- Tâches ---
async function chargerTaches() {
  const liste = document.getElementById('ens-liste-taches');
  liste.innerHTML = '<p class="loading">Chargement...</p>';
  const taches = await getTachesByEnseignant(state.user.id);
  state.taches = taches;
  // Mettre à jour le select dans l'éditeur de tâche
  mettreAJourSelectExercices();
  if (taches.length === 0) {
    liste.innerHTML = '<p class="empty">Aucune tâche. Créez-en une ci-dessus.</p>';
    return;
  }
  liste.innerHTML = '';
  taches.forEach(t => {
    const item = document.createElement('div');
    item.className = 'exercice-item';
    const nbEx = t.exercices?.length || 0;
    item.innerHTML = `
      <div>
        <strong>${t.titre}</strong>
        <span class="badge" style="background:#ede9fe; color:#7c3aed;">${nbEx} exercice${nbEx !== 1 ? 's' : ''}</span>
      </div>
      <div class="item-actions">
        <button class="btn-sm btn-assign" onclick="ouvrirEditeurTache('${t.id}')">Éditer</button>
        <button class="btn-sm btn-assign" onclick="assignerTacheId('${t.id}')">Assigner</button>
        <button class="btn-sm btn-tbi" onclick="ouvrirTBITacheId('${t.id}')">TBI</button>
        <button class="btn-sm btn-danger" onclick="supprimerTache('${t.id}')">Supprimer</button>
      </div>
    `;
    liste.appendChild(item);
  });
}

function mettreAJourSelectExercices() {
  const sel = document.getElementById('select-add-exercice');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Choisir un exercice à ajouter —</option>';
  state.exercices.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex.id;
    opt.textContent = ex.titre || `${ex.terme_a} ${ex.operateur} ${ex.terme_b}`;
    sel.appendChild(opt);
  });
}

function ouvrirEditeurTache(tacheId) {
  state.tacheActive = state.taches.find(t => t.id === tacheId);
  if (!state.tacheActive) return;
  const editeur = document.getElementById('tache-editeur');
  document.getElementById('tache-editeur-titre').textContent = state.tacheActive.titre;
  editeur.classList.remove('hidden');
  editeur.scrollIntoView({ behavior: 'smooth', block: 'start' });
  rafraichirExercicesTache();
}

function fermerEditeurTache() {
  document.getElementById('tache-editeur').classList.add('hidden');
  state.tacheActive = null;
}

function rafraichirExercicesTache() {
  const liste = document.getElementById('tache-exercices-liste');
  const exos = state.tacheActive?.exercices || [];
  if (exos.length === 0) {
    liste.innerHTML = '<p class="empty">Aucun exercice dans cette tâche.</p>';
    return;
  }
  liste.innerHTML = '';
  exos.forEach((ex, idx) => {
    const row = document.createElement('div');
    row.className = 'exercice-item';
    row.style.cssText = 'margin-bottom:8px; padding:10px 14px;';
    row.innerHTML = `
      <div>
        <span style="color:#9ca3af; margin-right:8px; font-weight:700;">${idx + 1}.</span>
        <strong>${ex.titre || `${ex.terme_a} ${ex.operateur} ${ex.terme_b}`}</strong>
        <span class="badge niveau-${ex.niveau}">N${ex.niveau}</span>
      </div>
      <button class="btn-sm btn-danger" onclick="retirerExoTache('${ex.id}')">Retirer</button>
    `;
    liste.appendChild(row);
  });
}

async function ajouterExoATache() {
  if (!state.tacheActive) return;
  const sel = document.getElementById('select-add-exercice');
  const exerciceId = sel.value;
  if (!exerciceId) return;
  const ordre = state.tacheActive.exercices?.length || 0;
  try {
    await ajouterExerciceATache(state.tacheActive.id, exerciceId, ordre);
    await chargerTaches();
    // Rouvrir l'éditeur sur la même tâche
    ouvrirEditeurTache(state.tacheActive.id);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function retirerExoTache(exerciceId) {
  if (!state.tacheActive) return;
  try {
    await retirerExerciceDeTache(state.tacheActive.id, exerciceId);
    await chargerTaches();
    ouvrirEditeurTache(state.tacheActive.id);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function assignerTacheId(tacheId) {
  if (!state.classe) {
    alert('Créez d\'abord une classe dans l\'onglet "Ma classe".');
    return;
  }
  try {
    await assignerTache(tacheId, state.classe.id);
    const t = state.taches.find(t => t.id === tacheId);
    alert(`Tâche "${t?.titre}" assignée à "${state.classe.nom}" !`);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function assignerTacheActive() {
  if (state.tacheActive) await assignerTacheId(state.tacheActive.id);
}

function ouvrirTBITacheId(tacheId) {
  window.open(`tbi.html?tache=${tacheId}&classe=${state.classe?.id || ''}`, '_blank');
}
function ouvrirTBITache() {
  if (state.tacheActive) ouvrirTBITacheId(state.tacheActive.id);
}

async function supprimerTache(id) {
  if (!confirm('Supprimer cette tâche ?')) return;
  await deleteTache(id);
  fermerEditeurTache();
  await chargerTaches();
}

// Créer une tâche
document.getElementById('form-create-tache').addEventListener('submit', async e => {
  e.preventDefault();
  const titre = document.getElementById('tache-titre').value.trim();
  if (!titre) return;
  try {
    await createTache(titre, null, state.user.id);
    e.target.reset();
    await chargerTaches();
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
});

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
