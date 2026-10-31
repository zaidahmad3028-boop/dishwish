# Sign-up confirmation and password reset emails

DishWish uses Supabase Auth with email + password, **Confirm email ON**, and a password-reset flow. This is the setup most production web apps use:

- **Email verification:** a new account can't log in until its owner clicks the link sent to that address.
- **One-time links:** every link works once and expires after 1 hour.
- **Links work on any device:** links carry a `token_hash` that the app verifies at `/auth/confirm`, so they work in whichever browser or device the email is opened on.
- **Tokens never in URLs:** the client uses the PKCE flow, so session tokens never appear in URLs.
- **No account enumeration:** "Incorrect email or password" and "If an account exists…" don't reveal which emails are registered.
- **Resend with a cooldown:** resend buttons show a countdown (60 s, or the wait time Supabase asks for).
- **Other devices signed out:** after a password reset, other devices are signed out.

## Why emails weren't arriving

Supabase's built-in email service is for testing only. It sends **only to the email addresses of your Supabase organization's team members**, and only about **2 emails per hour** for the whole project. Anything beyond that fails with "email rate limit exceeded", which the app shows as "Too many attempts" or "We've sent too many emails recently". Real users need **custom SMTP**.

## 1. Custom SMTP (required for real users)

Supabase → **Project Settings → Authentication → SMTP Settings** (or **Authentication → Emails → SMTP Settings**) → **Enable custom SMTP**.

**Option A: Gmail app password.** Free, about 500 emails a day, and good for a student or demo project.
1. On the Gmail account that will send the emails, turn on **2-Step Verification** (myaccount.google.com → Security).
2. Go to myaccount.google.com → Security → **App passwords**, create one named "DishWish Supabase", and copy the 16-character password.
3. In Supabase SMTP Settings, fill in:

   | Field | Value |
   | --- | --- |
   | Sender email | that Gmail address |
   | Sender name | `DishWish` |
   | Host | `smtp.gmail.com` |
   | Port | `587` |
   | Username | that Gmail address |
   | Password | the 16-character app password, not your normal password |

**Option B: Resend.** Best for production. It needs a domain you own.
1. Sign up at resend.com, add and verify your domain (the DNS records it shows you), and create an API key.
2. In Supabase SMTP Settings, fill in:

   | Field | Value |
   | --- | --- |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | the API key |
   | Sender | `no-reply@yourdomain.com` |

Never commit the app password or the API key. They live only in the Supabase dashboard.

## 2. Rate limits

Supabase → **Authentication → Rate Limits**. Once custom SMTP is on, raise **"Rate limit for sending emails"**, for example to 30–100 per hour. Keep the other limits at their defaults; they protect against abuse.

## 3. URL configuration

Supabase → **Authentication → URL Configuration**:
- **Site URL:** your Vercel web address, e.g. `https://dishwish-web.vercel.app`. While testing only on your PC, you can use `http://localhost:5173`.
- **Redirect URLs:** add both of these:
  - `http://localhost:5173/**`
  - `https://<your-vercel-web-domain>/**`

The app sends `<current site>/auth/confirm` as the redirect. If it isn't in this list, Supabase falls back to the Site URL. The app still forwards the link to `/auth/confirm`, but it opens on the Site URL's domain.

## 4. Email templates

Supabase → **Authentication → Emails → Templates**:

| Template | Subject | Body (paste the whole file) |
| --- | --- | --- |
| Confirm sign up | `Confirm your DishWish account` | `supabase/email-templates/confirm-signup.html` |
| Reset password | `Reset your DishWish password` | `supabase/email-templates/reset-password.html` |

The templates link to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=…`. The app verifies that link at `/auth/confirm`. If you keep Supabase's default templates instead, links still work in the same browser that requested them.

## 5. Confirm email: ON

Supabase → **Authentication → Sign In / Providers → Email**: **Confirm email ON**. Leave **Secure password change** on, and set the minimum password length to at least 8. Click **Save**.

## 6. Accounts stuck from earlier tests

Unconfirmed accounts created before SMTP worked can click **Resend confirmation email** on the login screen; the app shows that button when Supabase says "Email not confirmed". Or delete them in **Authentication → Users** and register again.

## How the flow works in the app

| Step | Screen |
| --- | --- |
| Register | "Check your inbox", with a resend button and countdown |
| Click the email link | `/auth/confirm`: verifies the link, then goes to onboarding (new user) or the kitchen |
| Log in before confirming | "Your email isn't confirmed yet", with **Resend confirmation email** |
| Wrong password | "Incorrect email or password", and the password field is cleared |
| Forgot password? | Enter the email, then "Check your inbox" |
| Click the reset link | `/auth/confirm` → `/reset-password`: new password twice, save, kitchen; other devices are signed out |
| Expired or used link | "This link has expired or was already used", with **Go to login** and **Request a new password reset link** |
