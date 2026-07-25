# Security policy

Snappy Booth is designed to run locally. Please do not open a public issue that
contains an API key, event photo, venue network address, bridge token, or other
private data.

If a secret is committed:

1. Revoke it at the provider immediately.
2. Remove it from the working tree and the complete Git history.
3. Expire or rotate any local bridge credentials derived from it.
4. Verify the rewritten repository before making it public.

The optional OpenAI-powered outfit line reads `OPENAI_API_KEY` from the runtime
environment. The base booth and the OpenHome countdown/conversation do not
require it.

Security reports can be sent privately through the repository owner's GitHub
profile.
