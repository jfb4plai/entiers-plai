-- ============================================================
-- Entiers Relatifs — Schéma Supabase (projet Flashfwb)
-- Préfixe er_ pour éviter les conflits avec les autres apps
-- Fondements RISS : Hérold (2012) hal-01780008
-- ============================================================

-- Classes
create table if not exists public.er_classes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  code_acces text unique not null,
  enseignant_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Élèves (sans compte auth — identification par nom + code classe)
create table if not exists public.er_eleves (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  classe_id uuid references public.er_classes(id) on delete cascade,
  created_at timestamptz default now(),
  unique(nom, classe_id)
);

-- Exercices
create table if not exists public.er_exercices (
  id uuid primary key default gen_random_uuid(),
  titre text,
  terme_a integer not null,
  terme_b integer not null,
  operateur text not null default '+' check (operateur in ('+', '-')),
  niveau integer not null default 1 check (niveau between 1 and 4),
  enseignant_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Assignations (exercice → classe)
create table if not exists public.er_assignations (
  id uuid primary key default gen_random_uuid(),
  exercice_id uuid references public.er_exercices(id) on delete cascade,
  classe_id uuid references public.er_classes(id) on delete cascade,
  active boolean default true,
  created_at timestamptz default now(),
  unique(exercice_id, classe_id)
);

-- Résultats par élève
create table if not exists public.er_resultats (
  id uuid primary key default gen_random_uuid(),
  exercice_id uuid references public.er_exercices(id) on delete cascade,
  eleve_id uuid references public.er_eleves(id) on delete cascade,
  reponse integer,
  correct boolean,
  nb_tentatives integer default 1,
  nb_indices integer default 0,
  temps_secondes integer,
  created_at timestamptz default now()
);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
alter table public.er_classes enable row level security;
alter table public.er_eleves enable row level security;
alter table public.er_exercices enable row level security;
alter table public.er_assignations enable row level security;
alter table public.er_resultats enable row level security;

-- er_classes : lecture publique (besoin du code classe pour rejoindre)
create policy "er_classes_select" on public.er_classes for select using (true);
create policy "er_classes_insert" on public.er_classes for insert with check (auth.uid() = enseignant_id);
create policy "er_classes_update" on public.er_classes for update using (auth.uid() = enseignant_id);
create policy "er_classes_delete" on public.er_classes for delete using (auth.uid() = enseignant_id);

-- er_eleves : lecture/écriture publique (les élèves s'inscrivent sans compte)
create policy "er_eleves_select" on public.er_eleves for select using (true);
create policy "er_eleves_insert" on public.er_eleves for insert with check (true);

-- er_exercices : lecture publique, gestion par l'enseignant propriétaire
create policy "er_exercices_select" on public.er_exercices for select using (true);
create policy "er_exercices_insert" on public.er_exercices for insert with check (auth.uid() = enseignant_id);
create policy "er_exercices_update" on public.er_exercices for update using (auth.uid() = enseignant_id);
create policy "er_exercices_delete" on public.er_exercices for delete using (auth.uid() = enseignant_id);

-- er_assignations : lecture publique, gestion par l'enseignant
create policy "er_assignations_select" on public.er_assignations for select using (true);
create policy "er_assignations_insert" on public.er_assignations for insert with check (
  exists (select 1 from public.er_exercices where id = exercice_id and enseignant_id = auth.uid())
);
create policy "er_assignations_update" on public.er_assignations for update using (
  exists (select 1 from public.er_exercices where id = exercice_id and enseignant_id = auth.uid())
);
create policy "er_assignations_delete" on public.er_assignations for delete using (
  exists (select 1 from public.er_exercices where id = exercice_id and enseignant_id = auth.uid())
);

-- er_resultats : lecture/écriture publique (les élèves soumettent sans compte)
create policy "er_resultats_select" on public.er_resultats for select using (true);
create policy "er_resultats_insert" on public.er_resultats for insert with check (true);
create policy "er_resultats_update" on public.er_resultats for update using (true);

-- ============================================================
-- Realtime (pour le dashboard enseignant en direct)
-- ============================================================
alter publication supabase_realtime add table public.er_resultats;
alter publication supabase_realtime add table public.er_assignations;
