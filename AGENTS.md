# Project rules

- Keep CRM column ordering in the pure `crmLeadOrder` comparator so unread priority and conversation recency are tested independently of rendering.
- Track delayed human-response apologies from interaction inserts in a service-only queue; arm its scheduler only while pending work exists and keep one notice per waiting episode, independently of the main AI toggle.