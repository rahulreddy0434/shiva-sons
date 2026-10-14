/**
 * Largest Excel template accepted. Templates are sent through the app's own
 * server, and hosting platforms cap a request at about 4.5 MB (Vercel), so
 * the limit sits below that. Templates are usually far smaller.
 */
export const MAX_WORKBOOK_BYTES = 4 * 1024 * 1024
