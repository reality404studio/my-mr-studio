const HEADERS = { 'Content-Type': 'application/json', 'x-actor': 'human' };

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: HEADERS, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

export const api = {
  pipeline: () => call('GET', '/api/pipeline'),
  log: (limit = 40) => call('GET', `/api/log?limit=${limit}`),
  node: (id) => call('GET', `/api/nodes/${encodeURIComponent(id)}`),
  createNode: (body) => call('POST', '/api/nodes', body),
  updateNode: (id, patch) => call('PATCH', `/api/nodes/${encodeURIComponent(id)}`, patch),
  deleteNode: (id) => call('DELETE', `/api/nodes/${encodeURIComponent(id)}`),
  writeNotes: (id, notes) => call('PUT', `/api/nodes/${encodeURIComponent(id)}/notes`, { notes }),
  addEdge: (source, target) => call('POST', '/api/edges', { source, target }),
  deleteEdge: (id) => call('DELETE', `/api/edges/${encodeURIComponent(id)}`),
  updateAsset: (id, file, memo) => call('PATCH', `/api/nodes/${encodeURIComponent(id)}/assets/${encodeURIComponent(file)}`, { memo }),
  deleteAsset: (id, file) => call('DELETE', `/api/nodes/${encodeURIComponent(id)}/assets/${encodeURIComponent(file)}`),
  async uploadAsset(id, file) {
    const res = await fetch(`/api/nodes/${encodeURIComponent(id)}/assets?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'x-actor': 'human', 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `업로드 실패 (${res.status})`);
    return data;
  },
};
