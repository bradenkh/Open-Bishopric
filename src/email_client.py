import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

WARD_NAME = os.environ.get("WARD_NAME", "Your Ward")

HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{subject}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1e3a5f; padding:24px 32px; text-align:center;">
              <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:600; letter-spacing:0.5px;">
                {ward_name} Bishopric
              </h1>
            </td>
          </tr>

          <!-- Automated notice -->
          <tr>
            <td style="background-color:#e8f0fe; padding:12px 32px; text-align:center;">
              <p style="margin:0; color:#1e3a5f; font-size:12px; font-weight:500;">
                &#9993; Automated message from ALMA &mdash; Bishopric Assistant
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <div style="color:#1f2937; font-size:15px; line-height:1.6;">
                {body}
              </div>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none; border-top:1px solid #e5e7eb; margin:0;">
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; text-align:center;">
              <p style="margin:0 0 4px 0; color:#6b7280; font-size:12px; line-height:1.5;">
                This email was sent automatically by ALMA (Automated Leadership Management Assistant)
                on behalf of the {ward_name} bishopric.
              </p>
              <p style="margin:0; color:#9ca3af; font-size:11px;">
                If you believe you received this in error, please contact your bishopric directly.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

PLAIN_TEMPLATE = (
    "[ Automated message from ALMA — Bishopric Assistant ]\n\n"
    "{body}\n\n"
    "---\n"
    "This email was sent automatically by ALMA (Automated Leadership Management Assistant) "
    "on behalf of the {ward_name} bishopric.\n"
    "If you believe you received this in error, please contact your bishopric directly."
)


def send_email(to: str, subject: str, body: str) -> None:
    """Send an HTML email with plain-text fallback via SMTP. Raises on failure."""
    host = os.environ["SMTP_HOST"]
    port = int(os.environ["SMTP_PORT"])
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASSWORD"]
    from_addr = os.environ.get("EMAIL_FROM", user)
    ward_name = os.environ.get("WARD_NAME", "Your Ward")

    # Convert plain-text body line breaks to HTML paragraphs
    html_body = "".join(f"<p style='margin:0 0 12px 0;'>{line}</p>" if line.strip() else ""
                        for line in body.split("\n"))

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to

    # Plain-text version (shown by clients that don't support HTML)
    msg.attach(MIMEText(
        PLAIN_TEMPLATE.format(body=body, ward_name=ward_name), "plain"
    ))
    # HTML version (preferred by most clients)
    msg.attach(MIMEText(
        HTML_TEMPLATE.format(subject=subject, body=html_body, ward_name=ward_name), "html"
    ))

    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.send_message(msg)
