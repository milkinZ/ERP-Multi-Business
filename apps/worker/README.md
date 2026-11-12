# Background worker

The worker delivers notification emails from the `NOTIFICATION_QUEUE`. Configure
the SMTP settings in the worker process environment:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SMTP_HOST` | Production | `127.0.0.1` | SMTP server hostname |
| `SMTP_PORT` | No | `1025` | SMTP server port |
| `SMTP_USER` | No | — | SMTP authentication username |
| `SMTP_PASSWORD` | No | — | SMTP authentication password; configure with `SMTP_USER` |
| `SMTP_SECURE` | No | `false` | Use a TLS-secured SMTP connection |
| `EMAIL_FROM` | Production | `no-reply@erp.local` | Sender address |

Failed email jobs are retried by BullMQ up to five times with exponential
backoff. Notification recipients and channel preferences are checked again
before delivery.
