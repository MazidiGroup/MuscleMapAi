"""Public legal pages (Privacy Policy & Terms of Use) served as web pages.

Apple App Store Connect requires *functional web links* for the Privacy Policy
(Privacy Policy field) and Terms of Use / EULA (App Description or EULA field).
These endpoints render the same content shown inside the app.

URLs (on the deployed domain):
  GET /api/legal/privacy
  GET /api/legal/terms
"""

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

legal_router = APIRouter(prefix="/api/legal")

SUPPORT_EMAIL = "info@mazidigroup.com"
APPLE_EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"

_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title} — Muscle Map Ai</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{
    margin: 0; padding: 0;
    background: #070A0F; color: #C7CEDA;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.65;
  }}
  .wrap {{ max-width: 760px; margin: 0 auto; padding: 40px 24px 80px; }}
  h1 {{ color: #F2F5F9; font-size: 30px; margin: 0 0 4px; }}
  h2 {{ color: #F2F5F9; font-size: 19px; margin: 32px 0 8px; }}
  p {{ margin: 0 0 14px; font-size: 15.5px; }}
  a {{ color: #4DA3FF; font-weight: 600; text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
  .updated {{ color: #6B7686; font-size: 13px; margin-bottom: 28px; }}
  .brand {{ color: #6B7686; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 14px; }}
  .footer {{ margin-top: 48px; padding-top: 20px; border-top: 1px solid #1A2230; color: #6B7686; font-size: 13px; }}
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">Muscle Map Ai</div>
    <h1>{title}</h1>
    <div class="updated">Last updated: {updated}</div>
    {body}
    <div class="footer">
      &copy; Muscle Map Ai · Questions: <a href="mailto:{email}">{email}</a>
    </div>
  </div>
</body>
</html>"""

_PRIVACY_BODY = f"""
<p>Muscle Map Ai ("the app") respects your privacy. This policy explains what data the app
handles and how it is used. We designed the app to keep your personal data on your device
wherever possible.</p>

<h2>Data stored on your device</h2>
<p>Your workouts, sets, reps, training history, bookmarks and preferences are stored locally on
your device only. This data is not transmitted to us and is removed when you uninstall the app
or clear its data.</p>

<h2>Account data</h2>
<p>If you choose to create an account (email, Apple or Google sign-in), we store your email
address, display name and sign-in provider to operate your account and subscription. You may
delete your account at any time from Library &rarr; Account &rarr; Delete Account inside the app;
this permanently removes your account and associated server-side data.</p>

<h2>AI Coach</h2>
<p>When you send a message to the AI Coach, the text you type is transmitted over a secure
connection to our backend and forwarded to a third-party AI provider to generate a response.
These messages are used solely to produce your reply. We do not use them to build advertising
profiles, and we do not sell them.</p>

<h2>Information we do not collect</h2>
<p>The app does not require an account to use. It does not access your camera, microphone,
location, contacts, photos, or health data, and it contains no third-party advertising or
tracking SDKs.</p>

<h2>Subscriptions</h2>
<p>Premium subscriptions are processed by Apple and RevenueCat. We receive only the subscription
status (active/expired and tier) needed to unlock premium features — never your payment details.</p>

<h2>Data security</h2>
<p>Network requests to our backend use encrypted HTTPS connections. While no method of
transmission is completely secure, we take reasonable measures to protect information in
transit.</p>

<h2>Children's privacy</h2>
<p>The app is intended for a general fitness and educational audience and is not directed at
children under 13. We do not knowingly collect personal information from children.</p>

<h2>Changes to this policy</h2>
<p>We may update this policy from time to time. Material changes will be reflected by updating
the date at the top of this page.</p>

<h2>Contact</h2>
<p>If you have questions about this policy or your data, contact us at
<a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>.</p>
"""

_TERMS_BODY = f"""
<h2>Acceptance</h2>
<p>By downloading, installing or using Muscle Map Ai (the app), you agree to be bound by these
Terms of Use (Terms) and by Apple's Standard End User License Agreement (EULA), which applies to
all apps distributed through the Apple App Store:
<a href="{APPLE_EULA_URL}">Apple Standard EULA</a>.</p>

<h2>License</h2>
<p>We grant you a limited, non-exclusive, non-transferable, revocable licence to install and use
the app on any Apple-branded product that you own or control, solely for personal,
non-commercial use, subject to these Terms.</p>

<h2>Subscriptions and Auto-Renewal</h2>
<p>Muscle Map Ai offers auto-renewing subscriptions (Premium) that unlock the AI Coach, Learn
lessons, recovery insights and other premium features. Subscription titles, lengths and prices
are displayed on the in-app paywall before purchase and match the products published on the
App Store.</p>
<p>Payment is charged to your Apple ID at confirmation of purchase. Subscriptions automatically
renew for the same period unless auto-renew is turned off at least 24 hours before the end of
the current period. Your account is charged for renewal within 24 hours prior to the end of the
current period at the same price, unless the plan has changed. You can manage your subscription
and turn off auto-renewal in your Apple ID Account Settings after purchase. No cancellation of
the current subscription is allowed during the active subscription period.</p>

<h2>Educational Content — No Medical Advice</h2>
<p>The app provides general anatomy education and fitness information for adults. It is NOT a
medical device, does not provide medical diagnoses and is not a substitute for advice from a
licensed physician, physiotherapist or other qualified health professional. Consult a
professional before starting any new exercise programme, especially if you have injuries or
medical conditions.</p>

<h2>AI Coach</h2>
<p>The AI Coach generates responses using a third-party large-language model. Answers may be
inaccurate, incomplete or out of date and should be verified with a professional before use. Do
not send confidential or medically sensitive information to the AI Coach.</p>

<h2>Account and Data</h2>
<p>You may use the app as a guest or create an account with email, Apple or Google sign-in. You
are responsible for keeping your login method secure. You may delete your account at any time
from Library &rarr; Account &rarr; Delete Account; this permanently removes your account and
associated server-side data.</p>

<h2>Acceptable Use</h2>
<p>Do not misuse the app: no reverse-engineering, no attempts to circumvent subscription checks,
no automated scraping of endpoints, no unlawful use. We may suspend accounts that violate these
Terms.</p>

<h2>Disclaimer of Warranties</h2>
<p>The app is provided "as is" and "as available" without warranties of any kind, whether
express, implied or statutory, to the maximum extent permitted by law.</p>

<h2>Limitation of Liability</h2>
<p>To the maximum extent permitted by law, Muscle Map Ai and its publisher are not liable for
any indirect, incidental, special, consequential or punitive damages arising out of or in
connection with your use of the app.</p>

<h2>Changes</h2>
<p>We may update these Terms from time to time. Material changes will be reflected by updating
the date at the top of this page. Continued use after changes means you accept them.</p>

<h2>Contact</h2>
<p>Questions about these Terms: <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>.</p>
"""


@legal_router.get("/privacy", response_class=HTMLResponse)
async def legal_privacy():
    return HTMLResponse(
        _PAGE_TEMPLATE.format(
            title="Privacy Policy", updated="June 2026", body=_PRIVACY_BODY, email=SUPPORT_EMAIL
        )
    )


@legal_router.get("/terms", response_class=HTMLResponse)
async def legal_terms():
    return HTMLResponse(
        _PAGE_TEMPLATE.format(
            title="Terms of Use", updated="July 2026", body=_TERMS_BODY, email=SUPPORT_EMAIL
        )
    )
