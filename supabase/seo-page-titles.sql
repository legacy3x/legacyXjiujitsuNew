-- Search-friendly page titles. Run once in Supabase → SQL Editor.
-- (The live site reads titles from the database; this updates them to match the page files.)
update public.cms_blocks set value = 'Brazilian Jiu-Jitsu in Woodstock, ON | Legacy X Jiu-Jitsu' where key = 'index/meta/title';
update public.cms_blocks set value = 'BJJ Programs in Woodstock, ON | Legacy X Jiu-Jitsu' where key = 'programs/meta/title';
update public.cms_blocks set value = 'BJJ Class Schedule in Woodstock, ON | Legacy X Jiu-Jitsu' where key = 'schedule/meta/title';
update public.cms_blocks set value = 'BJJ Instructors in Woodstock, ON | Legacy X Jiu-Jitsu' where key = 'instructors/meta/title';
update public.cms_blocks set value = 'About Our BJJ Academy in Woodstock, ON | Legacy X Jiu-Jitsu' where key = 'about/meta/title';
update public.cms_blocks set value = 'Contact Us | Legacy X Jiu-Jitsu, Woodstock, ON' where key = 'contact/meta/title';
update public.cms_blocks set value = 'BJJ Seminars &amp; Events in Woodstock, ON | Legacy X Jiu-Jitsu' where key = 'events/meta/title';
update public.cms_blocks set value = 'Brazilian Jiu-Jitsu FAQ | Legacy X Jiu-Jitsu, Woodstock, ON' where key = 'faq/meta/title';
update public.cms_blocks set value = 'Corporate Wellness &amp; Team Building in Woodstock, ON | Legacy X' where key = 'corporate/meta/title';
update public.cms_blocks set value = 'Adult Brazilian Jiu-Jitsu in Woodstock, ON | Legacy X' where key = 'programs/adult-jiu-jitsu/meta/title';
update public.cms_blocks set value = 'Kids &amp; Teens Jiu-Jitsu in Woodstock, ON | Legacy X' where key = 'programs/kids-jiu-jitsu/meta/title';
update public.cms_blocks set value = 'Women''s Brazilian Jiu-Jitsu in Woodstock, ON | Legacy X' where key = 'programs/womens-only/meta/title';
update public.cms_blocks set value = 'Jiu-Jitsu for Ages 55+ in Woodstock, ON | Legacy X' where key = 'programs/jiu-jitsu-over-55/meta/title';
update public.cms_blocks set value = 'BJJ Competition Team in Woodstock, ON | Legacy X' where key = 'programs/competition/meta/title';
update public.cms_blocks set value = 'Private BJJ Lessons in Woodstock, ON | Legacy X' where key = 'programs/private-lessons/meta/title';
