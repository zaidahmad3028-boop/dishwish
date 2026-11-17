# User testing protocol (final phase)

Goal: measure how usable Dish-Wish is with real people, and how useful its recommendations feel.
Target: **10–15 participants** (students, working adults, home cooks), at least 3 with a food allergy or diet.

## 1. Before the session
- Deploy the latest build, or run it locally.
- Create a test account per participant, or let them register.
- Note each participant's group (student / home cook / allergy or diet), but no personal details.

## 2. Tasks (about 10 minutes, observe without helping)
1. Register or log in.
2. Set your taste levels, one allergy and a calorie goal in Settings.
3. Select 3–4 ingredients you have at home and open Recommendations. Open one recipe.
4. Try to add an ingredient that clashes with your taste. What happens?
5. Generate a new recipe on the Generate Recipe page and save it.
6. Download it as PDF or copy the share link.

For each task, write down: completed (yes/no), time taken, and any confusion.

## 3. Survey (2 minutes)
In the app: **Profile → Rate Dish-Wish (2-min survey)**, or open `/survey`.
Answers are saved automatically and appear on **Admin → User Testing** (with CSV export).

The same questions for a Google Form (answers 1 = strongly disagree … 5 = strongly agree):

| # | Statement |
|---|---|
| 1 | I think that I would like to use Dish-Wish frequently. |
| 2 | I found Dish-Wish unnecessarily complex. |
| 3 | I thought Dish-Wish was easy to use. |
| 4 | I think that I would need the support of a technical person to be able to use Dish-Wish. |
| 5 | I found the various functions in Dish-Wish were well integrated. |
| 6 | I thought there was too much inconsistency in Dish-Wish. |
| 7 | I would imagine that most people would learn to use Dish-Wish very quickly. |
| 8 | I found Dish-Wish very cumbersome to use. |
| 9 | I felt very confident using Dish-Wish. |
| 10 | I needed to learn a lot of things before I could get going with Dish-Wish. |
| F1 | Recipe recommendations matched my ingredients and taste. |
| F2 | Generated recipes were useful and easy to follow. |
| F3 | Allergy and conflict alerts made me feel safe. |
| C | Anything we should improve? (free text) |

## 4. Scoring (System Usability Scale, Brooke 1996)
- Odd statements: answer − 1. Even statements: 5 − answer. Add the ten values and multiply by 2.5 → score 0–100.
- 68 is the average across many products. Adjective scale (Bangor et al., 2009):
  85+ Excellent · 72+ Good · 52+ OK · 38+ Poor · below 38 Awful.
- From a CSV (the Admin export or a Google Form export with columns q1…q10):
  `python scripts/sus_report.py survey.csv`

## 5. Report in the final document
Number of participants, average SUS score and grade, average feature ratings, task completion rates,
and the three most common comments with what was changed because of them.
