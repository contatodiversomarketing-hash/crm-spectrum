# Project rules

- Keep CRM column ordering in the pure `crmLeadOrder` comparator so unread priority and conversation recency are tested independently of rendering.
- Track delayed human-response apologies from interaction inserts in a service-only queue; arm its scheduler only while pending work exists and keep one notice per waiting episode, independently of the main AI toggle.
- Resolve reply and AI-extracted CRM stages through the shared crm-stages helpers against the lead's own pipeline columns; use buscarLead in both paths so phone variants update the same card and invalid stage keys cannot hide it.
- Store custom CRM labels in a shared protected catalog, retaining built-in label keys for Ana compatibility; persist meeting timestamps separately from clinical appointments and interpret meeting inputs in Brasília time.