import { useEffect, useState } from 'react';
import Home from './Home.jsx';
import ProjectView from './ProjectView.jsx';

// 주소: #/  홈 · #/shared  공통 · #/app/<id>  앱 · 뒤에 ?node=<id> 를 붙이면 그 단계를 열어 둔다
function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pathPart, query = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const node = new URLSearchParams(query).get('node');
  if (parts[0] === 'shared') return { view: 'project', pid: 'shared', node };
  if (parts[0] === 'app' && parts[1]) return { view: 'project', pid: parts[1], node };
  return { view: 'home' };
}

export function go(path) {
  window.location.hash = path;
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  if (route.view === 'project') return <ProjectView key={`${route.pid}:${route.node || ''}`} pid={route.pid} initialNode={route.node} />;
  return <Home />;
}
