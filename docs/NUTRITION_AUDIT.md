# Nutrition audit: raw vs cooked values (28 November 2026)

Recipe quantities are raw weights, so every ingredient must use raw (as-sold) values per 100 g.
A review found 22 meat and fish rows that used cooked values (higher kcal and protein because water is lost in
cooking). They were replaced as below. Values are kcal / protein / carbs / fat per 100 g.

| Ingredient | Before (cooked) | After (raw) | Basis |
|---|---|---|---|
| Chicken Breast | 165/31/0/3.6 | 120/22.5/0/2.6 | USDA FoodData Central (SR Legacy), raw entry: chicken, broiler, breast, meat only, raw |
| Chicken Thigh | 209/26/0/11 | 121/19.7/0/3.9 | USDA FoodData Central (SR Legacy), raw entry: chicken, broiler, thigh, meat only, raw |
| Chicken Wings | 203/30/0/8 | 191/17.5/0/12.8 | USDA FoodData Central (SR Legacy), raw entry: chicken, broiler, wing, meat and skin, raw |
| Whole Chicken | 239/27/0/14 | 119/21.4/0/3.1 | USDA FoodData Central (SR Legacy), raw entry: chicken, broiler, meat only, raw (sold skinless in Pakistan) |
| Chicken Liver | 167/24/1/6.5 | 119/16.9/0.7/4.8 | USDA FoodData Central (SR Legacy), raw entry: chicken liver, raw |
| Mutton | 294/25/0/21 | 282/16.6/0/23.4 | USDA FoodData Central (SR Legacy), raw entry: lamb, composite of cuts, lean and fat, raw |
| Mutton Chops | 290/24/0/21 | 282/16.6/0/23.4 | USDA FoodData Central (SR Legacy), raw entry: lamb, composite of cuts, lean and fat, raw |
| Mutton Paya | 180/20/0/11 | 135/15/0/8.3 | no single raw reference; cooked value x 0.75 (typical meat cooking yield) |
| Beef | 250/26/0/15 | 215/18.6/0/15 | USDA FoodData Central (SR Legacy), raw entry: beef, ground, 85% lean, raw (was the cooked value) |
| Beef Nihari Shank | 235/27/0/14 | 176/20.3/0/10.5 | no single raw reference; cooked value x 0.75 (typical meat cooking yield) |
| Prawns | 99/24/0.2/0.3 | 85/20.1/0/0.5 | USDA FoodData Central (SR Legacy), raw entry: shrimp, raw |
| Chicken Boneless (Boti) | 165/31/0/3.6 | 120/22.5/0/2.6 | USDA FoodData Central (SR Legacy), raw entry: chicken, broiler, breast, meat only, raw |
| Chicken Drumstick | 172/28/0/5.7 | 119/20.1/0/3.7 | USDA FoodData Central (SR Legacy), raw entry: chicken, broiler, drumstick, meat only, raw |
| Chicken Leg Piece | 209/26/0/11 | 120/20/0/3.8 | USDA FoodData Central (SR Legacy), raw entry: thigh and drumstick, meat only, raw (average) |
| Mutton Leg (Raan) | 258/25/0/17 | 242/17.4/0/18.7 | USDA FoodData Central (SR Legacy), raw entry: lamb, leg, whole, lean and fat, raw |
| Mutton Shoulder | 270/24/0/19 | 264/16.4/0/21.5 | USDA FoodData Central (SR Legacy), raw entry: lamb, shoulder, whole, lean and fat, raw |
| Mutton Ribs (Chaap) | 294/25/0/21 | 282/16.6/0/23.4 | USDA FoodData Central (SR Legacy), raw entry: lamb, composite of cuts, lean and fat, raw |
| Beef Boneless | 250/26/0/15 | 215/18.6/0/15 | USDA FoodData Central (SR Legacy), raw entry: beef, ground, 85% lean, raw (was the cooked value) |
| Beef Ribs | 291/24/0/21 | 218/18/0/15.8 | no single raw reference; cooked value x 0.75 (typical meat cooking yield) |
| Tilapia Fish | 128/26/0/2.7 | 96/20.1/0/1.7 | USDA FoodData Central (SR Legacy), raw entry: tilapia, raw |
| Surmai Fish (King Fish) | 134/22/0/4.5 | 105/20.3/0/2 | USDA FoodData Central (SR Legacy), raw entry: king mackerel, raw |
| Quail (Bater) | 227/25/0/14 | 192/19.6/0/12.1 | USDA FoodData Central (SR Legacy), raw entry: quail, meat and skin, raw |

Rows not changed: grains, flours and pulses already use dry raw values; Chicken Qeema, Beef Qeema, Mutton Qeema,
offal and the other fish already used raw values. Pakistani 'mutton' is goat or sheep; lamb values are used as the
closer match to the previous data. All values remain approximate (see DATASET.md).

Applying to an existing database: `supabase/migrations/0011_raw_nutrition.sql` (UPDATE only, by ingredient name;
review before running it in production).
