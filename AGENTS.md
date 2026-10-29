# Project rules

- Read NeuroAcesso chat photo/PDF attachments server-side without public uploads; persist extracted material in the message content so permanent teachings never depend on temporary URLs.
- Stream NeuroAcesso analysis progress with keepalive frames during both attachment extraction and replies; the client clears drafts only after a persisted completion event, not HTTP success alone.

- Keep CRM column ordering, including column-specific meeting ordering, in the pure `crmLeadOrder` comparators so ordering rules are tested independently of rendering.
- Track delayed human-response apologies from interaction inserts in a service-only queue; arm its scheduler only while pending work exists and keep one notice per waiting episode, independently of the main AI toggle.
- Resolve reply and AI-extracted CRM stages through the shared crm-stages helpers against the lead's own pipeline columns; use buscarLead in both paths so phone variants update the same card and invalid stage keys cannot hide it.
- Store custom CRM labels in a shared protected catalog, retaining built-in label keys for Ana compatibility; persist meeting timestamps separately from clinical appointments and interpret meeting inputs in Brasília time.
- Keep populated CRM boards mounted during refreshes and defer card replacement/reordering while a card dialog is active, so unsaved edits and chat drafts retain their owner.
- Reserve browser call attempts synchronously and reacquire/release microphone streams per call; never hide audio setup failures or attribute generic disconnects to a carrier without evidence.- Write NeuroAcesso analysis-chat messages only through the neuroacesso-analise-ia function (service role), which rebuilds the prompt from all rows flagged as teachings, so taught rules persist for the whole team.
