-- Legacy X website CMS — run in Supabase → SQL Editor. Safe to run more than once.

-- ── Tables ──

-- Single pieces of text (headlines, paragraphs, page titles…)
create table if not exists public.cms_blocks (
  key        text primary key,
  page       text not null,
  position   integer not null default 0,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

-- Repeatable lists (FAQs, cards, testimonials, events…)
create table if not exists public.cms_lists (
  key      text primary key,
  page     text not null,
  position integer not null default 0,
  fields   text[] not null default '{}'  -- field names in page order, for the editor
);

create table if not exists public.cms_items (
  id         uuid primary key default gen_random_uuid(),
  list_key   text not null references public.cms_lists (key) on delete cascade,
  tpl        integer not null default 0,
  sort       integer not null default 0,
  fields     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists cms_items_list_key_idx on public.cms_items (list_key, sort);

-- Who may edit content (matched on the signed-in user's email)
create table if not exists public.cms_admins (
  email text primary key
);

insert into public.cms_admins (email) values ('info@legacy3x.com') on conflict (email) do nothing;

-- ── Access rules ──

create or replace function public.is_cms_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cms_admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.cms_blocks enable row level security;
alter table public.cms_lists  enable row level security;
alter table public.cms_items  enable row level security;
alter table public.cms_admins enable row level security;

-- Content is public (it's on the website), so anyone may read it.
drop policy if exists "cms_blocks read" on public.cms_blocks;
create policy "cms_blocks read" on public.cms_blocks for select using (true);
drop policy if exists "cms_lists read" on public.cms_lists;
create policy "cms_lists read" on public.cms_lists for select using (true);
drop policy if exists "cms_items read" on public.cms_items;
create policy "cms_items read" on public.cms_items for select using (true);

-- Only admins may change content.
drop policy if exists "cms_blocks write" on public.cms_blocks;
create policy "cms_blocks write" on public.cms_blocks for all to authenticated
  using (public.is_cms_admin()) with check (public.is_cms_admin());
drop policy if exists "cms_items write" on public.cms_items;
create policy "cms_items write" on public.cms_items for all to authenticated
  using (public.is_cms_admin()) with check (public.is_cms_admin());

-- Signed-in users can only see their own admin row (used to check access).
drop policy if exists "cms_admins self" on public.cms_admins;
create policy "cms_admins self" on public.cms_admins for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

grant select on public.cms_blocks, public.cms_lists, public.cms_items to anon, authenticated;
grant insert, update, delete on public.cms_blocks, public.cms_items to authenticated;
grant select on public.cms_admins to authenticated;
grant execute on function public.is_cms_admin() to anon, authenticated;

-- ── Content (only inserted if not already present) ──

insert into public.cms_blocks (key, page, position, value) values
  ('about/meta/title', 'about', 191, 'About — Legacy X Jiu-Jitsu'),
  ('about/page-header/page-title', 'about', 22474, 'Built in Woodstock.<br/><em>Built to last.</em>'),
  ('about/page-header/page-subtitle', 'about', 22599, 'Legacy X Jiu-Jitsu is an independent Brazilian Jiu-Jitsu academy founded in June 2026 on a simple belief — that Jiu-Jitsu changes people, and that starts with the right environment.'),
  ('about/story/section-tag', 'about', 23000, 'Our story'),
  ('about/story/section-headline', 'about', 23119, 'Why Legacy <em>X exists.</em>'),
  ('about/story/p', 'about', 23190, 'Legacy X Jiu-Jitsu was founded by Coach Francis with one goal: to bring <strong>real, structured Brazilian Jiu-Jitsu to Woodstock, Ontario</strong> — and to build a community around it that people are proud to be part of.'),
  ('about/story/p-2', 'about', 23454, 'From the beginning, the vision was never just to open a gym. It was to create a place where students of all ages, backgrounds, and experience levels could walk through the door and feel like they belonged — where the teaching is serious, the community is welcoming, and the culture is built on respect.'),
  ('about/story/p-3', 'about', 23799, 'The name Legacy X reflects that vision. Every student who trains here becomes part of something larger than themselves. The discipline you build, the confidence you develop, the habits you form — those don''t stay on the mats. They carry into every part of your life. <strong>That''s the legacy.</strong>'),
  ('about/story/p-4', 'about', 24144, 'We opened our doors in June 2026 and we''re just getting started. We''re proud to be an OJA member club and to be building something that will serve the Woodstock community for years to come.'),
  ('instructors/head-coach-francis-yanga/coach-photo', 'instructors', 21339, ''),
  ('about/coach/coach-photo-placeholder', 'about', 25721, 'FX'),
  ('about/coach/coach-name', 'about', 25842, 'Francis'),
  ('about/coach/coach-title-label', 'about', 25940, 'Head Coach & Founder · Legacy X Jiu-Jitsu'),
  ('about/coach/section-tag', 'about', 26275, 'Meet the coach'),
  ('about/coach/section-headline', 'about', 26399, 'Coach <em>Francis.</em>'),
  ('about/coach/coach-intro', 'about', 26495, '"I started training Jiu-Jitsu because of what it did for me as a person. I started teaching it because I wanted other people to experience the same thing."'),
  ('about/coach/p', 'about', 26727, 'Coach Francis is the Head Coach and Founder of Legacy X Jiu-Jitsu. His approach to teaching is built around the belief that <strong>Jiu-Jitsu is a tool for personal development</strong> — and that the technical side of the art only works when it''s taught with patience, clarity, and genuine investment in each student''s growth.'),
  ('about/coach/p-2', 'about', 27099, 'As a coach, Francis brings a curriculum-driven approach to every class. Every technique has a purpose. Every class has a structure. Every student has a progression path they can understand and follow — from their first day on the mat to wherever their journey takes them.'),
  ('about/coach/p-3', 'about', 27415, 'Outside the academy, Francis runs <strong>Fight Frenzy with Francis</strong> — a UFC and MMA content channel across YouTube, YouTube Shorts, and TikTok — sharing his passion for the sport with a wider audience.'),
  ('about/coach/p-4', 'about', 27670, 'His door is always open. If you have questions about training, programs, or whether Jiu-Jitsu is right for you — reach out.'),
  ('about/values/section-tag', 'about', 29147, 'What we stand for'),
  ('about/values/section-headline', 'about', 29243, 'The pillars of <em>Legacy X.</em>'),
  ('about/oja/section-tag', 'about', 32251, 'Association'),
  ('about/oja/section-headline', 'about', 32370, 'OJA <em>Member Club.</em>'),
  ('about/oja/p', 'about', 32469, 'Legacy X Jiu-Jitsu is a proud member club of the <strong>Ontario Jiu-Jitsu Association (OJA)</strong> — the provincial organization supporting Jiu-Jitsu across Ontario.'),
  ('about/oja/p-2', 'about', 32680, 'Being part of the OJA means our students are protected under the association''s liability and accident insurance, can participate in OJA-sanctioned events, and are part of a broader provincial community of practitioners.'),
  ('about/oja/p-3', 'about', 32942, 'All Legacy X members are required to register with the OJA. When registering, select <strong>Legacy X Jiu-Jitsu</strong> as your gym/club to connect your membership with our academy.'),
  ('about/oja/p-4', 'about', 33217, 'When registering with the OJA, make sure to select <strong>Legacy X Jiu-Jitsu</strong> as your gym/club. This links your membership directly to our academy.'),
  ('about/cta-band/cta-headline', 'about', 34785, 'Come see Legacy X<br/>for yourself.'),
  ('about/cta-band/cta-sub', 'about', 34885, 'Your first class is free. No experience needed, no commitment required. Come meet Coach Francis, see the academy, and find out if Jiu-Jitsu is right for you.'),
  ('about/newsletter/newsletter-headline', 'about', 35374, 'Stay in the loop.'),
  ('about/newsletter/newsletter-sub', 'about', 35472, 'Weekly class recaps, training tips, event announcements, and academy updates — straight to your inbox. No spam, ever.'),
  ('site/footer/about-1', 'site', 36272, 'Legacy X Jiu-Jitsu is a Brazilian Jiu-Jitsu academy in Woodstock, Ontario, offering structured BJJ classes for kids, teens, and adults of all experience levels.'),
  ('site/footer/about-2', 'site', 36477, 'Proudly serving Woodstock, Ingersoll, Innerkip, Norwich, Thamesford, and surrounding Oxford County communities.'),
  ('site/footer/phone', 'site', 39164, '(226) 376-5784'),
  ('site/footer/email', 'site', 39271, 'info@legacyxjiujitsu.com'),
  ('site/footer/address', 'site', 39435, '27 Bysham Park Drive (Unit 1)<br/>Woodstock, ON, N4T 1P1'),
  ('site/footer/copyright', 'site', 39603, '© 2026 Legacy X Jiu-Jitsu. All rights reserved.'),
  ('site/footer/motto', 'site', 39714, 'Discipline · Confidence · Legacy'),
  ('contact/meta/title', 'contact', 193, 'Contact — Legacy X Jiu-Jitsu'),
  ('contact/page-header/page-title', 'contact', 17537, 'Get in<br/><em>Touch.</em>'),
  ('contact/page-header/page-subtitle', 'contact', 17643, 'Have a question about programs, membership, or anything else? Reach out — we''re happy to help. Your first class is always free.'),
  ('contact/join-band/join-band-text', 'contact', 17947, 'Want to visit and train with us?'),
  ('contact/left-info/info-tag', 'contact', 18342, 'Find us'),
  ('contact/left-info/info-headline', 'contact', 18429, 'Visit <em>Legacy X.</em>'),
  ('contact/right-form/form-headline', 'contact', 20039, 'Send us a message.'),
  ('contact/right-form/form-sub', 'contact', 20130, 'Fill out the form below and we''ll get back to you within one business day.'),
  ('contact/right-form/form-success-icon', 'contact', 21981, '✅'),
  ('contact/right-form/form-success-title', 'contact', 22078, 'Message Sent.'),
  ('contact/right-form/form-success-sub', 'contact', 22181, 'Thanks for reaching out. We''ll get back to you within one business day. See you on the mats.'),
  ('corporate/meta/title', 'corporate', 195, 'Corporate Wellness — Legacy X Jiu-Jitsu'),
  ('corporate/hero/hero-eyebrow', 'corporate', 17800, 'Corporate Wellness · Woodstock, Ontario'),
  ('corporate/hero/hero-title', 'corporate', 17910, 'Build a stronger<br/>team <em>on the mat.</em>'),
  ('corporate/hero/hero-sub', 'corporate', 18023, 'Brazilian Jiu-Jitsu is a structured environment where your people develop focus, resilience, and genuine team connection — while learning one of the world''s most effective martial arts. No experience required.'),
  ('corporate/what-it-is/section-tag', 'corporate', 18622, 'What it is'),
  ('corporate/what-it-is/section-headline', 'corporate', 18721, 'A performance<br/>benefit, not a <em>gym discount.</em>'),
  ('corporate/what-it-is/p', 'corporate', 18864, 'Legacy X Jiu-Jitsu offers corporate wellness programs for businesses and organizations in Woodstock and the surrounding area. Programs can include <strong>sponsored employee training</strong>, <strong>executive sessions</strong>, <strong>team-building experiences</strong>, and <strong>private corporate classes</strong> — all designed for beginners and customizable around team size, schedule, and goals.'),
  ('corporate/what-it-is/p-2', 'corporate', 19319, 'Most wellness spending buys access to equipment. Jiu-Jitsu asks something of the participant and gives back across multiple areas your organization already cares about — physical health, focus, resilience, and team culture.'),
  ('corporate/what-it-is/p-3', 'corporate', 19592, 'The mat is a place where rank means nothing on day one, everyone is a beginner at something, and the only way to improve is through the people around you. That culture is the reason it transfers.'),
  ('corporate/benefits/section-tag', 'corporate', 20008, 'Why it works'),
  ('corporate/benefits/section-headline', 'corporate', 20107, 'What your team<br/>actually <em>develops.</em>'),
  ('corporate/programs/section-tag', 'corporate', 23114, 'Program types'),
  ('corporate/programs/section-headline', 'corporate', 23214, 'Five ways to<br/>work with <em>Legacy X.</em>'),
  ('corporate/cta-band/cta-headline', 'corporate', 26591, 'Build a program<br/>for your team.'),
  ('corporate/cta-band/cta-sub', 'corporate', 26694, 'Tell us the shape of your organization and what you want to achieve. No prior Jiu-Jitsu experience required from anyone on your team.'),
  ('etiquette/meta/title', 'etiquette', 195, 'Dojo Etiquette — Legacy X Jiu-Jitsu'),
  ('etiquette/page-header/page-title', 'etiquette', 16995, 'Mat Rules &amp;<br/><em>Code of Conduct.</em>'),
  ('etiquette/page-header/page-subtitle', 'etiquette', 17122, 'Following these guidelines shows respect for the art, the academy, and every person you train with.'),
  ('etiquette/rules/rules-tag', 'etiquette', 17423, 'Mat Rules'),
  ('etiquette/rules/rules-headline', 'etiquette', 17514, 'Eight rules.<br/><em>One culture.</em>'),
  ('etiquette/rules/rules-intro', 'etiquette', 17639, 'These guidelines exist to protect the environment that everyone at Legacy X benefits from. They are simple, they are non-negotiable, and they reflect the standard we hold ourselves to every time we step on the mat.'),
  ('etiquette/culture/culture-left', 'etiquette', 22199, 'A culture worth protecting'),
  ('etiquette/culture/culture-headline', 'etiquette', 22311, 'Why these<br/>rules <em>matter.</em>'),
  ('etiquette/culture/p', 'etiquette', 22428, 'These rules are not about control — they are about <strong>protecting the culture we are building together.</strong> Legacy X is a place where you should feel safe to make mistakes, ask questions, and grow.'),
  ('etiquette/culture/p-2', 'etiquette', 22683, 'When everyone follows these guidelines, the entire academy benefits. The mat becomes a place where trust is assumed, intensity is appropriate, and learning can actually happen.'),
  ('etiquette/culture/p-3', 'etiquette', 22908, 'If you ever have questions or concerns about mat etiquette, <strong>speak with an instructor.</strong> We would rather address something early than let a small issue grow into a bigger problem.'),
  ('etiquette/cta/cta-headline', 'etiquette', 25016, 'Ready to train<br/>the right way?'),
  ('etiquette/cta/cta-sub', 'etiquette', 25113, 'Your first class is free. Come experience a culture built on respect, discipline, and genuine community — and see what Legacy X is all about.'),
  ('events/newsletter/newsletter-headline', 'events', 22748, 'Never miss an event.'),
  ('events/newsletter/newsletter-sub', 'events', 22850, 'Subscribe to the Legacy X newsletter and be the first to know about upcoming competitions, seminars, open mats, and academy announcements.'),
  ('events/meta/title', 'events', 192, 'Events — Legacy X Jiu-Jitsu'),
  ('events/page-header/page-title', 'events', 20937, 'Upcoming<br/><em>Events.</em>'),
  ('events/page-header/page-subtitle', 'events', 21047, 'Competitions, seminars, open mats, and academy milestones. Stay connected with everything happening at Legacy X.'),
  ('events/placeholder-event-3/empty-icon', 'events', 22220, '📅'),
  ('events/placeholder-event-3/empty-title', 'events', 22310, 'No events in this category yet.'),
  ('events/placeholder-event-3/empty-sub', 'events', 22423, 'Check back soon or subscribe to our newsletter to be the first to know when new events are announced.'),
  ('faq/meta/title', 'faq', 189, 'FAQ — Legacy X Jiu-Jitsu'),
  ('faq/page-header/page-title', 'faq', 17488, 'Frequently<br/><em>Asked Questions.</em>'),
  ('faq/page-header/page-subtitle', 'faq', 17604, 'Everything you need to know before stepping on the mat for the first time. Don''t see your question? Reach out — we''re happy to help.'),
  ('faq/sidebar/sidebar-tag', 'faq', 17938, 'Jump to'),
  ('faq/sidebar/sidebar-cta-text', 'faq', 18908, '<strong>Still have questions?</strong>
We''re happy to answer anything before your first class.'),
  ('faq/cta/cta-headline', 'faq', 25564, 'Ready to try<br/>your first class?'),
  ('faq/cta/cta-sub', 'faq', 25656, 'No experience needed. No commitment required. Your first class is always free — just show up and we''ll take care of the rest.'),
  ('index/meta/title', 'index', 191, 'Legacy X Jiu-Jitsu — Woodstock, Ontario'),
  ('index/hero/hero-eyebrow', 'index', 26369, 'Woodstock, Ontario'),
  ('index/hero/hero-headline', 'index', 26465, 'Build your<br/>
legacy<br/>
<span class="accent">on the mat.</span>'),
  ('index/hero/hero-sub', 'index', 26617, 'World-class Jiu-Jitsu training for all levels. Join our community and transform your life through martial arts — no experience needed.'),
  ('index/programs/section-tag', 'index', 27245, 'What we offer'),
  ('index/programs/section-headline', 'index', 27343, 'Programs built<br/>for <em>every level.</em>'),
  ('index/why-legacy-x/section-tag', 'index', 31055, 'Why Legacy X'),
  ('index/why-legacy-x/section-headline', 'index', 31156, 'Built on<br/>the right<br/><em>foundation.</em>'),
  ('index/testimonials/section-tag', 'index', 35027, 'From our community'),
  ('index/testimonials/section-headline', 'index', 35130, 'What members say.'),
  ('index/testimonials/testimonial-text', 'index', 35428, '"Having trained with Francis for years, I can say firsthand that his technical knowledge is only matched by his integrity as a person. He has created an environment that is technical, safe, and completely ego-free. You’re not just joining a gym—you’re becoming part of a community led by one of the best in the business. I couldn’t be prouder to see him open the doors at Legacy X. Woodstock is lucky to have him!"'),
  ('index/testimonials/testimonial-meta', 'index', 35932, 'Rain Plaff · Black Belt'),
  ('index/gallery/section-tag', 'index', 38175, 'On the mats'),
  ('index/gallery/section-headline', 'index', 38266, 'Legacy X <em>in motion.</em>'),
  ('index/cta-band/cta-headline', 'index', 40275, 'Your first class<br/>is on us.'),
  ('index/cta-band/cta-sub', 'index', 40370, 'No experience needed. No commitment required. Come see what Legacy X is about — bring a friend and train for free together.'),
  ('index/newsletter/newsletter-headline', 'index', 40866, 'Stay in the loop.'),
  ('index/newsletter/newsletter-sub', 'index', 40964, 'Weekly class recaps, training tips, event announcements, and academy updates — straight to your inbox. No spam, ever.'),
  ('instructors/meta/title', 'instructors', 197, 'Instructors — Legacy X Jiu-Jitsu'),
  ('instructors/page-header/page-title', 'instructors', 20745, 'Meet the<br/><em>Instructors.</em>'),
  ('instructors/page-header/page-subtitle', 'instructors', 20863, 'The people behind Legacy X — experienced, passionate, and dedicated to your growth on and off the mat.'),
  ('instructors/head-coach-francis-yanga/photo-initials', 'instructors', 21447, 'FY'),
  ('instructors/head-coach-francis-yanga/photo-add-note', 'instructors', 21557, 'Photo coming soon'),
  ('instructors/head-coach-francis-yanga/instructor-tag', 'instructors', 21931, 'Head Coach & Founder'),
  ('instructors/head-coach-francis-yanga/instructor-name', 'instructors', 22060, 'Francis<br/>Yanga'),
  ('instructors/head-coach-francis-yanga/instructor-title', 'instructors', 22184, 'Founder & Head Instructor'),
  ('instructors/head-coach-francis-yanga/instructor-affiliation', 'instructors', 22331, 'Black Belt · GF Team'),
  ('instructors/head-coach-francis-yanga/p', 'instructors', 22457, 'Francis Yanga''s journey in Brazilian Jiu-Jitsu began over <strong>10+ years ago</strong>, and from the very first roll, he knew he had found something that would change the course of his life. What started as a personal challenge quickly became a deep passion — one that he has dedicated himself to sharing with others.'),
  ('instructors/head-coach-francis-yanga/p-2', 'instructors', 22846, 'Earning his <strong>Black Belt under <a href="our-lineage.html" style="text-decoration:underline;text-underline-offset:3px;">Thomas Armstrong</a></strong>, Francis developed a teaching philosophy rooted in patience, precision, and genuine care for every student who walks through the door. He believes that the mat is a place where anyone — regardless of age, background, or ability — can discover strength they never knew they had.'),
  ('instructors/head-coach-francis-yanga/p-3', 'instructors', 23348, 'Legacy X Jiu-Jitsu is the realization of Francis''s vision: a place where technique meets heart, where discipline builds character, and where every student becomes part of something bigger than themselves. His goal isn''t just to teach Jiu-Jitsu — it''s to <strong>build a community that transforms lives.</strong>'),
  ('instructors/section-divider/divider-label', 'instructors', 25057, 'Program Instructors'),
  ('instructors/brandon-colvin/coach-photo', 'instructors', 25385, ''),
  ('instructors/brandon-colvin/card-initials', 'instructors', 25481, 'BC'),
  ('instructors/brandon-colvin/card-add-note', 'instructors', 25579, 'Photo coming soon'),
  ('instructors/brandon-colvin/card-tag', 'instructors', 25909, 'Kids Classes'),
  ('instructors/brandon-colvin/card-name', 'instructors', 26004, 'Brandon<br/>Colvin'),
  ('instructors/brandon-colvin/card-role', 'instructors', 26105, 'Kids Program Instructor'),
  ('instructors/brandon-colvin/card-affiliation', 'instructors', 26224, 'Brown Belt · Gracie Humaita'),
  ('instructors/brandon-colvin/p', 'instructors', 26341, 'Brandon is a Brazilian Jiu-Jitsu brown belt under <strong>Dave Dominy through Gracie Humaita</strong>, earning his brown belt in June 2026 after eight years of dedicated training.'),
  ('instructors/brandon-colvin/p-2', 'instructors', 26580, 'He brings extensive experience <strong>teaching and coaching children and youth</strong> in Brazilian Jiu-Jitsu. His coaching journey has taken him throughout Ontario and internationally to Thailand, where he coached the <strong>Team Canada Jiu-Jitsu Fighting Team</strong>.'),
  ('instructors/brandon-colvin/p-3', 'instructors', 26914, 'Brandon''s passion for martial arts began at a young age and extends beyond Jiu-Jitsu, with experience in Karate, Modern Arnis, Krav Maga, and Muay Thai.'),
  ('instructors/brandon-colvin/card-tags', 'instructors', 27177, '<span class="card-badge">Kids & Youth Specialist</span>
<span class="card-badge">Team Canada Coach</span>
<span class="card-badge">Gracie Humaita</span>
<span class="card-badge">Karate</span>
<span class="card-badge">Muay Thai</span>
<span class="card-badge">Krav Maga</span>'),
  ('instructors/cta/cta-headline', 'instructors', 27721, 'Train with our<br/>instructors.'),
  ('instructors/cta/cta-sub', 'instructors', 27818, 'Your first class is free. Come meet the team, experience the culture, and see what Legacy X is all about — no experience required.'),
  ('our-lineage/meta/title', 'our-lineage', 197, 'Our Lineage — Legacy X Jiu-Jitsu'),
  ('our-lineage/page-header/page-title', 'our-lineage', 21190, 'Our<br/><em>Heritage.</em>'),
  ('our-lineage/page-header/page-subtitle', 'our-lineage', 21300, 'Brazilian Jiu-Jitsu is a living tradition passed directly from instructor to student. This unbroken chain connects Legacy X to the very origins of the art.'),
  ('our-lineage/lineage-chain/section-tag', 'our-lineage', 21670, 'The Legacy Chain'),
  ('our-lineage/lineage-chain/p', 'our-lineage', 21739, 'Every technique taught at Legacy X traces back through a direct line of instruction spanning over a century of Jiu-Jitsu history.'),
  ('our-lineage/lineage-chain/card-num', 'our-lineage', 22084, 'Lineage 01'),
  ('our-lineage/lineage-chain/card-name', 'our-lineage', 22181, 'Mitsuyo Maeda'),
  ('our-lineage/lineage-chain/card-belt', 'our-lineage', 22294, '<span class="belt-pip white"></span>
<span class="belt-label">7th Dan Judo</span>'),
  ('our-lineage/lineage-chain/card-affiliation', 'our-lineage', 22499, 'Kodokan Judo'),
  ('our-lineage/lineage-chain/card-note', 'our-lineage', 22596, 'Brought Judo and Jiu-Jitsu from Japan to Brazil, laying the foundation for what would become Brazilian Jiu-Jitsu.'),
  ('our-lineage/lineage-chain/chain-dot', 'our-lineage', 22844, '1'),
  ('our-lineage/lineage-chain/chain-dot-2', 'our-lineage', 23203, '2'),
  ('our-lineage/lineage-chain/card-num-2', 'our-lineage', 23339, 'Lineage 02'),
  ('our-lineage/lineage-chain/card-name-2', 'our-lineage', 23438, 'Luiz França'),
  ('our-lineage/lineage-chain/card-belt-2', 'our-lineage', 23551, '<span class="belt-pip red"></span>
<span class="belt-label">Red Belt</span>'),
  ('our-lineage/lineage-chain/card-affiliation-2', 'our-lineage', 23752, 'França Jiu-Jitsu'),
  ('our-lineage/lineage-chain/card-note-2', 'our-lineage', 23855, 'Direct student of Maeda. Built a self-defense driven, tough and effective style that prioritized practicality over sport.'),
  ('our-lineage/lineage-chain/card-num-3', 'our-lineage', 24226, 'Lineage 03'),
  ('our-lineage/lineage-chain/card-name-3', 'our-lineage', 24325, 'Oswaldo Fadda'),
  ('our-lineage/lineage-chain/card-belt-3', 'our-lineage', 24440, '<span class="belt-pip red"></span>
<span class="belt-label">9th Degree Red Belt</span>'),
  ('our-lineage/lineage-chain/card-affiliation-3', 'our-lineage', 24652, 'Equipe Fadda'),
  ('our-lineage/lineage-chain/card-note-3', 'our-lineage', 24751, 'Leg lock pioneer who made BJJ inclusive and accessible. Proved that technique could overcome size and strength.'),
  ('our-lineage/lineage-chain/chain-dot-3', 'our-lineage', 24999, '3'),
  ('our-lineage/lineage-chain/chain-dot-4', 'our-lineage', 25366, '4'),
  ('our-lineage/lineage-chain/card-num-4', 'our-lineage', 25502, 'Lineage 04'),
  ('our-lineage/lineage-chain/card-name-4', 'our-lineage', 25601, 'Julio Cesar Pereira'),
  ('our-lineage/lineage-chain/card-belt-4', 'our-lineage', 25722, '<span class="belt-pip coral"></span>
<span class="belt-label">7th Degree Coral Belt</span>'),
  ('our-lineage/lineage-chain/card-affiliation-4', 'our-lineage', 25938, 'GF Team'),
  ('our-lineage/lineage-chain/card-note-4', 'our-lineage', 26032, 'Elite competition coach known for developing world-class athletes through advanced strategy, systems, and competition preparation.'),
  ('our-lineage/lineage-chain/card-num-5', 'our-lineage', 26415, 'Lineage 05'),
  ('our-lineage/lineage-chain/card-name-5', 'our-lineage', 26514, 'Thomas Armstrong'),
  ('our-lineage/lineage-chain/card-belt-5', 'our-lineage', 26632, '<span class="belt-pip black" style="position:relative;overflow:visible;display:inline-flex;align-items:center;gap:3px;">
  <span style="display:inline-block;width:32px;height:10px;background:var(--belt-black);border-radius:2px;position:relative;">
    <span style="position:absolute;top:0;bottom:0;right:6px;width:4px;background:rgba(255,255,255,0.85);border-radius:1px;"></span>
    <span style="position:absolute;top:0;bottom:0;right:12px;width:4px;background:rgba(255,255,255,0.85);border-radius:1px;"></span>
    <span style="position:absolute;top:0;bottom:0;right:18px;width:4px;background:rgba(255,255,255,0.85);border-radius:1px;"></span>
  </span>
</span>
<span class="belt-label">3rd Degree Black Belt</span>'),
  ('our-lineage/lineage-chain/card-affiliation-5', 'our-lineage', 27547, 'Armstrong Jiu-Jitsu / GF Team Canada'),
  ('our-lineage/lineage-chain/card-note-5', 'our-lineage', 27670, 'Coach Francis''s direct instructor. Built his game on strong fundamentals, pressure, and positional control — the same principles carried into Legacy X.'),
  ('our-lineage/lineage-chain/chain-dot-5', 'our-lineage', 27958, '5'),
  ('our-lineage/lineage-chain/chain-dot-6', 'our-lineage', 28334, 'LX'),
  ('our-lineage/lineage-chain/card-num-6', 'our-lineage', 28471, 'Legacy X'),
  ('our-lineage/lineage-chain/card-name-6', 'our-lineage', 28568, 'Francis Yanga'),
  ('our-lineage/lineage-chain/card-belt-6', 'our-lineage', 28683, '<span class="belt-pip black"></span>
<span class="belt-label">Black Belt</span>'),
  ('our-lineage/lineage-chain/card-affiliation-6', 'our-lineage', 28888, 'Legacy X Jiu-Jitsu / Armstrong Jiu-Jitsu'),
  ('our-lineage/lineage-chain/card-note-6', 'our-lineage', 29015, 'Head Coach and Founder of Legacy X Jiu-Jitsu. A technical coach focused on growth, mindset, and building a lasting Jiu-Jitsu community in Woodstock, Ontario.'),
  ('our-lineage/what-lineage-means/section-tag', 'our-lineage', 29440, 'Our commitment'),
  ('our-lineage/what-lineage-means/section-headline', 'our-lineage', 29553, 'What Lineage<br/>Means to <em>Us.</em>'),
  ('our-lineage/what-lineage-means/p', 'our-lineage', 29685, 'At Legacy X, lineage is not just history — it is <strong>accountability</strong>. Knowing where your techniques came from means understanding why they work.'),
  ('our-lineage/what-lineage-means/p-2', 'our-lineage', 29903, 'Our instruction carries the precision and intent of every generation before us, adapted for today''s training environment without losing the essence of the original art.'),
  ('our-lineage/what-lineage-means/p-3', 'our-lineage', 30133, 'When you train at Legacy X, you become part of this lineage. You carry it forward every time you step on the mat, every time you teach a training partner, and every time you represent the academy.'),
  ('our-lineage/cta/cta-headline', 'our-lineage', 31843, 'Join the chain.<br/>Start your journey.'),
  ('our-lineage/cta/cta-sub', 'our-lineage', 31948, 'Your first class is free. Come experience a lineage that connects directly to the origins of Brazilian Jiu-Jitsu — and become part of it.'),
  ('privacy/meta/title', 'privacy', 193, 'Privacy Policy — Legacy X Jiu-Jitsu'),
  ('privacy/page-header/page-title', 'privacy', 15205, 'Privacy<br/><em>Policy.</em>'),
  ('privacy/page-header/page-meta', 'privacy', 15305, 'Last updated: April 2026'),
  ('programs/meta/title', 'programs', 194, 'Programs — Legacy X Jiu-Jitsu'),
  ('programs/page-header/page-title', 'programs', 18004, 'Six programs.<br/><em>One standard.</em>'),
  ('programs/page-header/page-subtitle', 'programs', 18125, 'Every program at Legacy X is built on the same foundation — real Brazilian Jiu-Jitsu, taught with care, regardless of age, experience, or goal. Find the right fit for you.'),
  ('programs/free-trial-band/trial-headline', 'programs', 27168, 'Not sure which<br/>program is right?'),
  ('programs/free-trial-band/trial-sub', 'programs', 27283, 'Try a class for free — no commitment, no experience needed. Come see Legacy X for yourself and we''ll help point you in the right direction.'),
  ('programs/newsletter/newsletter-headline', 'programs', 27757, 'Stay in the loop.'),
  ('programs/newsletter/newsletter-sub', 'programs', 27858, 'Weekly class recaps, training tips, event announcements, and academy updates — straight to your inbox.'),
  ('schedule/meta/title', 'schedule', 194, 'Schedule — Legacy X Jiu-Jitsu'),
  ('schedule/page-header/page-title', 'schedule', 14875, 'Class<br/><em>Schedule.</em>'),
  ('schedule/page-header/page-subtitle', 'schedule', 14984, 'All classes are held at 27 Bysham Park Drive, Woodstock ON. Your first class is always free — just show up.'),
  ('schedule/gymdesk-schedule/schedule-tag', 'schedule', 15337, 'Live Schedule'),
  ('schedule/gymdesk-schedule/schedule-headline', 'schedule', 15448, 'Find your <em>class.</em>'),
  ('schedule/cta/cta-headline', 'schedule', 15954, 'First class<br/>is free.'),
  ('schedule/cta/cta-sub', 'schedule', 16041, 'No experience needed. No commitment required. Pick a class from the schedule above and just show up — we''ll take care of the rest.'),
  ('terms/meta/title', 'terms', 191, 'Terms & Conditions — Legacy X Jiu-Jitsu'),
  ('terms/page-header/page-title', 'terms', 15068, 'Terms &amp;<br/><em>Conditions.</em>'),
  ('terms/page-header/page-meta', 'terms', 15174, 'Last updated: April 2026'),
  ('terms/footer/copyright', 'terms', 26605, '© 2026 Legacy X Jiu-Jitsu. All rights reserved. &nbsp;·&nbsp; <a href="privacy.html" style="color:var(--muted);">Privacy Policy</a> &nbsp;·&nbsp; <a href="terms.html" style="color:var(--muted);">Terms & Conditions</a>'),
  ('programs/adult-jiu-jitsu/meta/title', 'programs/adult-jiu-jitsu', 210, 'Adult Jiu-Jitsu — Legacy X Jiu-Jitsu'),
  ('programs/adult-jiu-jitsu/meta/description', 'programs/adult-jiu-jitsu', 289, 'Adult Brazilian Jiu-Jitsu in Woodstock, Ontario. Gi and No-Gi classes for ages 16 and up, all experience levels. Your first class is free.'),
  ('programs/adult-jiu-jitsu/page-header/page-tag', 'programs/adult-jiu-jitsu', 24480, 'Adults 16+ · Gi & No-Gi · All levels'),
  ('programs/adult-jiu-jitsu/page-header/page-title', 'programs/adult-jiu-jitsu', 24613, 'Adult<br/><em>Jiu-Jitsu.</em>'),
  ('programs/adult-jiu-jitsu/page-header/page-subtitle', 'programs/adult-jiu-jitsu', 24739, 'Our flagship adult program covers the full spectrum of Brazilian Jiu-Jitsu — from foundational movement and positional awareness through to escapes, control, and submission offense. Structured for progression, open to all experience levels.'),
  ('programs/adult-jiu-jitsu/what-you-ll-learn/section-label', 'programs/adult-jiu-jitsu', 25400, 'The Curriculum'),
  ('programs/adult-jiu-jitsu/what-you-ll-learn/section-headline', 'programs/adult-jiu-jitsu', 25525, 'What you''ll<br/><em>learn.</em>'),
  ('programs/adult-jiu-jitsu/what-you-ll-learn/section-intro', 'programs/adult-jiu-jitsu', 25659, 'Classes are fundamentals-focused and built for progression. Every technique is taught with the why behind it, not just the how — so what you learn today still makes sense years from now.'),
  ('programs/adult-jiu-jitsu/gi-no-gi/section-label', 'programs/adult-jiu-jitsu', 27675, 'Two Styles, One Program'),
  ('programs/adult-jiu-jitsu/gi-no-gi/section-headline', 'programs/adult-jiu-jitsu', 27800, 'Gi & <em>No-Gi.</em>'),
  ('programs/adult-jiu-jitsu/gi-no-gi/section-intro', 'programs/adult-jiu-jitsu', 27918, 'We teach both styles in the adult program. Each develops different and complementary skills, and training both makes you a more complete grappler.'),
  ('programs/adult-jiu-jitsu/class-flow/section-label', 'programs/adult-jiu-jitsu', 29614, 'Inside a Class'),
  ('programs/adult-jiu-jitsu/class-flow/section-headline', 'programs/adult-jiu-jitsu', 29732, 'What an hour<br/><em>looks like.</em>'),
  ('programs/adult-jiu-jitsu/class-flow/section-intro', 'programs/adult-jiu-jitsu', 29865, 'Every adult class follows a structure designed to keep you safe and help you improve, whether it''s your first class or your five-hundredth.'),
  ('programs/adult-jiu-jitsu/your-first-class/section-label', 'programs/adult-jiu-jitsu', 31748, 'Getting Started'),
  ('programs/adult-jiu-jitsu/your-first-class/section-headline', 'programs/adult-jiu-jitsu', 31877, 'Your first<br/><em>class.</em>'),
  ('programs/adult-jiu-jitsu/your-first-class/section-intro', 'programs/adult-jiu-jitsu', 32013, 'Most of our adult members walked in with zero experience. You don''t need to be in shape, flexible, or athletic to start — that''s what training is for.'),
  ('programs/adult-jiu-jitsu/coach/section-label', 'programs/adult-jiu-jitsu', 34250, 'Your Coach'),
  ('programs/adult-jiu-jitsu/coach/section-headline', 'programs/adult-jiu-jitsu', 34359, 'Taught by a<br/><em>black belt.</em>'),
  ('programs/adult-jiu-jitsu/coach/coach-initials', 'programs/adult-jiu-jitsu', 34661, 'FY'),
  ('programs/adult-jiu-jitsu/coach/coach-role', 'programs/adult-jiu-jitsu', 34851, 'Founder & Head Instructor'),
  ('programs/adult-jiu-jitsu/coach/coach-name', 'programs/adult-jiu-jitsu', 34971, 'Francis Yanga'),
  ('programs/adult-jiu-jitsu/coach/coach-bio', 'programs/adult-jiu-jitsu', 35071, 'Coach Francis leads the adult program with a teaching philosophy rooted in patience, precision, and genuine care for every student who walks through the door. He believes the mat is a place where anyone — regardless of age, background, or ability — can discover strength they never knew they had.'),
  ('programs/adult-jiu-jitsu/coach/coach-stat-label', 'programs/adult-jiu-jitsu', 35523, 'Belt Rank'),
  ('programs/adult-jiu-jitsu/coach/coach-stat-value', 'programs/adult-jiu-jitsu', 35640, 'Black Belt'),
  ('programs/adult-jiu-jitsu/coach/coach-stat-label-2', 'programs/adult-jiu-jitsu', 35793, 'Lineage'),
  ('programs/adult-jiu-jitsu/coach/coach-stat-value-2', 'programs/adult-jiu-jitsu', 35910, '<a href="../our-lineage.html" style="text-decoration:underline;text-underline-offset:3px;">Thomas Armstrong</a>'),
  ('programs/adult-jiu-jitsu/coach/coach-stat-label-3', 'programs/adult-jiu-jitsu', 36164, 'Years Training'),
  ('programs/adult-jiu-jitsu/coach/coach-stat-value-3', 'programs/adult-jiu-jitsu', 36288, '10+'),
  ('programs/adult-jiu-jitsu/testimonials/section-label', 'programs/adult-jiu-jitsu', 36645, 'From the Mat'),
  ('programs/adult-jiu-jitsu/testimonials/section-headline', 'programs/adult-jiu-jitsu', 36763, 'What adults<br/><em>are saying.</em>'),
  ('programs/adult-jiu-jitsu/faq/section-label', 'programs/adult-jiu-jitsu', 37904, 'Adult Program FAQ'),
  ('programs/adult-jiu-jitsu/faq/section-headline', 'programs/adult-jiu-jitsu', 38018, 'Common<br/><em>questions.</em>'),
  ('programs/adult-jiu-jitsu/free-trial-band/trial-headline', 'programs/adult-jiu-jitsu', 41320, 'Your first class<br/>is on us.'),
  ('programs/adult-jiu-jitsu/free-trial-band/trial-sub', 'programs/adult-jiu-jitsu', 41445, 'No experience needed. No commitment required. Pick a class from the schedule, show up, and we''ll take care of the rest.'),
  ('programs/adult-jiu-jitsu/newsletter/newsletter-headline', 'programs/adult-jiu-jitsu', 41915, 'Stay in the loop.'),
  ('programs/adult-jiu-jitsu/newsletter/newsletter-sub', 'programs/adult-jiu-jitsu', 42032, 'Weekly class recaps, training tips, event announcements, and academy updates — straight to your inbox.'),
  ('programs/competition/meta/title', 'programs/competition', 206, 'Competition — Legacy X Jiu-Jitsu'),
  ('programs/competition/meta/description', 'programs/competition', 281, 'Brazilian Jiu-Jitsu competition team in Woodstock, Ontario. Structured Gi and No-Gi preparation for IBJJF/OJA-sanctioned events and open tournaments.'),
  ('programs/competition/page-header/page-tag', 'programs/competition', 22158, 'Intermediate–Advanced · Gi & No-Gi'),
  ('programs/competition/page-header/page-title', 'programs/competition', 22285, 'Competition<br/><em>Team.</em>'),
  ('programs/competition/page-header/page-subtitle', 'programs/competition', 22408, 'Structured preparation for IBJJF/OJA-sanctioned events and open tournaments. This program covers competition strategy, drilling under fatigue, live rounds with intensity, and the mental preparation needed to perform under pressure.'),
  ('programs/competition/what-you-ll-train/section-label', 'programs/competition', 23056, 'The Preparation'),
  ('programs/competition/what-you-ll-train/section-headline', 'programs/competition', 23178, 'Built to<br/><em>perform.</em>'),
  ('programs/competition/what-you-ll-train/section-intro', 'programs/competition', 23307, 'Competing asks more of you than a regular class. This program prepares you for every part of it — body, mind, and game plan.'),
  ('programs/competition/who-it-s-for/section-label', 'programs/competition', 25180, 'Who It''s For'),
  ('programs/competition/who-it-s-for/section-headline', 'programs/competition', 25294, 'Ready for<br/><em>the next step.</em>'),
  ('programs/competition/who-it-s-for/section-intro', 'programs/competition', 25425, 'The competition team is for students who want to test their Jiu-Jitsu on the mat — in the Gi, in No-Gi, or both.'),
  ('programs/competition/oja/section-label', 'programs/competition', 27116, 'Before You Compete'),
  ('programs/competition/oja/section-headline', 'programs/competition', 27231, 'OJA<br/><em>registration.</em>'),
  ('programs/competition/oja/section-intro', 'programs/competition', 27350, 'Legacy X Jiu-Jitsu is a proud member club of the Ontario Jiu-Jitsu Association (OJA). OJA registration is required to compete in OJA-sanctioned events, and IBJJF events require an active IBJJF membership.'),
  ('programs/competition/faq/section-label', 'programs/competition', 29704, 'Competition FAQ'),
  ('programs/competition/faq/section-headline', 'programs/competition', 29812, 'Common<br/><em>questions.</em>'),
  ('programs/competition/free-trial-band/trial-headline', 'programs/competition', 31958, 'Ready to test<br/>your game?'),
  ('programs/competition/free-trial-band/trial-sub', 'programs/competition', 32077, 'New to Legacy X? Your first class is free. Come train with us and talk to us about joining the competition team.'),
  ('programs/competition/newsletter/newsletter-headline', 'programs/competition', 32536, 'Stay in the loop.'),
  ('programs/competition/newsletter/newsletter-sub', 'programs/competition', 32649, 'Weekly class recaps, training tips, event announcements, and academy updates — straight to your inbox.'),
  ('programs/jiu-jitsu-over-55/meta/title', 'programs/jiu-jitsu-over-55', 212, 'Jiu-Jitsu Over 55 — Legacy X Jiu-Jitsu'),
  ('programs/jiu-jitsu-over-55/meta/description', 'programs/jiu-jitsu-over-55', 293, 'Low-impact Brazilian Jiu-Jitsu for practitioners 55 and older in Woodstock, Ontario. Focused on movement, joint health, and longevity. No experience required. Your first class is free.'),
  ('programs/jiu-jitsu-over-55/page-header/page-tag', 'programs/jiu-jitsu-over-55', 22219, '55+ · All levels · Low impact <span class="page-badge">New Program</span>'),
  ('programs/jiu-jitsu-over-55/page-header/page-title', 'programs/jiu-jitsu-over-55', 22387, 'Jiu-Jitsu<br/><em>Over 55.</em>'),
  ('programs/jiu-jitsu-over-55/page-header/page-subtitle', 'programs/jiu-jitsu-over-55', 22517, 'Jiu-Jitsu is for every body and every age. This program is designed specifically around the needs, pace, and goals of practitioners 55 and older — prioritizing movement quality, longevity, joint health, and staying active.'),
  ('programs/jiu-jitsu-over-55/focus-areas/section-label', 'programs/jiu-jitsu-over-55', 23150, 'The Focus'),
  ('programs/jiu-jitsu-over-55/focus-areas/section-headline', 'programs/jiu-jitsu-over-55', 23266, 'Train for<br/><em>the long run.</em>'),
  ('programs/jiu-jitsu-over-55/focus-areas/section-intro', 'programs/jiu-jitsu-over-55', 23401, 'This program is about more than technique. It''s about moving well, feeling good, and staying on the mats for years to come.'),
  ('programs/jiu-jitsu-over-55/train-smart/section-label', 'programs/jiu-jitsu-over-55', 25251, 'How It''s Different'),
  ('programs/jiu-jitsu-over-55/train-smart/section-headline', 'programs/jiu-jitsu-over-55', 25376, 'Same Jiu-Jitsu.<br/><em>Smarter pace.</em>'),
  ('programs/jiu-jitsu-over-55/train-smart/section-intro', 'programs/jiu-jitsu-over-55', 25517, 'You''ll work on the same foundational principles as our adult program, adapted to train smart and stay on the mats for years to come.'),
  ('programs/jiu-jitsu-over-55/class-flow/section-label', 'programs/jiu-jitsu-over-55', 27067, 'Inside a Class'),
  ('programs/jiu-jitsu-over-55/class-flow/section-headline', 'programs/jiu-jitsu-over-55', 27187, 'What a class<br/><em>looks like.</em>'),
  ('programs/jiu-jitsu-over-55/class-flow/section-intro', 'programs/jiu-jitsu-over-55', 27322, 'Every class follows a clear structure, so you always know what to expect and can work at your own pace.'),
  ('programs/jiu-jitsu-over-55/your-first-class/section-label', 'programs/jiu-jitsu-over-55', 28811, 'Getting Started'),
  ('programs/jiu-jitsu-over-55/your-first-class/section-headline', 'programs/jiu-jitsu-over-55', 28942, 'Your first<br/><em>class.</em>'),
  ('programs/jiu-jitsu-over-55/your-first-class/section-intro', 'programs/jiu-jitsu-over-55', 29080, 'No prior experience required, and you don''t need to be in shape to start. Come as you are — we''ll take it from there.'),
  ('programs/jiu-jitsu-over-55/faq/section-label', 'programs/jiu-jitsu-over-55', 31284, 'Over 55 FAQ'),
  ('programs/jiu-jitsu-over-55/faq/section-headline', 'programs/jiu-jitsu-over-55', 31394, 'Common<br/><em>questions.</em>'),
  ('programs/jiu-jitsu-over-55/free-trial-band/trial-headline', 'programs/jiu-jitsu-over-55', 33521, 'It''s never too late<br/>to start.'),
  ('programs/jiu-jitsu-over-55/free-trial-band/trial-sub', 'programs/jiu-jitsu-over-55', 33651, 'No experience needed. No commitment required. Your first class is free — pick a class from the schedule and we''ll take care of the rest.'),
  ('programs/jiu-jitsu-over-55/newsletter/newsletter-headline', 'programs/jiu-jitsu-over-55', 34140, 'Stay in the loop.'),
  ('programs/jiu-jitsu-over-55/newsletter/newsletter-sub', 'programs/jiu-jitsu-over-55', 34259, 'Weekly class recaps, training tips, event announcements, and academy updates — straight to your inbox.'),
  ('programs/kids-jiu-jitsu/meta/title', 'programs/kids-jiu-jitsu', 209, 'Kids Jiu-Jitsu — Legacy X Jiu-Jitsu'),
  ('programs/kids-jiu-jitsu/meta/description', 'programs/kids-jiu-jitsu', 287, 'Kids and teen Brazilian Jiu-Jitsu in Woodstock, Ontario for ages 4–15: Little Warriors (4–6), Legacy Juniors (7–12), and Legacy Next Gen (13–15). The first class is free.'),
  ('programs/kids-jiu-jitsu/page-header/page-tag', 'programs/kids-jiu-jitsu', 25864, 'Kids & Teens · Gi & No-Gi · Ages 4–15'),
  ('programs/kids-jiu-jitsu/page-header/page-title', 'programs/kids-jiu-jitsu', 26001, 'Kids<br/><em>Jiu-Jitsu.</em>'),
  ('programs/kids-jiu-jitsu/page-header/page-subtitle', 'programs/kids-jiu-jitsu', 26125, 'A fun, structured program introducing children to movement fundamentals, discipline, and confidence through Jiu-Jitsu. Three age groups, each with games, exercises, and age-appropriate technique in a positive, encouraging environment.'),
  ('programs/kids-jiu-jitsu/age-groups/section-label', 'programs/kids-jiu-jitsu', 26783, 'Three Age Groups'),
  ('programs/kids-jiu-jitsu/age-groups/section-headline', 'programs/kids-jiu-jitsu', 26902, 'The right class<br/><em>for every age.</em>'),
  ('programs/kids-jiu-jitsu/age-groups/section-intro', 'programs/kids-jiu-jitsu', 27040, 'Kids train with others their own age, so every class is pitched at the right level. At 16, students move up to our <a href="adult-jiu-jitsu.html" style="color:var(--blue);">Adult program</a>.'),
  ('programs/kids-jiu-jitsu/what-kids-gain/section-label', 'programs/kids-jiu-jitsu', 29097, 'Why Jiu-Jitsu'),
  ('programs/kids-jiu-jitsu/what-kids-gain/section-headline', 'programs/kids-jiu-jitsu', 29217, 'More than<br/><em>a sport.</em>'),
  ('programs/kids-jiu-jitsu/what-kids-gain/section-intro', 'programs/kids-jiu-jitsu', 29347, 'Jiu-Jitsu gives kids an active, structured place to grow. The skills they build on the mat go home with them — to school, to the playground, and everywhere in between.'),
  ('programs/kids-jiu-jitsu/class-flow/section-label', 'programs/kids-jiu-jitsu', 31253, 'Inside a Class'),
  ('programs/kids-jiu-jitsu/class-flow/section-headline', 'programs/kids-jiu-jitsu', 31370, 'What a class<br/><em>looks like.</em>'),
  ('programs/kids-jiu-jitsu/class-flow/section-intro', 'programs/kids-jiu-jitsu', 31502, 'Every class mixes three things together, in both Gi and No-Gi, adapted to each age group.'),
  ('programs/kids-jiu-jitsu/first-class/section-label', 'programs/kids-jiu-jitsu', 32976, 'For Parents'),
  ('programs/kids-jiu-jitsu/first-class/section-headline', 'programs/kids-jiu-jitsu', 33095, 'Your child''s<br/><em>first class.</em>'),
  ('programs/kids-jiu-jitsu/first-class/section-intro', 'programs/kids-jiu-jitsu', 33233, 'No experience needed and nothing to buy. If you''re unsure whether your child is ready, reach out — we assess each child individually and are happy to talk it through before the first class.'),
  ('programs/kids-jiu-jitsu/coach/section-label', 'programs/kids-jiu-jitsu', 35544, 'Your Child''s Coach'),
  ('programs/kids-jiu-jitsu/coach/section-headline', 'programs/kids-jiu-jitsu', 35660, 'Meet Coach<br/><em>Brandon.</em>'),
  ('programs/kids-jiu-jitsu/coach/coach-initials', 'programs/kids-jiu-jitsu', 35947, 'BC'),
  ('programs/kids-jiu-jitsu/coach/coach-role', 'programs/kids-jiu-jitsu', 36142, 'Kids Program Instructor'),
  ('programs/kids-jiu-jitsu/coach/coach-name', 'programs/kids-jiu-jitsu', 36255, 'Brandon Colvin'),
  ('programs/kids-jiu-jitsu/coach/coach-bio', 'programs/kids-jiu-jitsu', 36355, 'Brandon is a Brazilian Jiu-Jitsu brown belt under Dave Dominy through Gracie Humaita, earning his brown belt in June 2026 after eight years of dedicated training. He brings extensive experience teaching and coaching children and youth, and his coaching journey has taken him throughout Ontario and internationally to Thailand, where he coached the Team Canada Jiu-Jitsu Fighting Team.'),
  ('programs/kids-jiu-jitsu/coach/coach-stat-label', 'programs/kids-jiu-jitsu', 36894, 'Belt Rank'),
  ('programs/kids-jiu-jitsu/coach/coach-stat-value', 'programs/kids-jiu-jitsu', 37010, 'Brown Belt'),
  ('programs/kids-jiu-jitsu/coach/coach-stat-label-2', 'programs/kids-jiu-jitsu', 37162, 'Lineage'),
  ('programs/kids-jiu-jitsu/coach/coach-stat-value-2', 'programs/kids-jiu-jitsu', 37278, 'Dave Dominy'),
  ('programs/kids-jiu-jitsu/coach/coach-stat-label-3', 'programs/kids-jiu-jitsu', 37431, 'Years Training'),
  ('programs/kids-jiu-jitsu/coach/coach-stat-value-3', 'programs/kids-jiu-jitsu', 37554, '8'),
  ('programs/kids-jiu-jitsu/testimonial/section-label', 'programs/kids-jiu-jitsu', 37906, 'From Our Parents'),
  ('programs/kids-jiu-jitsu/testimonial/section-headline', 'programs/kids-jiu-jitsu', 38026, 'What parents<br/><em>are saying.</em>'),
  ('programs/kids-jiu-jitsu/testimonial/quote-text', 'programs/kids-jiu-jitsu', 38274, '"My kid started the trial classes and now she talks about Jiu-Jitsu constantly. The energy in that room is amazing — fun, safe, and structured."'),
  ('programs/kids-jiu-jitsu/testimonial/quote-meta', 'programs/kids-jiu-jitsu', 38513, 'Kids Program Parent'),
  ('programs/kids-jiu-jitsu/faq/section-label', 'programs/kids-jiu-jitsu', 38721, 'Parent FAQ'),
  ('programs/kids-jiu-jitsu/faq/section-headline', 'programs/kids-jiu-jitsu', 38827, 'Common<br/><em>questions.</em>'),
  ('programs/kids-jiu-jitsu/free-trial-band/trial-headline', 'programs/kids-jiu-jitsu', 41455, 'Their first class<br/>is on us.'),
  ('programs/kids-jiu-jitsu/free-trial-band/trial-sub', 'programs/kids-jiu-jitsu', 41580, 'No experience needed. No commitment required. Find your child''s group on the schedule, bring them in, and we''ll take care of the rest.'),
  ('programs/kids-jiu-jitsu/newsletter/newsletter-headline', 'programs/kids-jiu-jitsu', 42064, 'Stay in the loop.'),
  ('programs/kids-jiu-jitsu/newsletter/newsletter-sub', 'programs/kids-jiu-jitsu', 42180, 'Weekly class recaps, training tips, event announcements, and academy updates — straight to your inbox.'),
  ('programs/private-lessons/meta/title', 'programs/private-lessons', 210, 'Private Lessons — Legacy X Jiu-Jitsu'),
  ('programs/private-lessons/meta/description', 'programs/private-lessons', 289, 'One-on-one Brazilian Jiu-Jitsu private lessons with Coach Francis Yanga in Woodstock, Ontario. All levels, fully customized to your goals. Book online.'),
  ('programs/private-lessons/page-header/page-tag', 'programs/private-lessons', 22042, 'All levels · 1-on-1'),
  ('programs/private-lessons/page-header/page-title', 'programs/private-lessons', 22154, 'Private<br/><em>Lessons.</em>'),
  ('programs/private-lessons/page-header/page-subtitle', 'programs/private-lessons', 22280, 'Work directly with Coach Francis in a one-on-one setting tailored entirely to your goals, questions, and areas of focus. Private lessons deliver results faster than group classes alone.'),
  ('programs/private-lessons/what-we-can-work-on/section-label', 'programs/private-lessons', 22832, 'Your Session, Your Goals'),
  ('programs/private-lessons/what-we-can-work-on/section-headline', 'programs/private-lessons', 22969, 'What we can<br/><em>work on.</em>'),
  ('programs/private-lessons/what-we-can-work-on/section-intro', 'programs/private-lessons', 23107, 'Every private lesson is built around you. Bring a goal, a question, or a problem in your game — we''ll focus the whole session on it.'),
  ('programs/private-lessons/why-private/section-label', 'programs/private-lessons', 24966, 'Why Private Lessons'),
  ('programs/private-lessons/why-private/section-headline', 'programs/private-lessons', 25090, 'Faster<br/><em>progress.</em>'),
  ('programs/private-lessons/why-private/section-intro', 'programs/private-lessons', 25216, 'Group classes build your base. Private lessons fill the gaps and speed everything up.'),
  ('programs/private-lessons/booking/section-label', 'programs/private-lessons', 26675, 'Book a Session'),
  ('programs/private-lessons/booking/section-headline', 'programs/private-lessons', 26790, 'Book your<br/><em>private lesson.</em>'),
  ('programs/private-lessons/booking/section-intro', 'programs/private-lessons', 26921, 'Choose a time that works for you and complete the booking below. Have a question first? <a href="../contact.html" style="color:var(--blue);">Get in touch</a>.'),
  ('programs/private-lessons/faq/section-label', 'programs/private-lessons', 27419, 'Private Lessons FAQ'),
  ('programs/private-lessons/faq/section-headline', 'programs/private-lessons', 27535, 'Common<br/><em>questions.</em>'),
  ('programs/private-lessons/free-trial-band/trial-headline', 'programs/private-lessons', 29620, 'New to<br/>Legacy X?'),
  ('programs/private-lessons/free-trial-band/trial-sub', 'programs/private-lessons', 29735, 'Try a group class for free — no commitment, no experience needed. Come see Legacy X for yourself.'),
  ('programs/private-lessons/newsletter/newsletter-headline', 'programs/private-lessons', 30183, 'Stay in the loop.'),
  ('programs/private-lessons/newsletter/newsletter-sub', 'programs/private-lessons', 30300, 'Weekly class recaps, training tips, event announcements, and academy updates — straight to your inbox.'),
  ('programs/womens-only/meta/title', 'programs/womens-only', 206, 'Women''s Only — Legacy X Jiu-Jitsu'),
  ('programs/womens-only/meta/description', 'programs/womens-only', 282, 'Women''s only Brazilian Jiu-Jitsu in Woodstock, Ontario for women 16 and older. Self-defense, fundamentals, and positional training for all levels. Your first class is free.'),
  ('programs/womens-only/page-header/page-tag', 'programs/womens-only', 21884, 'Women 16+ · All levels'),
  ('programs/womens-only/page-header/page-title', 'programs/womens-only', 21995, 'Women''s<br/><em>Only.</em>'),
  ('programs/womens-only/page-header/page-subtitle', 'programs/womens-only', 22114, 'A dedicated program for women of all experience levels in a focused, supportive environment. Covers self-defense applications, fundamental Jiu-Jitsu technique, and positional training in a space built specifically for women to learn and grow.'),
  ('programs/womens-only/what-you-ll-learn/section-label', 'programs/womens-only', 22773, 'The Curriculum'),
  ('programs/womens-only/what-you-ll-learn/section-headline', 'programs/womens-only', 22894, 'What you''ll<br/><em>learn.</em>'),
  ('programs/womens-only/what-you-ll-learn/section-intro', 'programs/womens-only', 23024, 'Every class is built around three pillars. You''ll learn real, practical Jiu-Jitsu — taught step by step, with the why behind every technique.'),
  ('programs/womens-only/why-women-s-only/section-label', 'programs/womens-only', 24633, 'Why Women''s Only'),
  ('programs/womens-only/why-women-s-only/section-headline', 'programs/womens-only', 24755, 'A space built<br/><em>for you.</em>'),
  ('programs/womens-only/why-women-s-only/section-intro', 'programs/womens-only', 24888, 'Starting something new is easier in the right room. This program gives women a dedicated place to learn, ask questions, and grow at their own pace.'),
  ('programs/womens-only/class-flow/section-label', 'programs/womens-only', 26476, 'Inside a Class'),
  ('programs/womens-only/class-flow/section-headline', 'programs/womens-only', 26590, 'What a class<br/><em>looks like.</em>'),
  ('programs/womens-only/class-flow/section-intro', 'programs/womens-only', 26719, 'Every class follows a structure designed to keep you safe and help you improve, whether it''s your first class or your fiftieth.'),
  ('programs/womens-only/your-first-class/section-label', 'programs/womens-only', 28576, 'Getting Started'),
  ('programs/womens-only/your-first-class/section-headline', 'programs/womens-only', 28701, 'Your first<br/><em>class.</em>'),
  ('programs/womens-only/your-first-class/section-intro', 'programs/womens-only', 28833, 'You don''t need to be in shape, flexible, or athletic to start. Just bring yourself — we''ll guide you through every step.'),
  ('programs/womens-only/faq/section-label', 'programs/womens-only', 31028, 'Women''s Only FAQ'),
  ('programs/womens-only/faq/section-headline', 'programs/womens-only', 31137, 'Common<br/><em>questions.</em>'),
  ('programs/womens-only/free-trial-band/trial-headline', 'programs/womens-only', 33173, 'Your first class<br/>is on us.'),
  ('programs/womens-only/free-trial-band/trial-sub', 'programs/womens-only', 33294, 'No experience needed. No commitment required. Pick a class from the schedule, show up, and we''ll take care of the rest.'),
  ('programs/womens-only/newsletter/newsletter-headline', 'programs/womens-only', 33760, 'Stay in the loop.'),
  ('programs/womens-only/newsletter/newsletter-sub', 'programs/womens-only', 33873, 'Weekly class recaps, training tips, event announcements, and academy updates — straight to your inbox.')
on conflict (key) do nothing;

insert into public.cms_lists (key, page, position, fields) values
  ('about/story/story-aside', 'about', 24432, array['story-block-num', 'story-block-label']::text[]),
  ('about/coach/coach-credentials', 'about', 27910, array['credential-label', 'credential-value']::text[]),
  ('about/values/values-grid', 'about', 29360, array['value-icon', 'value-name', 'value-desc']::text[]),
  ('about/oja/oja-visual', 'about', 33737, array['oja-stat-num', 'oja-stat-label']::text[]),
  ('contact/left-info/info-block', 'contact', 18466, array['info-block-label', 'info-block-value', 'info-block-sub']::text[]),
  ('corporate/benefits/benefits-grid', 'corporate', 20258, array['benefit-num', 'benefit-title', 'benefit-desc']::text[]),
  ('corporate/programs/programs-list', 'corporate', 23364, array['program-row-num', 'program-row-title', 'program-row-desc', 'program-row-tag']::text[]),
  ('etiquette/rules/rules-grid', 'etiquette', 17949, array['rule-number', 'rule-icon', 'rule-title', 'rule-body']::text[]),
  ('etiquette/culture/culture-right', 'etiquette', 23217, array['culture-block-title', 'culture-block-body']::text[]),
  ('faq/faq-list/faq-list', 'faq', 19211, array['faq-q-text', 'p']::text[]),
  ('index/programs/programs-grid', 'index', 27549, array['program-icon', 'program-age', 'program-name', 'program-desc']::text[]),
  ('index/why-legacy-x/why-left', 'index', 31217, array['why-intro']::text[]),
  ('index/why-legacy-x/why-items', 'index', 31782, array['why-num', 'why-title', 'why-desc', 'why-badge', 'why-desc-2']::text[]),
  ('index/why-legacy-x/why-right', 'index', 33902, array['why-visual-big', 'why-visual-label']::text[]),
  ('index/testimonials/testimonials-grid', 'index', 35995, array['testimonial-text', 'testimonial-meta']::text[]),
  ('index/gallery/mosaic', 'index', 38447, array['mosaic-photo', 'mosaic-placeholder-text', 'mosaic-cell-label']::text[]),
  ('instructors/head-coach-francis-yanga/instructor-stats', 'instructors', 23799, array['stat-label', 'stat-value']::text[]),
  ('our-lineage/what-lineage-means/meaning-right', 'our-lineage', 30458, array['meaning-block-title', 'meaning-block-body']::text[]),
  ('privacy/policy-body/policy-body', 'privacy', 16075, array['section-num', 'section-title', 'p', 'li', 'li-2', 'li-3', 'li-4', 'li-5', 'p-2']::text[]),
  ('programs/programs-grid/programs-overview-grid', 'programs', 19082, array['prog-icon', 'prog-tag', 'prog-name', 'prog-desc', 'prog-detail', 'prog-detail-2', 'prog-detail-3']::text[]),
  ('terms/terms-body/terms-body', 'terms', 16126, array['section-num', 'section-title', 'p', 'li', 'li-2', 'li-3', 'li-4', 'p-2']::text[]),
  ('programs/adult-jiu-jitsu/what-you-ll-learn/curriculum-grid', 'programs/adult-jiu-jitsu', 25966, array['curr-num', 'curr-name', 'curr-desc']::text[]),
  ('programs/adult-jiu-jitsu/gi-no-gi/split-grid', 'programs/adult-jiu-jitsu', 28166, array['split-tag', 'split-name', 'split-desc', 'li', 'li-2', 'li-3']::text[]),
  ('programs/adult-jiu-jitsu/class-flow/flow', 'programs/adult-jiu-jitsu', 30096, array['flow-index', 'flow-name', 'flow-desc']::text[]),
  ('programs/adult-jiu-jitsu/your-first-class/checklist', 'programs/adult-jiu-jitsu', 32460, array['check-title', 'check-desc']::text[]),
  ('programs/adult-jiu-jitsu/testimonials/quote-grid', 'programs/adult-jiu-jitsu', 36906, array['quote-text', 'quote-meta']::text[]),
  ('programs/adult-jiu-jitsu/faq/faq-list', 'programs/adult-jiu-jitsu', 38142, array['summary', 'faq-answer']::text[]),
  ('programs/competition/what-you-ll-train/curriculum-grid', 'programs/competition', 23548, array['curr-num', 'curr-name', 'curr-desc']::text[]),
  ('programs/competition/who-it-s-for/split-grid', 'programs/competition', 25645, array['split-tag', 'split-name', 'split-desc']::text[]),
  ('programs/competition/oja/checklist', 'programs/competition', 27981, array['check-title', 'check-desc']::text[]),
  ('programs/competition/faq/faq-list', 'programs/competition', 29932, array['summary', 'faq-answer']::text[]),
  ('programs/jiu-jitsu-over-55/focus-areas/curriculum-grid', 'programs/jiu-jitsu-over-55', 23641, array['curr-num', 'curr-name', 'curr-desc']::text[]),
  ('programs/jiu-jitsu-over-55/train-smart/split-grid', 'programs/jiu-jitsu-over-55', 25762, array['split-tag', 'split-name', 'split-desc']::text[]),
  ('programs/jiu-jitsu-over-55/class-flow/flow', 'programs/jiu-jitsu-over-55', 27525, array['flow-index', 'flow-name', 'flow-desc']::text[]),
  ('programs/jiu-jitsu-over-55/your-first-class/checklist', 'programs/jiu-jitsu-over-55', 29496, array['check-title', 'check-desc']::text[]),
  ('programs/jiu-jitsu-over-55/faq/faq-list', 'programs/jiu-jitsu-over-55', 31520, array['summary', 'faq-answer']::text[]),
  ('programs/kids-jiu-jitsu/age-groups/groups-grid', 'programs/kids-jiu-jitsu', 27336, array['group-ages', 'group-name', 'group-tagline', 'group-desc']::text[]),
  ('programs/kids-jiu-jitsu/what-kids-gain/curriculum-grid', 'programs/kids-jiu-jitsu', 29631, array['curr-num', 'curr-name', 'curr-desc']::text[]),
  ('programs/kids-jiu-jitsu/class-flow/flow', 'programs/kids-jiu-jitsu', 31688, array['flow-index', 'flow-name', 'flow-desc']::text[]),
  ('programs/kids-jiu-jitsu/first-class/checklist', 'programs/kids-jiu-jitsu', 33713, array['check-title', 'check-desc']::text[]),
  ('programs/kids-jiu-jitsu/faq/faq-list', 'programs/kids-jiu-jitsu', 38950, array['summary', 'faq-answer']::text[]),
  ('programs/private-lessons/what-we-can-work-on/curriculum-grid', 'programs/private-lessons', 23362, array['curr-num', 'curr-name', 'curr-desc']::text[]),
  ('programs/private-lessons/why-private/split-grid', 'programs/private-lessons', 25412, array['split-tag', 'split-name', 'split-desc']::text[]),
  ('programs/private-lessons/faq/faq-list', 'programs/private-lessons', 27659, array['summary', 'faq-answer']::text[]),
  ('programs/womens-only/what-you-ll-learn/curriculum-grid', 'programs/womens-only', 23288, array['curr-num', 'curr-name', 'curr-desc']::text[]),
  ('programs/womens-only/why-women-s-only/split-grid', 'programs/womens-only', 25147, array['split-tag', 'split-name', 'split-desc']::text[]),
  ('programs/womens-only/class-flow/flow', 'programs/womens-only', 26934, array['flow-index', 'flow-name', 'flow-desc']::text[]),
  ('programs/womens-only/your-first-class/checklist', 'programs/womens-only', 29246, array['check-title', 'check-desc']::text[]),
  ('programs/womens-only/faq/faq-list', 'programs/womens-only', 31257, array['summary', 'faq-answer']::text[])
on conflict (key) do nothing;

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('about/story/story-aside', 0, 0, '{"story-block-num":"May <span>''26</span>","story-block-label":"Legacy X opened its doors in Woodstock, ON"}'::jsonb),
  ('about/story/story-aside', 1, 1, '{"story-block-num":"6","story-block-label":"Programs offered — adults, kids, specialty & private"}'::jsonb),
  ('about/story/story-aside', 2, 2, '{"story-block-num":"1","story-block-label":"Mission — real Jiu-Jitsu, real community, real results"}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'about/story/story-aside');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('about/coach/coach-credentials', 0, 0, '{"credential-label":"Role","credential-value":"Head Coach & Founder"}'::jsonb),
  ('about/coach/coach-credentials', 1, 1, '{"credential-label":"Academy","credential-value":"Legacy X Jiu-Jitsu"}'::jsonb),
  ('about/coach/coach-credentials', 2, 2, '{"credential-label":"Location","credential-value":"Woodstock, Ontario"}'::jsonb),
  ('about/coach/coach-credentials', 3, 3, '{"credential-label":"Association","credential-value":"OJA Member Club"}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'about/coach/coach-credentials');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('about/values/values-grid', 0, 0, '{"value-icon":"🎯","value-name":"Discipline","value-desc":"Jiu-Jitsu demands consistency, patience, and the willingness to show up even when it''s hard. We build that discipline in class and watch it carry into every part of our students'' lives."}'::jsonb),
  ('about/values/values-grid', 1, 1, '{"value-icon":"💪","value-name":"Confidence","value-desc":"There''s something powerful about knowing you can handle yourself — physically and mentally. We build real confidence through real training, not just words on a wall."}'::jsonb),
  ('about/values/values-grid', 2, 2, '{"value-icon":"🤝","value-name":"Community","value-desc":"Legacy X is independent, not a franchise. Our members know each other by name and train with a shared sense of purpose. No egos. No politics. Just people who show up and put in the work."}'::jsonb),
  ('about/values/values-grid', 3, 3, '{"value-icon":"📖","value-name":"Structure","value-desc":"We teach Jiu-Jitsu the right way — with a clear curriculum, deliberate progressions, and classes that build on each other. Every student always knows where they are and what comes next."}'::jsonb),
  ('about/values/values-grid', 4, 4, '{"value-icon":"🛡️","value-name":"Safety","value-desc":"We train hard, but we train smart. Ego-free rolling, clear hygiene standards, and a culture that looks out for training partners — especially those who are newer or smaller."}'::jsonb),
  ('about/values/values-grid', 5, 5, '{"value-icon":"🌱","value-name":"Legacy","value-desc":"The skills you build here don''t stay on the mats. They follow you — in how you carry yourself, how you handle adversity, and how you show up for others. That''s the legacy we''re building together."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'about/values/values-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('about/oja/oja-visual', 0, 0, '{"oja-stat-num":"OJA<span>.</span>","oja-stat-label":"Ontario Jiu-Jitsu Association member club"}'::jsonb),
  ('about/oja/oja-visual', 1, 1, '{"oja-stat-num":"✓","oja-stat-label":"Liability & accident insurance coverage for all registered members"}'::jsonb),
  ('about/oja/oja-visual', 2, 2, '{"oja-stat-num":"✓","oja-stat-label":"OJA membership required for sanctioned competition events"}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'about/oja/oja-visual');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('contact/left-info/info-block', 0, 0, '{"info-block-label":"📞 Phone","info-block-value":"<a href=\"tel:2263765784\">(226) 376-5784</a>","info-block-sub":"Call or text us anytime — we''ll get back to you as soon as possible."}'::jsonb),
  ('contact/left-info/info-block', 1, 1, '{"info-block-label":"✉️ Email","info-block-value":"<a href=\"mailto:info@legacyxjiujitsu.com\">info@legacyxjiujitsu.com</a>","info-block-sub":"For program inquiries, membership questions, or general information."}'::jsonb),
  ('contact/left-info/info-block', 2, 2, '{"info-block-label":"📍 Address","info-block-value":"27 Bysham Park Drive<br/>Unit 1<br/>Woodstock, ON, N4T 1P1"}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'contact/left-info/info-block');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('corporate/benefits/benefits-grid', 0, 0, '{"benefit-num":"01","benefit-title":"Physical Fitness","benefit-desc":"A demanding full-body activity that develops conditioning, mobility, coordination, and strength — without requiring any prior athletic background."}'::jsonb),
  ('corporate/benefits/benefits-grid', 1, 1, '{"benefit-num":"02","benefit-title":"Focus","benefit-desc":"Training requires participants to stay present, process information quickly, and solve physical problems in real time. There is no room for distraction."}'::jsonb),
  ('corporate/benefits/benefits-grid', 2, 2, '{"benefit-num":"03","benefit-title":"Resilience","benefit-desc":"Participants repeatedly meet a difficult situation, reset, and continue. Learning to stay calm when things go wrong on the mat carries directly into the workplace."}'::jsonb),
  ('corporate/benefits/benefits-grid', 3, 3, '{"benefit-num":"04","benefit-title":"Team Connection","benefit-desc":"People train together, improve through cooperation, and share a challenge that has nothing to do with their job title. Real connection follows."}'::jsonb),
  ('corporate/benefits/benefits-grid', 4, 4, '{"benefit-num":"05","benefit-title":"Composure Under Pressure","benefit-desc":"Jiu-Jitsu teaches people to slow down, breathe, and respond rather than react. That skill is not described on the mat — it is rehearsed, repeatedly, against a live problem."}'::jsonb),
  ('corporate/benefits/benefits-grid', 5, 5, '{"benefit-num":"06","benefit-title":"Confidence","benefit-desc":"Learning a difficult skill and making measurable, tangible progress builds confidence that travels far beyond the mat and into every part of daily life."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'corporate/benefits/benefits-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('corporate/programs/programs-list', 0, 0, '{"program-row-num":"01","program-row-title":"Employee Wellness Program","program-row-desc":"The company fully or partially sponsors ongoing training memberships for employees. One invoice, monthly billing, flexible contribution structure.","program-row-tag":"Ongoing"}'::jsonb),
  ('corporate/programs/programs-list', 1, 1, '{"program-row-num":"02","program-row-title":"Executive Training","program-row-desc":"Private or small-group sessions designed around senior leaders and executives, scheduled around a leadership calendar, with instruction matched to the participants.","program-row-tag":"Private"}'::jsonb),
  ('corporate/programs/programs-list', 2, 2, '{"program-row-num":"03","program-row-title":"Team Experience","program-row-desc":"A private introductory Jiu-Jitsu session for a company, department, or leadership group. No experience assumed. One hour, fully guided, and a great first step.","program-row-tag":"One-Time"}'::jsonb),
  ('corporate/programs/programs-list', 3, 3, '{"program-row-num":"04","program-row-title":"Ongoing Corporate Training","program-row-desc":"Recurring private sessions for organizations that want Jiu-Jitsu built into their wellness strategy — not bolted on as a one-off event.","program-row-tag":"Recurring"}'::jsonb),
  ('corporate/programs/programs-list', 4, 4, '{"program-row-num":"05","program-row-title":"Custom Program","program-row-desc":"Built around your schedule, team size, and goals. Tell us what you are trying to achieve and we will design it around your organization.","program-row-tag":"Custom"}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'corporate/programs/programs-list');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('etiquette/rules/rules-grid', 0, 0, '{"rule-number":"Rule 01","rule-icon":"🤝","rule-title":"Respect Everyone","rule-body":"Treat all training partners — regardless of rank, size, or experience — with genuine respect. Ego has no place on the mat."}'::jsonb),
  ('etiquette/rules/rules-grid', 1, 1, '{"rule-number":"Rule 02","rule-icon":"🧼","rule-title":"Hygiene is Non-Negotiable","rule-body":"Trim your fingernails and toenails. Shower before class if possible. Wear clean, freshly washed gi or training gear to every session."}'::jsonb),
  ('etiquette/rules/rules-grid', 2, 2, '{"rule-number":"Rule 03","rule-icon":"⏰","rule-title":"Be On Time","rule-body":"Arrive before class begins. If you must arrive late, wait at the edge of the mat for permission to join. Latecomers disrupt instruction and show disrespect to the instructor and your training partners."}'::jsonb),
  ('etiquette/rules/rules-grid', 3, 3, '{"rule-number":"Rule 04","rule-icon":"👟","rule-title":"No Shoes on the Mat","rule-body":"Remove shoes before stepping onto the mat. Wearing shoes on the mat, or walking barefoot off the mat and back on, brings bacteria and debris that affect everyone."}'::jsonb),
  ('etiquette/rules/rules-grid', 4, 4, '{"rule-number":"Rule 05","rule-icon":"✋","rule-title":"Tap Early, Tap Often","rule-body":"There is no shame in tapping. It is a sign of intelligence, not weakness. Protect yourself and your training partners by tapping before a submission is fully locked in."}'::jsonb),
  ('etiquette/rules/rules-grid', 5, 5, '{"rule-number":"Rule 06","rule-icon":"⚖️","rule-title":"Control Your Intensity","rule-body":"Match the energy and intensity of your training partner, especially with newer students. This is practice, not competition. Save your full intensity for appropriate sparring rounds."}'::jsonb),
  ('etiquette/rules/rules-grid', 6, 6, '{"rule-number":"Rule 07","rule-icon":"👂","rule-title":"Listen and Learn","rule-body":"When the instructor is speaking, stop drilling and pay attention. Ask questions after the demonstration. Avoid side conversations during instruction."}'::jsonb),
  ('etiquette/rules/rules-grid', 7, 7, '{"rule-number":"Rule 08","rule-icon":"🧹","rule-title":"Keep the Academy Clean","rule-body":"Help keep the training area tidy. Return equipment to its proper place, pick up tape from the floor, and report any maintenance issues to the instructor."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'etiquette/rules/rules-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('etiquette/culture/culture-right', 0, 0, '{"culture-block-title":"Safety first, always","culture-block-body":"Every rule on this list ultimately comes back to keeping training partners safe — physically and in terms of their experience on the mat."}'::jsonb),
  ('etiquette/culture/culture-right', 1, 1, '{"culture-block-title":"Rank earns nothing alone","culture-block-body":"A higher belt does not give you the right to be careless with your training partners. Respect is earned through behaviour on and off the mat — not by the colour of your belt."}'::jsonb),
  ('etiquette/culture/culture-right', 2, 2, '{"culture-block-title":"Everyone is accountable","culture-block-body":"These expectations apply to everyone equally — white belts, black belts, and coaches. No exceptions. That consistency is what makes the culture real."}'::jsonb),
  ('etiquette/culture/culture-right', 3, 3, '{"culture-block-title":"Open door policy","culture-block-body":"If something feels off — unsafe, disrespectful, or out of place — bring it to an instructor. This academy is only as strong as the trust we build together."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'etiquette/culture/culture-right');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('faq/faq-list/faq-list', 0, 0, '{"faq-q-text":"Do I need any experience to start?","p":"Absolutely not. Our beginner program is specifically designed for people with <strong>zero martial arts experience</strong>. We will guide you through every step of your journey — from how to fall safely, to your first techniques, to your first roll."}'::jsonb),
  ('faq/faq-list/faq-list', 1, 1, '{"faq-q-text":"What should I wear to my first class?","p":"For your first class, wear <strong>comfortable athletic clothing</strong> — a t-shirt and shorts or athletic pants works perfectly. We provide loaner gis (uniforms) for trial classes, so you don''t need to buy anything before you decide to commit. No shoes are worn on the mat."}'::jsonb),
  ('faq/faq-list/faq-list', 2, 2, '{"faq-q-text":"Is Jiu-Jitsu safe?","p":"Yes. <strong>Safety is our top priority.</strong> Our classes are structured with proper warm-ups, controlled drilling, and supervised sparring. Beginners learn in a separate, controlled environment — you will never be thrown into a live roll before you are ready. Our culture of tapping early and training with control keeps everyone safe."}'::jsonb),
  ('faq/faq-list/faq-list', 3, 3, '{"faq-q-text":"How often should I train?","p":"We recommend <strong>2–3 times per week</strong> for beginners. As you progress, you can increase your training frequency. Consistency is more important than intensity when starting out — showing up regularly and allowing your body time to recover will take you further than training every day."}'::jsonb),
  ('faq/faq-list/faq-list', 4, 4, '{"faq-q-text":"What age can kids start?","p":"Kids can start at <strong>age 4</strong>. Our Kids program has three groups: <strong>Little Warriors</strong> (ages 4–6), <strong>Legacy Juniors</strong> (ages 7–12), and <strong>Legacy Next Gen</strong> (ages 13–15). Students <strong>16 and older</strong> train in our Adult program. We assess each child individually to ensure they are ready for the class environment. If you are unsure whether your child is ready, reach out and we are happy to discuss it with you before the first class."}'::jsonb),
  ('faq/faq-list/faq-list', 5, 5, '{"faq-q-text":"Do you offer a free trial?","p":"<strong>Yes!</strong> We offer a free trial class so you can experience Legacy X firsthand. No commitment required. Simply fill out our trial form or <a href=\"contact.html\" style=\"color:var(--blue);border-bottom:1px solid rgba(58,143,216,0.4);\">contact us</a> to schedule your session. Bring a friend and both of you can try a class for free together."}'::jsonb),
  ('faq/faq-list/faq-list', 6, 6, '{"faq-q-text":"What is the difference between Gi and No-Gi?","p":"<strong>Gi training</strong> uses a traditional uniform (kimono) which allows for grip-based techniques — grabbing the collar, sleeves, and lapels opens up a wide range of chokes and control options. <strong>No-Gi training</strong> uses rash guards and shorts, focusing on wrestling-based grips and body control. Both develop different and complementary skills. We teach both styles at Legacy X."}'::jsonb),
  ('faq/faq-list/faq-list', 7, 7, '{"faq-q-text":"Can I compete?","p":"Absolutely. We have an <strong>active competition team</strong> coached by experienced competitors. For those who want to compete, we provide structured preparation including drilling, live rounds, and competition-specific strategy. Competition is completely optional — many of our students train purely for fitness, self-defense, and personal growth with no interest in competing, and that is equally valued here."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'faq/faq-list/faq-list');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('index/programs/programs-grid', 0, 0, '{"program-icon":"🥋","program-age":"Adults 16+ · Gi & No-Gi","program-name":"Adult Jiu-Jitsu","program-desc":"Fundamentals-focused classes in both Gi and No-Gi covering movement, positional control, escapes, and submissions. Built for all levels."}'::jsonb),
  ('index/programs/programs-grid', 1, 1, '{"program-icon":"👦","program-age":"Kids & Teens · Ages 4–15","program-name":"Kids Jiu-Jitsu","program-desc":"Three age groups — Little Warriors (4–6), Legacy Juniors (7–12), and Legacy Next Gen (13–15) — building movement, skills, and confidence in an engaging, positive environment."}'::jsonb),
  ('index/programs/programs-grid', 2, 2, '{"program-icon":"👩","program-age":"Women 16+ · All levels","program-name":"Women''s Only","program-desc":"A dedicated program built for women. Train in a supportive, focused environment with structured instruction — no experience needed to start."}'::jsonb),
  ('index/programs/programs-grid', 3, 3, '{"program-icon":"🏅","program-age":"55+ · All levels","program-name":"Jiu-Jitsu Over 55","program-desc":"Jiu-Jitsu is for every age. This program is tailored to the needs and pace of practitioners 55 and older — focused on movement, longevity, and staying active on the mats."}'::jsonb),
  ('index/programs/programs-grid', 4, 4, '{"program-icon":"🏆","program-age":"Intermediate–Advanced","program-name":"Competition","program-desc":"Structured training for athletes preparing for IBJJF/OJA-sanctioned events and tournaments. Drilling, live rounds, strategy, and competition-specific preparation."}'::jsonb),
  ('index/programs/programs-grid', 5, 5, '{"program-icon":"🎯","program-age":"All levels · 1-on-1","program-name":"Private Lessons","program-desc":"One-on-one coaching built around your personal goals, your pace, and your schedule. Accelerate your progress with dedicated private lessons."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'index/programs/programs-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('index/why-legacy-x/why-left', 0, 0, '{"why-intro":"Legacy X Jiu-Jitsu was built on a simple belief: Jiu-Jitsu can change lives when it’s taught in the right environment."}'::jsonb),
  ('index/why-legacy-x/why-left', 1, 1, '{"why-intro":"Through structured teaching, purposeful training, and a community that supports one another, we create a place where kids, teens, and adults can build skills, confidence, resilience, and lasting relationships."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'index/why-legacy-x/why-left');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('index/why-legacy-x/why-items', 0, 0, '{"why-num":"01","why-title":"Curriculum-driven teaching","why-desc":"Every class is part of a structured learning path. Students progress from movement and fundamentals to positional control, escapes, transitions, and offense — building skills step by step instead of simply collecting techniques.","why-badge":"A clear path from White Belt to Black Belt."}'::jsonb),
  ('index/why-legacy-x/why-items', 1, 1, '{"why-num":"02","why-title":"Safe, welcoming environment","why-desc":"Respect comes first. We’re committed to providing a clean, positive, and ego-free training environment where beginners feel welcome and experienced students continue to grow.","why-desc-2":"No intimidation. No pressure to keep up.","why-badge":"Come as you are. Start where you are."}'::jsonb),
  ('index/why-legacy-x/why-items', 2, 2, '{"why-num":"03","why-title":"Real community","why-desc":"Jiu-Jitsu is better when you feel like you belong. We’re building a community where coaches know their students, training partners support one another, and everyone has a role in helping the people around them improve.","why-badge":"Come train. Grow. Belong."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'index/why-legacy-x/why-items');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('index/why-legacy-x/why-right', 0, 0, '{"why-visual-big":"June<br/>2026","why-visual-label":"Legacy X opened its doors"}'::jsonb),
  ('index/why-legacy-x/why-right', 1, 1, '{"why-visual-big":"Understand<br/>Apply<br/>Grow","why-visual-label":"Your journey starts with the fundamentals — and every class moves you one step forward."}'::jsonb),
  ('index/why-legacy-x/why-right', 2, 2, '{"why-visual-big":"Free","why-visual-label":"First class — no commitment required"}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'index/why-legacy-x/why-right');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('index/testimonials/testimonials-grid', 0, 0, '{"testimonial-text":"\"Congratulation on your black belt and you are an awesome teammate and teacher. You are the one that coached me through my first ever tournament win and i''ll never forget that! Thanks\"","testimonial-meta":"Brody. F · Adult Student"}'::jsonb),
  ('index/testimonials/testimonials-grid', 1, 1, '{"testimonial-text":"\"Training with Francis has been one of the highlights of my jiu-jitsu journey. I’ve known him since I first started Brazilian Jiu-Jitsu, and I always looked forward to his Monday night classes because he had a unique way of grabbing your attention and making every lesson engaging. He taught me so much about lapel grips and the finer details of technique, and he always took the time to walk around the mat after demonstrating a move to make sure each of us truly understood it. Seeing him earn his black belt was no surprise—his dedication, teaching ability, and passion for the art are unmatched. He was, and still is, one of my favorite instructors to learn jiu-jitsu in the gi.\"","testimonial-meta":"Nicholas C. · Adult Student"}'::jsonb),
  ('index/testimonials/testimonials-grid', 2, 2, '{"testimonial-text":"\"You’ve really helped me with your coaching—both in tournaments and my superfight—and of course with your lessons every Monday, which I always look forward to. In and out of the gym, you’ve supported me. Thank you.\"","testimonial-meta":"Matthew L. · Adult Student"}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'index/testimonials/testimonials-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('index/gallery/mosaic', 0, 0, '{"mosaic-photo":"","mosaic-placeholder-text":"BJJ","mosaic-cell-label":"Adult Class"}'::jsonb),
  ('index/gallery/mosaic', 1, 1, '{"mosaic-photo":"","mosaic-placeholder-text":"GI","mosaic-cell-label":"Drilling"}'::jsonb),
  ('index/gallery/mosaic', 2, 2, '{"mosaic-photo":"","mosaic-placeholder-text":"X","mosaic-cell-label":"Legacy X"}'::jsonb),
  ('index/gallery/mosaic', 3, 3, '{"mosaic-photo":"","mosaic-placeholder-text":"KIDS","mosaic-cell-label":"Kids Program"}'::jsonb),
  ('index/gallery/mosaic', 4, 4, '{"mosaic-photo":"","mosaic-placeholder-text":"ROLL","mosaic-cell-label":"Live Rolling"}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'index/gallery/mosaic');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('instructors/head-coach-francis-yanga/instructor-stats', 0, 0, '{"stat-label":"Belt Rank","stat-value":"Black Belt"}'::jsonb),
  ('instructors/head-coach-francis-yanga/instructor-stats', 1, 1, '{"stat-label":"Lineage","stat-value":"<a href=\"our-lineage.html\" style=\"text-decoration:underline;text-underline-offset:3px;\">Thomas Armstrong</a>"}'::jsonb),
  ('instructors/head-coach-francis-yanga/instructor-stats', 2, 2, '{"stat-label":"Years Training","stat-value":"10+"}'::jsonb),
  ('instructors/head-coach-francis-yanga/instructor-stats', 3, 3, '{"stat-label":"Focus","stat-value":"Champions On & Off the Mat"}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'instructors/head-coach-francis-yanga/instructor-stats');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('our-lineage/what-lineage-means/meaning-right', 0, 0, '{"meaning-block-title":"Technique with context","meaning-block-body":"Every technique we teach has a lineage. Understanding that lineage tells you not just how to do it — but why it works and where it came from."}'::jsonb),
  ('our-lineage/what-lineage-means/meaning-right', 1, 1, '{"meaning-block-title":"Accountability through heritage","meaning-block-body":"Lineage holds coaches accountable. It connects what happens on the mat to a tradition that is bigger than any one person or academy."}'::jsonb),
  ('our-lineage/what-lineage-means/meaning-right', 2, 2, '{"meaning-block-title":"You carry it forward","meaning-block-body":"Every student who trains at Legacy X becomes part of this chain. The art grows through you — on the mats, in competition, and in how you train the people around you."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'our-lineage/what-lineage-means/meaning-right');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('privacy/policy-body/policy-body', 0, 0, '{"section-num":"Section 01","section-title":"Information We Collect","p":"When you interact with Legacy X Jiu-Jitsu, we may collect the following types of information:","li":"<strong>Personal identification information:</strong> name, email address, phone number.","li-2":"Contact form submissions and inquiry details.","li-3":"Membership and enrollment information.","li-4":"Usage data: pages visited, time spent, and browser type collected via analytics."}'::jsonb),
  ('privacy/policy-body/policy-body', 1, 1, '{"section-num":"Section 02","section-title":"How We Use Your Information","p":"We use the information we collect to:","li":"Respond to your inquiries and requests.","li-2":"Process and manage membership registrations.","li-3":"Send relevant communications about classes, events, and updates.","li-4":"Improve the quality of our website and services.","li-5":"Comply with legal obligations."}'::jsonb),
  ('privacy/policy-body/policy-body', 2, 2, '{"section-num":"Section 03","section-title":"Sharing Your Information","p":"We <strong>do not sell, trade, or rent</strong> your personal information to third parties. We may share data with trusted service providers who assist in operating our website and conducting our business, provided they agree to keep this information confidential.","p-2":"We may also disclose information when required by law or to protect the rights, property, or safety of Legacy X Jiu-Jitsu or others."}'::jsonb),
  ('privacy/policy-body/policy-body', 3, 3, '{"section-num":"Section 04","section-title":"Data Retention","p":"We retain your personal information only for as long as necessary to fulfill the purposes outlined in this policy, or as required by law. You may <strong>request deletion of your data at any time</strong> by contacting us."}'::jsonb),
  ('privacy/policy-body/policy-body', 4, 4, '{"section-num":"Section 05","section-title":"Cookies","p":"Our website may use cookies to enhance your browsing experience. Cookies are small files stored on your device that help us analyze site traffic and remember your preferences.","p-2":"You can configure your browser to refuse cookies, though some features of the site may not function correctly as a result."}'::jsonb),
  ('privacy/policy-body/policy-body', 5, 5, '{"section-num":"Section 06","section-title":"Security","p":"We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.","p-2":"However, no method of internet transmission is 100% secure, and we cannot guarantee absolute security."}'::jsonb),
  ('privacy/policy-body/policy-body', 6, 6, '{"section-num":"Section 07","section-title":"Your Rights","p":"You have the right to:","li":"Access the personal information we hold about you.","li-2":"Request correction of inaccurate data.","li-3":"Request deletion of your data.","li-4":"Withdraw consent for communications at any time."}'::jsonb),
  ('privacy/policy-body/policy-body', 7, 7, '{"section-num":"Section 08","section-title":"Contact","p":"If you have questions about this Privacy Policy or wish to exercise your rights, please contact us at <a href=\"mailto:info@legacyxjiujitsu.com\">info@legacyxjiujitsu.com</a> or visit our <a href=\"contact.html\">contact page</a>."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'privacy/policy-body/policy-body');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/programs-grid/programs-overview-grid', 0, 0, '{"prog-icon":"🥋","prog-tag":"Adults 16+ · Gi & No-Gi · All levels","prog-name":"Adult Jiu-Jitsu","prog-desc":"Our flagship adult program covers the full spectrum of Brazilian Jiu-Jitsu — from foundational movement and positional awareness through to escapes, control, and submission offense. Structured for progression, open to all experience levels.","prog-detail":"<span class=\"prog-detail-icon\">📍</span> 27 Bysham Park Drive, Woodstock ON","prog-detail-2":"<span class=\"prog-detail-icon\">✅</span> No experience required to start"}'::jsonb),
  ('programs/programs-grid/programs-overview-grid', 1, 1, '{"prog-icon":"👦","prog-tag":"Kids & Teens · Gi & No-Gi · Ages 4–15","prog-name":"Kids Jiu-Jitsu","prog-desc":"A fun, structured program introducing children to movement fundamentals, discipline, and confidence through Jiu-Jitsu. Three age groups — Little Warriors (4–6), Legacy Juniors (7–12), and Legacy Next Gen (13–15) — each with games, exercises, and age-appropriate technique in a positive, encouraging environment.","prog-detail":"<span class=\"prog-detail-icon\">📍</span> 27 Bysham Park Drive, Woodstock ON","prog-detail-2":"<span class=\"prog-detail-icon\">✅</span> Trial classes available"}'::jsonb),
  ('programs/programs-grid/programs-overview-grid', 2, 2, '{"prog-icon":"👩","prog-tag":"Women 16+ · All levels","prog-name":"Women''s Only","prog-desc":"A dedicated program for women of all experience levels in a focused, supportive environment. Covers self-defense applications, fundamental Jiu-Jitsu technique, and positional training in a space built specifically for women to learn and grow.","prog-detail":"<span class=\"prog-detail-icon\">✅</span> No prior experience needed","prog-detail-2":"<span class=\"prog-detail-icon\">💬</span> Safe, welcoming environment"}'::jsonb),
  ('programs/programs-grid/programs-overview-grid', 4, 3, '{"prog-icon":"🏆","prog-tag":"Intermediate–Advanced · Gi & No-Gi","prog-name":"Competition","prog-desc":"Structured preparation for IBJJF/OJA-sanctioned events and open tournaments. This program covers competition strategy, drilling under fatigue, live rounds with intensity, and the mental preparation needed to perform under pressure.","prog-detail":"<span class=\"prog-detail-icon\">🏅</span> OJA registration required to compete","prog-detail-2":"<span class=\"prog-detail-icon\">✅</span> Some prior training recommended"}'::jsonb),
  ('programs/programs-grid/programs-overview-grid', 3, 4, '{"prog-icon":"🏅","prog-tag":"55+ · All levels · Low impact","prog-name":"Jiu-Jitsu Over 55","prog-desc":"Jiu-Jitsu is for every body and every age. This program is designed specifically around the needs, pace, and goals of practitioners 55 and older — prioritizing movement quality, longevity, joint health, and staying active. You''ll work on the same foundational principles as our adult program, adapted to train smart and stay on the mats for years to come.","prog-detail":"<span class=\"prog-detail-icon\">✅</span> Modified pacing and partner work","prog-detail-2":"<span class=\"prog-detail-icon\">🧠</span> Focus on movement, health & longevity","prog-detail-3":"<span class=\"prog-detail-icon\">💬</span> No prior experience required"}'::jsonb),
  ('programs/programs-grid/programs-overview-grid', 5, 5, '{"prog-icon":"🎯","prog-tag":"All levels · 1-on-1","prog-name":"Private Lessons","prog-desc":"Work directly with Coach Francis in a one-on-one setting tailored entirely to your goals, questions, and areas of focus. Whether you''re accelerating your fundamentals, preparing for competition, or fixing a specific problem in your game — private lessons deliver results faster than group classes alone.","prog-detail":"<span class=\"prog-detail-icon\">✅</span> Available to all levels","prog-detail-2":"<span class=\"prog-detail-icon\">💬</span> Fully customized to your goals"}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/programs-grid/programs-overview-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('terms/terms-body/terms-body', 0, 0, '{"section-num":"Section 01","section-title":"Acceptance of Terms","p":"By accessing the Legacy X Jiu-Jitsu website or enrolling in any program offered by Legacy X Jiu-Jitsu, you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, please do not use our services."}'::jsonb),
  ('terms/terms-body/terms-body', 1, 1, '{"section-num":"Section 02","section-title":"Membership and Enrollment","p":"Membership at Legacy X Jiu-Jitsu is subject to the following conditions:","li":"Membership is personal and <strong>non-transferable</strong>.","li-2":"Members must complete a waiver and release of liability prior to participating in any class.","li-3":"Legacy X reserves the right to terminate membership for conduct that violates academy rules or creates an unsafe environment.","li-4":"Membership fees are due as outlined in your enrollment agreement. Failure to pay may result in suspension of access."}'::jsonb),
  ('terms/terms-body/terms-body', 2, 2, '{"section-num":"Section 03","section-title":"Health and Participation","p":"Participation in martial arts training involves <strong>inherent physical risk</strong>. By enrolling, you acknowledge that you are physically capable of participating in training activities and agree to inform our instructors of any medical conditions or injuries before participating.","p-2":"Legacy X Jiu-Jitsu is not liable for injuries sustained during training that result from failure to disclose known medical conditions."}'::jsonb),
  ('terms/terms-body/terms-body', 3, 3, '{"section-num":"Section 04","section-title":"Code of Conduct","p":"All members are expected to:","li":"Treat all students, instructors, and staff with respect.","li-2":"Follow the <a href=\"etiquette.html\">Academy Etiquette guidelines</a> at all times.","li-3":"Refrain from using techniques in a reckless or harmful manner.","li-4":"Report any concerns or unsafe behaviour to an instructor immediately."}'::jsonb),
  ('terms/terms-body/terms-body', 4, 4, '{"section-num":"Section 05","section-title":"Cancellations and Refunds","p":"Membership cancellation requests must be submitted <strong>in writing with a minimum of 30 days notice</strong> as specified in your enrollment agreement.","p-2":"Prepaid membership fees are non-refundable except where required by applicable law. Legacy X reserves the right to modify class schedules, instructors, and program offerings."}'::jsonb),
  ('terms/terms-body/terms-body', 5, 5, '{"section-num":"Section 06","section-title":"Intellectual Property","p":"All content on this website, including text, images, logos, and video, is the <strong>property of Legacy X Jiu-Jitsu</strong> and may not be reproduced, distributed, or used without prior written consent."}'::jsonb),
  ('terms/terms-body/terms-body', 6, 6, '{"section-num":"Section 07","section-title":"Limitation of Liability","p":"To the maximum extent permitted by law, Legacy X Jiu-Jitsu shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of our services or website.","p-2":"Our total liability in any matter arising out of or related to these terms shall not exceed the amount you paid for services in the <strong>three months preceding the claim</strong>."}'::jsonb),
  ('terms/terms-body/terms-body', 7, 7, '{"section-num":"Section 08","section-title":"Governing Law","p":"These Terms and Conditions are governed by the <strong>laws of the Province of Ontario</strong> and the federal laws of Canada applicable therein. Any disputes shall be resolved exclusively in the courts of Ontario."}'::jsonb),
  ('terms/terms-body/terms-body', 8, 8, '{"section-num":"Section 09","section-title":"Changes to These Terms","p":"Legacy X Jiu-Jitsu reserves the right to update these Terms and Conditions at any time. Changes will be posted on this page with an updated effective date.","p-2":"Continued use of our services after any changes constitutes your acceptance of the revised terms."}'::jsonb),
  ('terms/terms-body/terms-body', 9, 9, '{"section-num":"Section 10","section-title":"Contact","p":"For questions about these Terms and Conditions, please contact us at <a href=\"mailto:info@legacyxjiujitsu.com\">info@legacyxjiujitsu.com</a> or visit our <a href=\"contact.html\">contact page</a>."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'terms/terms-body/terms-body');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/adult-jiu-jitsu/what-you-ll-learn/curriculum-grid', 0, 0, '{"curr-num":"01","curr-name":"Movement","curr-desc":"How to fall safely, move on the ground, and use your body efficiently. The foundation everything else is built on."}'::jsonb),
  ('programs/adult-jiu-jitsu/what-you-ll-learn/curriculum-grid', 1, 1, '{"curr-num":"02","curr-name":"Positional Control","curr-desc":"Understanding the key positions of Jiu-Jitsu — how to get there, how to hold them, and why position comes before submission."}'::jsonb),
  ('programs/adult-jiu-jitsu/what-you-ll-learn/curriculum-grid', 2, 2, '{"curr-num":"03","curr-name":"Escapes","curr-desc":"Staying calm under pressure and getting out of bad positions. The skills that build real confidence on and off the mat."}'::jsonb),
  ('programs/adult-jiu-jitsu/what-you-ll-learn/curriculum-grid', 3, 3, '{"curr-num":"04","curr-name":"Submissions","curr-desc":"Chokes, joint locks, and the setups that lead to them — applied with control, so your training partners stay safe."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/adult-jiu-jitsu/what-you-ll-learn/curriculum-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/adult-jiu-jitsu/gi-no-gi/split-grid', 0, 0, '{"split-tag":"Traditional Uniform","split-name":"Gi","split-desc":"Gi training uses a traditional uniform (kimono) which allows for grip-based techniques.","li":"Collar, sleeve, and lapel grips","li-2":"A wide range of chokes and control options","li-3":"Loaner gis available for trial classes"}'::jsonb),
  ('programs/adult-jiu-jitsu/gi-no-gi/split-grid', 1, 1, '{"split-tag":"Rash Guard & Shorts","split-name":"No-Gi","split-desc":"No-Gi training uses rash guards and shorts, focusing on wrestling-based grips and body control.","li":"Wrestling-based grips","li-2":"Body control and pace","li-3":"Train in a rash guard and shorts"}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/adult-jiu-jitsu/gi-no-gi/split-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/adult-jiu-jitsu/class-flow/flow', 0, 0, '{"flow-index":"Step 01","flow-name":"Warm-Up","flow-desc":"Proper warm-ups and Jiu-Jitsu-specific movement to get your body ready for the mat."}'::jsonb),
  ('programs/adult-jiu-jitsu/class-flow/flow', 1, 1, '{"flow-index":"Step 02","flow-name":"Technique","flow-desc":"The technique of the day is demonstrated and broken down step by step."}'::jsonb),
  ('programs/adult-jiu-jitsu/class-flow/flow', 2, 2, '{"flow-index":"Step 03","flow-name":"Drilling","flow-desc":"Controlled drilling with a partner, building the reps until the movement becomes yours."}'::jsonb),
  ('programs/adult-jiu-jitsu/class-flow/flow', 3, 3, '{"flow-index":"Step 04","flow-name":"Sparring","flow-desc":"Supervised live rolling. Beginners are never thrown into a live roll before they are ready."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/adult-jiu-jitsu/class-flow/flow');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/adult-jiu-jitsu/your-first-class/checklist', 0, 0, '{"check-title":"What to wear","check-desc":"Comfortable athletic clothing — a t-shirt and shorts or athletic pants works perfectly. No shoes are worn on the mat."}'::jsonb),
  ('programs/adult-jiu-jitsu/your-first-class/checklist', 1, 1, '{"check-title":"No gear to buy","check-desc":"We provide loaner gis for trial classes, so you don''t need to buy anything before you decide to commit."}'::jsonb),
  ('programs/adult-jiu-jitsu/your-first-class/checklist', 2, 2, '{"check-title":"Safety first","check-desc":"Our culture of tapping early and training with control keeps everyone safe."}'::jsonb),
  ('programs/adult-jiu-jitsu/your-first-class/checklist', 3, 3, '{"check-title":"Where to go","check-desc":"27 Bysham Park Drive (Unit 1), Woodstock, ON. Check the <a href=\"../schedule.html\" style=\"color:var(--blue);\">class schedule</a> for times."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/adult-jiu-jitsu/your-first-class/checklist');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/adult-jiu-jitsu/testimonials/quote-grid', 0, 0, '{"quote-text":"\"I had zero experience. I walked in nervous and walked out wanting to come back every night. The community is what makes this place.\"","quote-meta":"Adult Beginner · Woodstock"}'::jsonb),
  ('programs/adult-jiu-jitsu/testimonials/quote-grid', 1, 1, '{"quote-text":"\"I''ve trained at a few gyms over the years. Legacy X is the first one where I feel like the coach actually cares about your long-term development, not just filling spots.\"","quote-meta":"Returning Practitioner"}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/adult-jiu-jitsu/testimonials/quote-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/adult-jiu-jitsu/faq/faq-list', 0, 0, '{"summary":"How old do I need to be?","faq-answer":"The adult program is for students 16 and older. Younger students train in our <a href=\"kids-jiu-jitsu.html\" style=\"color:var(--blue);\">Kids program</a>, where Legacy Next Gen covers ages 13–15."}'::jsonb),
  ('programs/adult-jiu-jitsu/faq/faq-list', 1, 1, '{"summary":"Do I need any experience to start?","faq-answer":"Absolutely not. The adult program is open to all levels, and beginners with zero martial arts experience are welcome. We''ll guide you through every step — from how to fall safely, to your first techniques, to your first roll."}'::jsonb),
  ('programs/adult-jiu-jitsu/faq/faq-list', 2, 2, '{"summary":"I''m not in shape. Should I wait?","faq-answer":"No — Jiu-Jitsu is how you get in shape. Classes start with a proper warm-up, and you''re encouraged to work at your own pace. Consistency matters far more than fitness on day one."}'::jsonb),
  ('programs/adult-jiu-jitsu/faq/faq-list', 3, 3, '{"summary":"How often should I train?","faq-answer":"We recommend 2–3 times per week for beginners. Consistency is more important than intensity when starting out — showing up regularly and allowing your body time to recover will take you further than training every day."}'::jsonb),
  ('programs/adult-jiu-jitsu/faq/faq-list', 4, 4, '{"summary":"Is it safe?","faq-answer":"Yes. Safety is our top priority. Classes are structured with proper warm-ups, controlled drilling, and supervised sparring. You will never be thrown into a live roll before you are ready, and our culture of tapping early and training with control keeps everyone safe."}'::jsonb),
  ('programs/adult-jiu-jitsu/faq/faq-list', 5, 5, '{"summary":"Do I have to compete?","faq-answer":"Not at all. Competition is completely optional — many of our adult students train purely for fitness, self-defense, and personal growth, and that is equally valued here. If you do want to compete, our <a href=\"competition.html\" style=\"color:var(--blue);\">Competition program</a> can prepare you."}'::jsonb),
  ('programs/adult-jiu-jitsu/faq/faq-list', 6, 6, '{"summary":"Is the first class really free?","faq-answer":"Yes. Your first class is free with no commitment required. Bring a friend and you can both try a class together."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/adult-jiu-jitsu/faq/faq-list');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/competition/what-you-ll-train/curriculum-grid', 0, 0, '{"curr-num":"01","curr-name":"Competition Strategy","curr-desc":"Game plans, scoring, and making smart decisions under the rules — so you know what to do before the match starts."}'::jsonb),
  ('programs/competition/what-you-ll-train/curriculum-grid', 1, 1, '{"curr-num":"02","curr-name":"Drilling Under Fatigue","curr-desc":"Technique that holds up when you''re tired, because that''s when matches are won and lost."}'::jsonb),
  ('programs/competition/what-you-ll-train/curriculum-grid', 2, 2, '{"curr-num":"03","curr-name":"Live Rounds","curr-desc":"Rounds with real intensity, so the pace of competition never catches you by surprise."}'::jsonb),
  ('programs/competition/what-you-ll-train/curriculum-grid', 3, 3, '{"curr-num":"04","curr-name":"Mental Preparation","curr-desc":"Managing nerves, staying focused, and performing under pressure when it counts."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/competition/what-you-ll-train/curriculum-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/competition/who-it-s-for/split-grid', 0, 0, '{"split-tag":"Experience","split-name":"Some Training","split-desc":"Some prior training is recommended. New to Jiu-Jitsu? Start with our <a href=\"adult-jiu-jitsu.html\" style=\"color:var(--blue);\">Adult program</a> and build your foundation first."}'::jsonb),
  ('programs/competition/who-it-s-for/split-grid', 1, 1, '{"split-tag":"Styles","split-name":"Gi & No-Gi","split-desc":"Preparation for both Gi and No-Gi events, from IBJJF/OJA-sanctioned competitions to open tournaments."}'::jsonb),
  ('programs/competition/who-it-s-for/split-grid', 2, 2, '{"split-tag":"Always Optional","split-name":"Your Choice","split-desc":"Competition is completely optional. Many students train purely for fitness, self-defense, and personal growth — and that is equally valued here."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/competition/who-it-s-for/split-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/competition/oja/checklist', 0, 0, '{"check-title":"Required to compete","check-desc":"OJA membership is required for OJA-sanctioned competition events."}'::jsonb),
  ('programs/competition/oja/checklist', 1, 1, '{"check-title":"Select Legacy X as your club","check-desc":"When registering, choose Legacy X Jiu-Jitsu as your gym/club to link your membership directly to our academy."}'::jsonb),
  ('programs/competition/oja/checklist', 2, 2, '{"check-title":"Insurance coverage","check-desc":"Registered members are covered under the association''s liability and accident insurance."}'::jsonb),
  ('programs/competition/oja/checklist', 3, 3, '{"check-title":"A provincial community","check-desc":"Join a broader community of practitioners across Ontario."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/competition/oja/checklist');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/competition/faq/faq-list', 0, 0, '{"summary":"Do I have to compete?","faq-answer":"No. Competition is completely optional. Many of our students train purely for fitness, self-defense, and personal growth with no interest in competing, and that is equally valued here."}'::jsonb),
  ('programs/competition/faq/faq-list', 1, 1, '{"summary":"Can beginners join?","faq-answer":"Some prior training is recommended. If you''re new to Jiu-Jitsu, start in our <a href=\"adult-jiu-jitsu.html\" style=\"color:var(--blue);\">Adult program</a> to build your fundamentals first."}'::jsonb),
  ('programs/competition/faq/faq-list', 2, 2, '{"summary":"Do I need to register with the OJA?","faq-answer":"Yes. OJA registration is required to compete in sanctioned events. When you register, select Legacy X Jiu-Jitsu as your gym/club."}'::jsonb),
  ('programs/competition/faq/faq-list', 3, 3, '{"summary":"Do you compete in Gi or No-Gi?","faq-answer":"Both. The program prepares you for Gi and No-Gi competition, from IBJJF/OJA-sanctioned events to open tournaments."}'::jsonb),
  ('programs/competition/faq/faq-list', 4, 4, '{"summary":"What does the preparation include?","faq-answer":"Competition strategy, drilling under fatigue, live rounds with intensity, and the mental preparation needed to perform under pressure."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/competition/faq/faq-list');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/jiu-jitsu-over-55/focus-areas/curriculum-grid', 0, 0, '{"curr-num":"01","curr-name":"Movement Quality","curr-desc":"Balance, coordination, and moving with control — on the mat and in everyday life."}'::jsonb),
  ('programs/jiu-jitsu-over-55/focus-areas/curriculum-grid', 1, 1, '{"curr-num":"02","curr-name":"Joint Health","curr-desc":"Techniques and drills chosen with your joints in mind, so you can train without unnecessary strain."}'::jsonb),
  ('programs/jiu-jitsu-over-55/focus-areas/curriculum-grid', 2, 2, '{"curr-num":"03","curr-name":"Longevity","curr-desc":"Building habits and skills you can keep practicing for years, not months."}'::jsonb),
  ('programs/jiu-jitsu-over-55/focus-areas/curriculum-grid', 3, 3, '{"curr-num":"04","curr-name":"Staying Active","curr-desc":"A regular, engaging way to keep your body and mind working — with a community that shows up alongside you."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/jiu-jitsu-over-55/focus-areas/curriculum-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/jiu-jitsu-over-55/train-smart/split-grid', 0, 0, '{"split-tag":"Low Impact","split-name":"Modified Pacing","split-desc":"Classes move at a pace that respects your body, with time to learn each movement properly."}'::jsonb),
  ('programs/jiu-jitsu-over-55/train-smart/split-grid', 1, 1, '{"split-tag":"Controlled","split-name":"Partner Work","split-desc":"Partner drills are adapted for control and safety, so you can practice with confidence."}'::jsonb),
  ('programs/jiu-jitsu-over-55/train-smart/split-grid', 2, 2, '{"split-tag":"Real Technique","split-name":"Same Foundations","split-desc":"The same core principles taught in our adult program — just adapted to fit your needs and goals."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/jiu-jitsu-over-55/train-smart/split-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/jiu-jitsu-over-55/class-flow/flow', 0, 0, '{"flow-index":"Step 01","flow-name":"Warm-Up","flow-desc":"Gentle warm-ups and mobility work to get your body ready for the mat."}'::jsonb),
  ('programs/jiu-jitsu-over-55/class-flow/flow', 1, 1, '{"flow-index":"Step 02","flow-name":"Technique","flow-desc":"The technique of the day is demonstrated and broken down step by step."}'::jsonb),
  ('programs/jiu-jitsu-over-55/class-flow/flow', 2, 2, '{"flow-index":"Step 03","flow-name":"Drilling","flow-desc":"Controlled practice with a partner at a comfortable pace, building skill one rep at a time."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/jiu-jitsu-over-55/class-flow/flow');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/jiu-jitsu-over-55/your-first-class/checklist', 0, 0, '{"check-title":"What to wear","check-desc":"Comfortable athletic clothing — a t-shirt and shorts or athletic pants works perfectly. No shoes are worn on the mat."}'::jsonb),
  ('programs/jiu-jitsu-over-55/your-first-class/checklist', 1, 1, '{"check-title":"No gear to buy","check-desc":"We provide loaner gis for trial classes, so you don''t need to buy anything before you decide to commit."}'::jsonb),
  ('programs/jiu-jitsu-over-55/your-first-class/checklist', 2, 2, '{"check-title":"Safety first","check-desc":"Our culture of tapping early and training with control keeps everyone safe."}'::jsonb),
  ('programs/jiu-jitsu-over-55/your-first-class/checklist', 3, 3, '{"check-title":"Where to go","check-desc":"27 Bysham Park Drive (Unit 1), Woodstock, ON. Check the <a href=\"../schedule.html\" style=\"color:var(--blue);\">class schedule</a> for times."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/jiu-jitsu-over-55/your-first-class/checklist');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/jiu-jitsu-over-55/faq/faq-list', 0, 0, '{"summary":"Am I too old to start Jiu-Jitsu?","faq-answer":"Not at all. Jiu-Jitsu is for every body and every age, and this program is designed specifically for practitioners 55 and older."}'::jsonb),
  ('programs/jiu-jitsu-over-55/faq/faq-list', 1, 1, '{"summary":"Do I need any experience?","faq-answer":"No prior experience is required. We''ll guide you through every step, from how to fall safely to your first techniques."}'::jsonb),
  ('programs/jiu-jitsu-over-55/faq/faq-list', 2, 2, '{"summary":"How is it different from the adult program?","faq-answer":"You''ll learn the same foundational principles as our <a href=\"adult-jiu-jitsu.html\" style=\"color:var(--blue);\">Adult program</a>, with modified pacing and partner work, and a focus on movement, health, and longevity."}'::jsonb),
  ('programs/jiu-jitsu-over-55/faq/faq-list', 3, 3, '{"summary":"Is it safe?","faq-answer":"Yes. Safety is our top priority. The program is low impact, and our culture of tapping early and training with control keeps everyone safe."}'::jsonb),
  ('programs/jiu-jitsu-over-55/faq/faq-list', 4, 4, '{"summary":"Is the first class really free?","faq-answer":"Yes. Your first class is free with no commitment required. Bring a friend and you can both try a class together."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/jiu-jitsu-over-55/faq/faq-list');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/kids-jiu-jitsu/age-groups/groups-grid', 0, 0, '{"group-ages":"Ages 4–6","group-name":"Little Warriors","group-tagline":"Move. Learn. Grow.","group-desc":"A first step onto the mat. Our youngest students build balance, coordination, and listening skills through games and simple movements, all while having fun."}'::jsonb),
  ('programs/kids-jiu-jitsu/age-groups/groups-grid', 1, 1, '{"group-ages":"Ages 7–12","group-name":"Legacy Juniors","group-tagline":"Build Skills. Build Confidence. Build Character.","group-desc":"Jiu-Jitsu fundamentals taught through structured drills, games, and age-appropriate technique, with a focus on discipline, respect, and confidence."}'::jsonb),
  ('programs/kids-jiu-jitsu/age-groups/groups-grid', 2, 2, '{"group-ages":"Ages 13–15","group-name":"Legacy Next Gen","group-tagline":"Develop Your Game.","group-desc":"For teens ready to go deeper — sharper technique, more positional work, and the foundation to step into the adult program at 16."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/kids-jiu-jitsu/age-groups/groups-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/kids-jiu-jitsu/what-kids-gain/curriculum-grid', 0, 0, '{"curr-num":"01","curr-name":"Movement","curr-desc":"Rolling, falling safely, balance, and coordination — the movement fundamentals every young athlete needs."}'::jsonb),
  ('programs/kids-jiu-jitsu/what-kids-gain/curriculum-grid', 1, 1, '{"curr-num":"02","curr-name":"Discipline","curr-desc":"Listening, following instructions, and showing respect for coaches and training partners, every class."}'::jsonb),
  ('programs/kids-jiu-jitsu/what-kids-gain/curriculum-grid', 2, 2, '{"curr-num":"03","curr-name":"Confidence","curr-desc":"Learning something hard and getting better at it. Every new skill is proof they can do more than they thought."}'::jsonb),
  ('programs/kids-jiu-jitsu/what-kids-gain/curriculum-grid', 3, 3, '{"curr-num":"04","curr-name":"Fun","curr-desc":"Games and exercises keep kids engaged and moving, so they look forward to coming back every week."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/kids-jiu-jitsu/what-kids-gain/curriculum-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/kids-jiu-jitsu/class-flow/flow', 0, 0, '{"flow-index":"Part 01","flow-name":"Exercises","flow-desc":"Warm-ups and movement exercises that build strength, balance, and coordination."}'::jsonb),
  ('programs/kids-jiu-jitsu/class-flow/flow', 1, 1, '{"flow-index":"Part 02","flow-name":"Games","flow-desc":"Jiu-Jitsu games that teach real skills while keeping the energy high and the mood positive."}'::jsonb),
  ('programs/kids-jiu-jitsu/class-flow/flow', 2, 2, '{"flow-index":"Part 03","flow-name":"Technique","flow-desc":"Age-appropriate technique, taught step by step and practiced with a partner."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/kids-jiu-jitsu/class-flow/flow');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/kids-jiu-jitsu/first-class/checklist', 0, 0, '{"check-title":"What to wear","check-desc":"Comfortable athletic clothing — a t-shirt and shorts or athletic pants works perfectly. No shoes are worn on the mat."}'::jsonb),
  ('programs/kids-jiu-jitsu/first-class/checklist', 1, 1, '{"check-title":"No gear to buy","check-desc":"We provide loaner gis for trial classes, so you don''t need to buy anything before you decide to commit."}'::jsonb),
  ('programs/kids-jiu-jitsu/first-class/checklist', 2, 2, '{"check-title":"Safe & supervised","check-desc":"Structured warm-ups, controlled practice, and close supervision from an experienced kids coach."}'::jsonb),
  ('programs/kids-jiu-jitsu/first-class/checklist', 3, 3, '{"check-title":"Where to go","check-desc":"27 Bysham Park Drive (Unit 1), Woodstock, ON. Check the <a href=\"../schedule.html\" style=\"color:var(--blue);\">class schedule</a> for your child''s group."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/kids-jiu-jitsu/first-class/checklist');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/kids-jiu-jitsu/faq/faq-list', 0, 0, '{"summary":"What age can my child start?","faq-answer":"Kids can start at age 4. Little Warriors is for ages 4–6, Legacy Juniors for ages 7–12, and Legacy Next Gen for ages 13–15. We assess each child individually to make sure they are ready for the class environment. If you''re unsure, reach out and we''re happy to discuss it with you before the first class."}'::jsonb),
  ('programs/kids-jiu-jitsu/faq/faq-list', 1, 1, '{"summary":"Does my child need any experience?","faq-answer":"No. The program is built to introduce children to Jiu-Jitsu from the very beginning, starting with movement fundamentals and building up from there."}'::jsonb),
  ('programs/kids-jiu-jitsu/faq/faq-list', 2, 2, '{"summary":"What happens when my child turns 16?","faq-answer":"Students 16 and older move up to our <a href=\"adult-jiu-jitsu.html\" style=\"color:var(--blue);\">Adult Jiu-Jitsu program</a>, where they keep building on everything they''ve learned."}'::jsonb),
  ('programs/kids-jiu-jitsu/faq/faq-list', 3, 3, '{"summary":"Is Jiu-Jitsu safe for kids?","faq-answer":"Yes. Safety is our top priority. Classes are structured with proper warm-ups and controlled, supervised practice, and technique is always age-appropriate."}'::jsonb),
  ('programs/kids-jiu-jitsu/faq/faq-list', 4, 4, '{"summary":"What should my child wear?","faq-answer":"Comfortable athletic clothing — a t-shirt and shorts or athletic pants. We provide loaner gis for trial classes, and no shoes are worn on the mat."}'::jsonb),
  ('programs/kids-jiu-jitsu/faq/faq-list', 5, 5, '{"summary":"Is the first class really free?","faq-answer":"Yes. Your child''s first class is free with no commitment required."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/kids-jiu-jitsu/faq/faq-list');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/private-lessons/what-we-can-work-on/curriculum-grid', 0, 0, '{"curr-num":"01","curr-name":"Fundamentals","curr-desc":"Accelerate your fundamentals with focused, detailed instruction and time to ask every question."}'::jsonb),
  ('programs/private-lessons/what-we-can-work-on/curriculum-grid', 1, 1, '{"curr-num":"02","curr-name":"Competition Prep","curr-desc":"Sharpen your game plan and prepare for your next tournament with one-on-one coaching."}'::jsonb),
  ('programs/private-lessons/what-we-can-work-on/curriculum-grid', 2, 2, '{"curr-num":"03","curr-name":"Problem Solving","curr-desc":"Stuck in a position or missing a technique? Fix a specific problem in your game, fast."}'::jsonb),
  ('programs/private-lessons/what-we-can-work-on/curriculum-grid', 3, 3, '{"curr-num":"04","curr-name":"Your Pace","curr-desc":"Move as quickly or as carefully as you need, with dedicated attention the whole session."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/private-lessons/what-we-can-work-on/curriculum-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/private-lessons/why-private/split-grid', 0, 0, '{"split-tag":"All Levels","split-name":"Any Experience","split-desc":"Available to all levels — from your very first lesson to refining an advanced game."}'::jsonb),
  ('programs/private-lessons/why-private/split-grid', 1, 1, '{"split-tag":"Customized","split-name":"Built for You","split-desc":"Every session is fully customized to your goals, questions, and areas of focus."}'::jsonb),
  ('programs/private-lessons/why-private/split-grid', 2, 2, '{"split-tag":"Flexible","split-name":"Your Schedule","split-desc":"Flexible scheduling, so you can book a session at a time that works for you."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/private-lessons/why-private/split-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/private-lessons/faq/faq-list', 0, 0, '{"summary":"Who teaches private lessons?","faq-answer":"Private lessons are taught one-on-one by Coach Francis Yanga, founder and head instructor of Legacy X."}'::jsonb),
  ('programs/private-lessons/faq/faq-list', 1, 1, '{"summary":"Do I need any experience?","faq-answer":"No. Private lessons are available to all levels, whether you''ve never trained before or you''re refining an advanced game."}'::jsonb),
  ('programs/private-lessons/faq/faq-list', 2, 2, '{"summary":"What can we work on?","faq-answer":"Anything that helps you reach your goals — accelerating your fundamentals, preparing for competition, or fixing a specific problem in your game."}'::jsonb),
  ('programs/private-lessons/faq/faq-list', 3, 3, '{"summary":"Do private lessons replace group classes?","faq-answer":"They work best together. Group classes build your base, and private lessons help you progress faster than group classes alone."}'::jsonb),
  ('programs/private-lessons/faq/faq-list', 4, 4, '{"summary":"How do I book?","faq-answer":"Use the <a href=\"#book\" style=\"color:var(--blue);\">booking form</a> on this page to choose a time. If you have questions first, <a href=\"../contact.html\" style=\"color:var(--blue);\">contact us</a>."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/private-lessons/faq/faq-list');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/womens-only/what-you-ll-learn/curriculum-grid', 0, 0, '{"curr-num":"01","curr-name":"Self-Defense","curr-desc":"Practical applications of Jiu-Jitsu for real situations — staying calm, creating space, and getting to safety."}'::jsonb),
  ('programs/womens-only/what-you-ll-learn/curriculum-grid', 1, 1, '{"curr-num":"02","curr-name":"Fundamentals","curr-desc":"The core techniques of Brazilian Jiu-Jitsu, from how to fall safely and move on the ground to escapes and submissions."}'::jsonb),
  ('programs/womens-only/what-you-ll-learn/curriculum-grid', 2, 2, '{"curr-num":"03","curr-name":"Positional Training","curr-desc":"Learning the key positions, how to hold them, and how to escape them — the skills that build real confidence on the mat."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/womens-only/what-you-ll-learn/curriculum-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/womens-only/why-women-s-only/split-grid', 0, 0, '{"split-tag":"Focused","split-name":"Your Pace","split-desc":"Structured instruction built around the women in the room, so you can focus on learning instead of keeping up."}'::jsonb),
  ('programs/womens-only/why-women-s-only/split-grid', 1, 1, '{"split-tag":"Supportive","split-name":"Your People","split-desc":"Train alongside other women who are learning and growing with you, in a safe, welcoming environment."}'::jsonb),
  ('programs/womens-only/why-women-s-only/split-grid', 2, 2, '{"split-tag":"All Levels","split-name":"Your Start","split-desc":"No prior experience needed. Whether it''s your first class or you''ve trained before, there''s a place for you here."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/womens-only/why-women-s-only/split-grid');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/womens-only/class-flow/flow', 0, 0, '{"flow-index":"Step 01","flow-name":"Warm-Up","flow-desc":"Proper warm-ups and Jiu-Jitsu-specific movement to get your body ready for the mat."}'::jsonb),
  ('programs/womens-only/class-flow/flow', 1, 1, '{"flow-index":"Step 02","flow-name":"Technique","flow-desc":"The technique of the day is demonstrated and broken down step by step."}'::jsonb),
  ('programs/womens-only/class-flow/flow', 2, 2, '{"flow-index":"Step 03","flow-name":"Drilling","flow-desc":"Controlled drilling with a partner, building the reps until the movement becomes yours."}'::jsonb),
  ('programs/womens-only/class-flow/flow', 3, 3, '{"flow-index":"Step 04","flow-name":"Sparring","flow-desc":"Supervised live rolling. You will never be put into a live roll before you are ready."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/womens-only/class-flow/flow');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/womens-only/your-first-class/checklist', 0, 0, '{"check-title":"What to wear","check-desc":"Comfortable athletic clothing — a t-shirt and shorts or athletic pants works perfectly. No shoes are worn on the mat."}'::jsonb),
  ('programs/womens-only/your-first-class/checklist', 1, 1, '{"check-title":"No gear to buy","check-desc":"We provide loaner gis for trial classes, so you don''t need to buy anything before you decide to commit."}'::jsonb),
  ('programs/womens-only/your-first-class/checklist', 2, 2, '{"check-title":"Safety first","check-desc":"Our culture of tapping early and training with control keeps everyone safe."}'::jsonb),
  ('programs/womens-only/your-first-class/checklist', 3, 3, '{"check-title":"Where to go","check-desc":"27 Bysham Park Drive (Unit 1), Woodstock, ON. Check the <a href=\"../schedule.html\" style=\"color:var(--blue);\">class schedule</a> for times."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/womens-only/your-first-class/checklist');

insert into public.cms_items (list_key, tpl, sort, fields)
select * from (values
  ('programs/womens-only/faq/faq-list', 0, 0, '{"summary":"Who can join?","faq-answer":"The program is open to women 16 and older, at every experience level."}'::jsonb),
  ('programs/womens-only/faq/faq-list', 1, 1, '{"summary":"Do I need any experience to start?","faq-answer":"No prior experience is needed. We''ll guide you through every step — from how to fall safely, to your first techniques, to your first roll."}'::jsonb),
  ('programs/womens-only/faq/faq-list', 2, 2, '{"summary":"Is it safe?","faq-answer":"Yes. Safety is our top priority. Classes are structured with proper warm-ups, controlled drilling, and supervised sparring, and our culture of tapping early and training with control keeps everyone safe."}'::jsonb),
  ('programs/womens-only/faq/faq-list', 3, 3, '{"summary":"Will I learn self-defense?","faq-answer":"Yes. Self-defense applications are one of the core parts of the program, alongside fundamental Jiu-Jitsu technique and positional training."}'::jsonb),
  ('programs/womens-only/faq/faq-list', 4, 4, '{"summary":"Is the first class really free?","faq-answer":"Yes. Your first class is free with no commitment required. Bring a friend and you can both try a class together."}'::jsonb)
) v(list_key, tpl, sort, fields)
where not exists (select 1 from public.cms_items where list_key = 'programs/womens-only/faq/faq-list');

