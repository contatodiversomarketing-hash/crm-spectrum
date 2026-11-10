# Project rules
- Refresh the NeuroAcesso team agenda in place while visible and on focus, keeping booked meetings above availability so public reservations appear without reloading or clearing form drafts.
- The team calendar manages persisted slot activation and books through the same atomic RPC as public guests, preserving reservation conflicts and advance-notice rules.
- NeuroAcesso public bookings use persisted slots (manual or recurring, replenished daily without restoring withdrawn times) and atomic database RPC reservations enforcing advance notice; expose only free times publicly, keeping contact details role-protected and meetings separate from clinical appointments.
- Load CRM pipeline leads in stable paginated batches until exhausted; never cap the board at the newest records, because imports must not hide older cards.
- Keep the Black Friday campaign text shared between UI and server; send it only as an approved, exact-match marketing template with explicit consent confirmation, never substitute a generic re-engagement message.
- Campaign imports and sending use shared column-exclusion and phone-deduplication helpers; preserve excluded cards across pipelines, recheck current placement server-side before sending, and identify contacts without phones by source row for idempotent imports.

- Read NeuroAcesso chat photo/PDF attachments server-side without public uploads; persist extracted material in the message content so permanent teachings never depend on temporary URLs.
- NeuroAcesso analysis replies run as a server-side job (neuroacesso_ia_jobs) in self-chained steps that each stop before the ~150s function wall clock (research, then writing with continuation); the request stream only covers saving the message/attachments, and the client follows the job so reloads never lose a report.
- NeuroAcesso report PDFs are produced client-side by printing branded HTML (src/lib/relatorioPdf.tsx) so text stays selectable.

- Keep CRM column ordering, including column-specific meeting ordering, in the pure `crmLeadOrder` comparators so ordering rules are tested independently of rendering.
- Track delayed human-response apologies from interaction inserts in a service-only queue; arm its scheduler only while pending work exists and keep one notice per waiting episode, independently of the main AI toggle.
- Resolve reply and AI-extracted CRM stages through the shared crm-stages helpers against the lead's own pipeline columns; use buscarLead in both paths so phone variants update the same card and invalid stage keys cannot hide it.
- Store custom CRM labels in a shared protected catalog, retaining built-in label keys for Ana compatibility; persist meeting timestamps separately from clinical appointments and interpret meeting inputs in Brasília time.
- Keep populated CRM boards mounted during refreshes and defer card replacement/reordering while a card dialog is active, so unsaved edits and chat drafts retain their owner.
- Reserve browser call attempts synchronously and reacquire/release microphone streams per call; never hide audio setup failures or attribute generic disconnects to a carrier without evidence.- Write NeuroAcesso analysis-chat messages only through the neuroacesso-analise-ia function (service role), which rebuilds the prompt from all rows flagged as teachings, so taught rules persist for the whole team.
- Black Friday sends classify Meta refusals with the shared classifyCampaignError (retry / alternate 9th-digit / skip contact / stop campaign) and never resend to a contact with a non-failed campaign record, so reruns are safe.

- Ana answers prices/policies only from treinamento_ia rows with categoria "fatos_oficiais", injected via _shared/fatos-oficiais.ts above all other instructions, so she never invents official data.
