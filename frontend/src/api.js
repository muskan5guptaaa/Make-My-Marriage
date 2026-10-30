// Every call goes to /api/v1 with the session cookie. Failures throw an ApiError whose
// `fields` maps input names to messages, matching { error: { code, message, fields } }.
export class ApiError extends Error {
  constructor(status, error) {
    super(error?.message ?? 'Something went wrong. Try again.');
    this.status = status;
    this.code = error?.code ?? 'unknown';
    this.fields = error?.fields ?? {};
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { code: 'network', message: "Can't reach the server. Check your connection and try again." });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error);
  return data;
}

// The assistant answers one JSON line at a time: text pieces, then the records it cited.
// onText(piece) is called as each piece arrives; resolves to the cited records.
async function askWedding(weddingId, question, { onText, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api/v1/weddings/${weddingId}/ask`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(0, { code: 'network', message: "Can't reach the server. Check your connection and try again." });
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error);
  }

  let sources = [];
  let buffer = '';
  const handle = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'text') onText?.(event.text);
    else if (event.type === 'sources') sources = event.sources;
    else if (event.type === 'error') throw new ApiError(502, { code: 'answer_failed', message: event.message });
  };
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(handle);
  }
  handle(buffer);
  return sources;
}

export const api = {
  askWedding,
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  forgotPassword: (body) => request('/auth/forgot-password', { method: 'POST', body }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body }),
  me: () => request('/me'),

  createWedding: (body) => request('/weddings', { method: 'POST', body }),
  listWeddings: (status = 'active') => request(`/weddings?status=${status}`),
  getWedding: (id) => request(`/weddings/${id}`),
  updateWedding: (id, body) => request(`/weddings/${id}`, { method: 'PATCH', body }),
  archiveWedding: (id) => request(`/weddings/${id}/archive`, { method: 'POST' }),
  restoreWedding: (id) => request(`/weddings/${id}/restore`, { method: 'POST' }),

  listMembers: (weddingId) => request(`/weddings/${weddingId}/members`),
  inviteMember: (weddingId, body) => request(`/weddings/${weddingId}/members`, { method: 'POST', body }),
  changeMemberRole: (weddingId, memberId, role) =>
    request(`/weddings/${weddingId}/members/${memberId}`, { method: 'PATCH', body: { role } }),
  removeMember: (weddingId, memberId) => request(`/weddings/${weddingId}/members/${memberId}`, { method: 'DELETE' }),
  // { includeArchived: true } also returns archived functions (status "archived").
  listFunctions: (weddingId, { includeArchived = false } = {}) =>
    request(`/weddings/${weddingId}/functions${includeArchived ? '?include=archived' : ''}`),
  archiveFunction: (weddingId, functionId) => request(`/weddings/${weddingId}/functions/${functionId}/archive`, { method: 'POST' }),
  restoreFunction: (weddingId, functionId) => request(`/weddings/${weddingId}/functions/${functionId}/restore`, { method: 'POST' }),
  createFunction: (weddingId, body) => request(`/weddings/${weddingId}/functions`, { method: 'POST', body }),
  updateFunction: (weddingId, functionId, body) =>
    request(`/weddings/${weddingId}/functions/${functionId}`, { method: 'PATCH', body }),
  deleteFunction: (weddingId, functionId) =>
    request(`/weddings/${weddingId}/functions/${functionId}`, { method: 'DELETE' }),

  // params: { status, function, assignee, mine } — empty values are left out.
  listTasks: (weddingId, params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/weddings/${weddingId}/tasks${qs ? `?${qs}` : ''}`);
  },
  createTask: (weddingId, body) => request(`/weddings/${weddingId}/tasks`, { method: 'POST', body }),
  // AI drafts only; nothing is saved until saveTasks. body: { functions?: [ids], wholeWedding }
  planTasks: (weddingId, body) => request(`/weddings/${weddingId}/tasks/plan`, { method: 'POST', body }),
  saveTasks: (weddingId, tasks) => request(`/weddings/${weddingId}/tasks/bulk`, { method: 'POST', body: { tasks } }),
  updateTask: (weddingId, taskId, body) => request(`/weddings/${weddingId}/tasks/${taskId}`, { method: 'PATCH', body }),
  deleteTask: (weddingId, taskId) => request(`/weddings/${weddingId}/tasks/${taskId}`, { method: 'DELETE' }),

  // params: { q, side, groupTag, function, rsvp } — empty values are left out.
  listGuests: (weddingId, params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/weddings/${weddingId}/guests${qs ? `?${qs}` : ''}`);
  },
  getGuest: (weddingId, guestId) => request(`/weddings/${weddingId}/guests/${guestId}`),
  createGuest: (weddingId, body) => request(`/weddings/${weddingId}/guests`, { method: 'POST', body }),
  updateGuest: (weddingId, guestId, body) => request(`/weddings/${weddingId}/guests/${guestId}`, { method: 'PATCH', body }),
  setGuestPhotoAccess: (weddingId, ids, photoAccess) =>
    request(`/weddings/${weddingId}/guests/photo-access`, { method: 'POST', body: { ids, photoAccess } }),
  deleteGuests: (weddingId, ids) => request(`/weddings/${weddingId}/guests/delete`, { method: 'POST', body: { ids } }),
  deleteGuest: (weddingId, guestId) => request(`/weddings/${weddingId}/guests/${guestId}`, { method: 'DELETE' }),
  setRsvp: (weddingId, guestId, functionId, body) =>
    request(`/weddings/${weddingId}/guests/${guestId}/rsvps/${functionId}`, { method: 'PATCH', body }),
  regenerateLink: (weddingId, guestId) => request(`/weddings/${weddingId}/guests/${guestId}/link/regenerate`, { method: 'POST' }),
  revokeLink: (weddingId, guestId) => request(`/weddings/${weddingId}/guests/${guestId}/link/revoke`, { method: 'POST' }),
  importGuests: (weddingId, csv) => request(`/weddings/${weddingId}/guests/import`, { method: 'POST', body: { csv } }),
  sendGuestInvitation: (weddingId, guestId) => request(`/weddings/${weddingId}/guests/${guestId}/send-invitation`, { method: 'POST' }),
  // body: { audience: 'not-sent' | 'pending', dryRun?: true }
  sendGuestInvitations: (weddingId, body) => request(`/weddings/${weddingId}/guests/send-invitations`, { method: 'POST', body }),
  listAlbums: (weddingId) => request(`/weddings/${weddingId}/albums`),
  createAlbum: (weddingId, name) => request(`/weddings/${weddingId}/albums`, { method: 'POST', body: { name } }),
  updateAlbum: (weddingId, albumId, body) => request(`/weddings/${weddingId}/albums/${albumId}`, { method: 'PATCH', body }),
  deleteAlbum: (weddingId, albumId) => request(`/weddings/${weddingId}/albums/${albumId}`, { method: 'DELETE' }),
  listPhotos: (weddingId, albumId) => request(`/weddings/${weddingId}/albums/${albumId}/photos`),
  signPhoto: (weddingId, albumId) => request(`/weddings/${weddingId}/albums/${albumId}/photos/sign`, { method: 'POST' }),
  completePhoto: (weddingId, photoId) => request(`/weddings/${weddingId}/photos/${photoId}/complete`, { method: 'POST' }),
  updatePhoto: (weddingId, photoId, body) => request(`/weddings/${weddingId}/photos/${photoId}`, { method: 'PATCH', body }),
  deletePhoto: (weddingId, photoId) => request(`/weddings/${weddingId}/photos/${photoId}`, { method: 'DELETE' }),
  portalAlbums: (token) => request(`/portal/${encodeURIComponent(token)}/albums`),
  portalPhotos: (token, albumId) => request(`/portal/${encodeURIComponent(token)}/albums/${albumId}/photos`),
  portalSignPhoto: (token, albumId) => request(`/portal/${encodeURIComponent(token)}/albums/${albumId}/photos/sign`, { method: 'POST' }),
  portalCompletePhoto: (token, photoId) => request(`/portal/${encodeURIComponent(token)}/photos/${photoId}/complete`, { method: 'POST' }),
  getPortal: (token) => request(`/portal/${encodeURIComponent(token)}`),
  answerPortalRsvp: (token, functionId, body) =>
    request(`/portal/${encodeURIComponent(token)}/rsvps/${functionId}`, { method: 'PUT', body }),
  rsvpSummary: (weddingId) => request(`/weddings/${weddingId}/rsvps/summary`),

  listExpenseCategories: (weddingId) => request(`/weddings/${weddingId}/expense-categories`),
  createExpenseCategory: (weddingId, name) => request(`/weddings/${weddingId}/expense-categories`, { method: 'POST', body: { name } }),
  renameExpenseCategory: (weddingId, categoryId, name) =>
    request(`/weddings/${weddingId}/expense-categories/${categoryId}`, { method: 'PATCH', body: { name } }),
  deleteExpenseCategory: (weddingId, categoryId) =>
    request(`/weddings/${weddingId}/expense-categories/${categoryId}`, { method: 'DELETE' }),
  // params: { category, function, paymentStatus, paidBy } — empty values are left out.
  listExpenses: (weddingId, params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/weddings/${weddingId}/expenses${qs ? `?${qs}` : ''}`);
  },
  expenseSummary: (weddingId) => request(`/weddings/${weddingId}/expenses/summary`),
  createExpense: (weddingId, body) => request(`/weddings/${weddingId}/expenses`, { method: 'POST', body }),
  updateExpense: (weddingId, expenseId, body) => request(`/weddings/${weddingId}/expenses/${expenseId}`, { method: 'PATCH', body }),
  deleteExpense: (weddingId, expenseId) => request(`/weddings/${weddingId}/expenses/${expenseId}`, { method: 'DELETE' }),

  resendInvite: (weddingId, memberId) => request(`/weddings/${weddingId}/members/${memberId}/resend`, { method: 'POST' }),
  getMemberInvite: (token) => request(`/member-invites/${encodeURIComponent(token)}`),
  acceptMemberInvite: (token) => request(`/member-invites/${encodeURIComponent(token)}/accept`, { method: 'POST' }),

  acceptInvite: (weddingId) => request(`/weddings/${weddingId}/members/accept`, { method: 'POST' }),
  declineInvite: (weddingId) => request(`/weddings/${weddingId}/members/decline`, { method: 'POST' }),
};
