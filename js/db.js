// ============================================================
// db.js — Couche d'accès Supabase
// ============================================================

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- AUTH (enseignant) ----------------------------------------

async function loginEnseignant(email, password) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

async function logoutEnseignant() {
  await _sb.auth.signOut();
}

async function getCurrentUser() {
  const { data } = await _sb.auth.getUser();
  return data?.user ?? null;
}

async function signupEnseignant(email, password) {
  const { data, error } = await _sb.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

// ---- CLASSES --------------------------------------------------

async function createClasse(nom, enseignantId) {
  // Génère un code d'accès de 6 lettres majuscules
  const code = Array.from({ length: 6 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]
  ).join('');
  const { data, error } = await _sb.from('er_classes')
    .insert({ nom, code_acces: code, enseignant_id: enseignantId })
    .select().single();
  if (error) throw error;
  return data;
}

async function getClassesByEnseignant(enseignantId) {
  const { data, error } = await _sb.from('er_classes')
    .select('*')
    .eq('enseignant_id', enseignantId)
    .order('created_at');
  if (error) throw error;
  return data;
}

async function getClasseByCode(code) {
  const { data, error } = await _sb.from('er_classes')
    .select('*')
    .eq('code_acces', code.toUpperCase())
    .single();
  if (error) return null;
  return data;
}

// ---- ÉLÈVES --------------------------------------------------

async function getOrCreateEleve(nom, classeId) {
  // Cherche d'abord un élève existant
  const { data: existing } = await _sb.from('er_eleves')
    .select('*')
    .eq('nom', nom.trim())
    .eq('classe_id', classeId)
    .single();
  if (existing) return existing;

  // Crée l'élève
  const { data, error } = await _sb.from('er_eleves')
    .insert({ nom: nom.trim(), classe_id: classeId })
    .select().single();
  if (error) throw error;
  return data;
}

async function getElevesByClasse(classeId) {
  const { data, error } = await _sb.from('er_eleves')
    .select('*')
    .eq('classe_id', classeId)
    .order('nom');
  if (error) throw error;
  return data;
}

// ---- EXERCICES -----------------------------------------------

async function createExercice(payload) {
  const { data, error } = await _sb.from('er_exercices')
    .insert(payload)
    .select().single();
  if (error) throw error;
  return data;
}

async function getExercicesByEnseignant(enseignantId) {
  const { data, error } = await _sb.from('er_exercices')
    .select('*')
    .eq('enseignant_id', enseignantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function deleteExercice(id) {
  const { error } = await _sb.from('er_exercices').delete().eq('id', id);
  if (error) throw error;
}

// ---- ASSIGNATIONS --------------------------------------------

async function assignerExercice(exerciceId, classeId) {
  const { data, error } = await _sb.from('er_assignations')
    .upsert({ exercice_id: exerciceId, classe_id: classeId, active: true },
             { onConflict: 'exercice_id,classe_id' })
    .select().single();
  if (error) throw error;
  return data;
}

async function desassignerExercice(exerciceId, classeId) {
  const { error } = await _sb.from('er_assignations')
    .update({ active: false })
    .eq('exercice_id', exerciceId)
    .eq('classe_id', classeId);
  if (error) throw error;
}

async function getExercicesAssignesAClasse(classeId) {
  const { data, error } = await _sb.from('er_assignations')
    .select('*, exercices(*)')
    .eq('classe_id', classeId)
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(a => ({ ...a.exercices, assignation_id: a.id }));
}

// ---- RÉSULTATS -----------------------------------------------

async function soumettreResultat(payload) {
  // Vérifie si un résultat existe déjà pour cet élève+exercice
  const { data: existing } = await _sb.from('er_resultats')
    .select('id, nb_tentatives, nb_indices')
    .eq('exercice_id', payload.exercice_id)
    .eq('eleve_id', payload.eleve_id)
    .single();

  if (existing) {
    // Mise à jour : incrémente tentatives, garde le max d'indices
    const { data, error } = await _sb.from('er_resultats')
      .update({
        reponse: payload.reponse,
        correct: payload.correct,
        nb_tentatives: existing.nb_tentatives + 1,
        nb_indices: Math.max(existing.nb_indices, payload.nb_indices),
        temps_secondes: payload.temps_secondes
      })
      .eq('id', existing.id)
      .select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await _sb.from('er_resultats')
      .insert(payload)
      .select().single();
    if (error) throw error;
    return data;
  }
}

async function getResultatsByClasse(classeId) {
  // Récupère tous les résultats des élèves de la classe
  const eleves = await getElevesByClasse(classeId);
  const eleveIds = eleves.map(e => e.id);
  if (eleveIds.length === 0) return [];

  const { data, error } = await _sb.from('er_resultats')
    .select('*, exercices(titre, terme_a, terme_b, operateur), eleves(nom)')
    .in('eleve_id', eleveIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getResultatsByExercice(exerciceId) {
  const { data, error } = await _sb.from('er_resultats')
    .select('*, eleves(nom)')
    .eq('exercice_id', exerciceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ---- REALTIME ------------------------------------------------

/**
 * Écoute les nouveaux résultats en temps réel pour une classe.
 * @param {string} classeId
 * @param {function} callback - appelé à chaque changement
 * @returns {object} subscription (appeler .unsubscribe() pour arrêter)
 */
function subscribeResultats(classeId, callback) {
  return _sb.channel(`resultats-${classeId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'er_resultats' },
      payload => callback(payload)
    )
    .subscribe();
}

function subscribeAssignations(classeId, callback) {
  return _sb.channel(`assignations-${classeId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'er_assignations',
        filter: `classe_id=eq.${classeId}` },
      payload => callback(payload)
    )
    .subscribe();
}
