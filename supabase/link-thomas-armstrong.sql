-- One-time: make "Thomas Armstrong" in Coach Francis's sections link to the Our Lineage page.
-- Run in Supabase → SQL Editor, then press Publish site in the admin. Safe to run more than once.

-- Instructors page: bio paragraph
update public.cms_blocks
set value = replace(value, 'Thomas Armstrong',
      '<a href="our-lineage.html" style="text-decoration:underline;text-underline-offset:3px;">Thomas Armstrong</a>'),
    updated_at = now()
where key = 'instructors/head-coach-francis-yanga/p-2'
  and value not like '%our-lineage.html%';

-- Instructors page: "Lineage" stat
update public.cms_items
set fields = jsonb_set(fields, '{stat-value}',
      to_jsonb('<a href="our-lineage.html" style="text-decoration:underline;text-underline-offset:3px;">Thomas Armstrong</a>'::text)),
    updated_at = now()
where list_key = 'instructors/head-coach-francis-yanga/instructor-stats'
  and fields ->> 'stat-value' = 'Thomas Armstrong';

-- Adult Jiu-Jitsu page: coach card "Lineage" stat
update public.cms_blocks
set value = '<a href="../our-lineage.html" style="text-decoration:underline;text-underline-offset:3px;">Thomas Armstrong</a>',
    updated_at = now()
where key = 'programs/adult-jiu-jitsu/coach/coach-stat-value-2'
  and value = 'Thomas Armstrong';
