-- ============================================================
-- Migration : ajout du concept de Tâches
-- À coller dans SQL Editor de Flashfwb et exécuter
-- ============================================================

-- Tâches (groupes nommés d'exercices)
create table if not exists public.er_taches (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  description text,
  enseignant_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Exercices dans une tâche (avec ordre)
create table if not exists public.er_taches_exercices (
  id uuid primary key default gen_random_uuid(),
  tache_id uuid references public.er_taches(id) on delete cascade,
  exercice_id uuid references public.er_exercices(id) on delete cascade,
  ordre integer not null default 0,
  unique(tache_id, exercice_id)
);

-- Assignations de tâches à des classes
create table if not exists public.er_assignations_taches (
  id uuid primary key default gen_random_uuid(),
  tache_id uuid references public.er_taches(id) on delete cascade,
  classe_id uuid references public.er_classes(id) on delete cascade,
  active boolean default true,
  created_at timestamptz default now(),
  unique(tache_id, classe_id)
);

-- RLS
alter table public.er_taches enable row level security;
alter table public.er_taches_exercices enable row level security;
alter table public.er_assignations_taches enable row level security;

create policy "er_taches_select" on public.er_taches for select using (true);
create policy "er_taches_insert" on public.er_taches for insert with check (auth.uid() = enseignant_id);
create policy "er_taches_update" on public.er_taches for update using (auth.uid() = enseignant_id);
create policy "er_taches_delete" on public.er_taches for delete using (auth.uid() = enseignant_id);

create policy "er_taches_exercices_select" on public.er_taches_exercices for select using (true);
create policy "er_taches_exercices_insert" on public.er_taches_exercices for insert with check (
  exists (select 1 from public.er_taches where id = tache_id and enseignant_id = auth.uid())
);
create policy "er_taches_exercices_delete" on public.er_taches_exercices for delete using (
  exists (select 1 from public.er_taches where id = tache_id and enseignant_id = auth.uid())
);

create policy "er_assignations_taches_select" on public.er_assignations_taches for select using (true);
create policy "er_assignations_taches_insert" on public.er_assignations_taches for insert with check (
  exists (select 1 from public.er_taches where id = tache_id and enseignant_id = auth.uid())
);
create policy "er_assignations_taches_update" on public.er_assignations_taches for update using (
  exists (select 1 from public.er_taches where id = tache_id and enseignant_id = auth.uid())
);
create policy "er_assignations_taches_delete" on public.er_assignations_taches for delete using (
  exists (select 1 from public.er_taches where id = tache_id and enseignant_id = auth.uid())
);

-- Realtime pour les assignations de tâches
alter publication supabase_realtime add table public.er_assignations_taches;
