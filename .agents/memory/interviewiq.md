---
name: External MySQL TLS
description: Non-obvious certificate requirement observed during database setup.
---
The user clarified that MySQL is managed through Aiven, on DigitalOcean infrastructure in Singapore. Obtain the project CA from Aiven, not DigitalOcean's Managed Databases console. The supplied external MySQL server presented a self-signed certificate chain during setup. A provider CA is needed; do not disable TLS verification.
**Why:** A reachable server can still reject a secure database connection, and disabling verification would expose credentials and resume data.
**How to apply:** Configure a trusted provider CA securely and validate the connection before claiming saved-data flows work.
