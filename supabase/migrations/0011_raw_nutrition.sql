-- 0011: replace cooked nutrition values with raw values (see docs/NUTRITION_AUDIT.md).
-- UPDATE only: touches 22 catalogue ingredients by name; no user data, no deletes. Review before applying.
begin;
update public.ingredients set kcal = 120, protein = 22.5, carbs = 0, fat = 2.6 where name = 'Chicken Breast';
update public.ingredients set kcal = 121, protein = 19.7, carbs = 0, fat = 3.9 where name = 'Chicken Thigh';
update public.ingredients set kcal = 191, protein = 17.5, carbs = 0, fat = 12.8 where name = 'Chicken Wings';
update public.ingredients set kcal = 119, protein = 21.4, carbs = 0, fat = 3.1 where name = 'Whole Chicken';
update public.ingredients set kcal = 119, protein = 16.9, carbs = 0.7, fat = 4.8 where name = 'Chicken Liver';
update public.ingredients set kcal = 282, protein = 16.6, carbs = 0, fat = 23.4 where name = 'Mutton';
update public.ingredients set kcal = 282, protein = 16.6, carbs = 0, fat = 23.4 where name = 'Mutton Chops';
update public.ingredients set kcal = 135, protein = 15, carbs = 0, fat = 8.3 where name = 'Mutton Paya';
update public.ingredients set kcal = 215, protein = 18.6, carbs = 0, fat = 15 where name = 'Beef';
update public.ingredients set kcal = 176, protein = 20.3, carbs = 0, fat = 10.5 where name = 'Beef Nihari Shank';
update public.ingredients set kcal = 85, protein = 20.1, carbs = 0, fat = 0.5 where name = 'Prawns';
update public.ingredients set kcal = 120, protein = 22.5, carbs = 0, fat = 2.6 where name = 'Chicken Boneless (Boti)';
update public.ingredients set kcal = 119, protein = 20.1, carbs = 0, fat = 3.7 where name = 'Chicken Drumstick';
update public.ingredients set kcal = 120, protein = 20, carbs = 0, fat = 3.8 where name = 'Chicken Leg Piece';
update public.ingredients set kcal = 242, protein = 17.4, carbs = 0, fat = 18.7 where name = 'Mutton Leg (Raan)';
update public.ingredients set kcal = 264, protein = 16.4, carbs = 0, fat = 21.5 where name = 'Mutton Shoulder';
update public.ingredients set kcal = 282, protein = 16.6, carbs = 0, fat = 23.4 where name = 'Mutton Ribs (Chaap)';
update public.ingredients set kcal = 215, protein = 18.6, carbs = 0, fat = 15 where name = 'Beef Boneless';
update public.ingredients set kcal = 218, protein = 18, carbs = 0, fat = 15.8 where name = 'Beef Ribs';
update public.ingredients set kcal = 96, protein = 20.1, carbs = 0, fat = 1.7 where name = 'Tilapia Fish';
update public.ingredients set kcal = 105, protein = 20.3, carbs = 0, fat = 2 where name = 'Surmai Fish (King Fish)';
update public.ingredients set kcal = 192, protein = 19.6, carbs = 0, fat = 12.1 where name = 'Quail (Bater)';
commit;
