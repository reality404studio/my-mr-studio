const HEADERS = { 'Content-Type': 'application/json', 'x-actor': 'human' };

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: HEADERS, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

const enc = encodeURIComponent;

export const studioApi = {
  projects: () => call('GET', '/api/projects'),
  templates: () => call('GET', '/api/templates'),
  createApp: (body) => call('POST', '/api/projects', body),
};

// pid = "shared" 또는 앱 id
export function projectApi(pid) {
  const base = `/api/p/${enc(pid)}`;
  return {
    pipeline: () => call('GET', `${base}/pipeline`),
    next: () => call('GET', `${base}/next`),
    moveNode: (id, dir) => call('POST', `${base}/nodes/${enc(id)}/move`, { dir }),
    addStage: (body) => call('POST', `${base}/stages`, body),
    updateStage: (id, patch) => call('PATCH', `${base}/stages/${enc(id)}`, patch),
    deleteStage: (id) => call('DELETE', `${base}/stages/${enc(id)}`),
    log: (limit = 40) => call('GET', `${base}/log?limit=${limit}`),
    node: (id) => call('GET', `${base}/nodes/${enc(id)}`),
    createNode: (body) => call('POST', `${base}/nodes`, body),
    updateNode: (id, patch) => call('PATCH', `${base}/nodes/${enc(id)}`, patch),
    deleteNode: (id) => call('DELETE', `${base}/nodes/${enc(id)}`),
    writeNotes: (id, notes) => call('PUT', `${base}/nodes/${enc(id)}/notes`, { notes }),
    addEdge: (source, target, extra = {}) => call('POST', `${base}/edges`, { source, target, ...extra }),
    deleteEdge: (id) => call('DELETE', `${base}/edges/${enc(id)}`),
    updateAsset: (id, file, memo) => call('PATCH', `${base}/nodes/${enc(id)}/assets/${enc(file)}`, { memo }),
    deleteAsset: (id, file) => call('DELETE', `${base}/nodes/${enc(id)}/assets/${enc(file)}`),
    async uploadAsset(id, file) {
      const res = await fetch(`${base}/nodes/${enc(id)}/assets?name=${enc(file.name)}`, {
        method: 'POST',
        headers: { 'x-actor': 'human', 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `업로드 실패 (${res.status})`);
      return data;
    },
  };
}
