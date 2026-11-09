import { useEffect, useState } from 'react';
import Home from './Home.jsx';
import Workspace from './Workspace.jsx';

// 주소
//   #/                         홈
//   #/app/<id>                 사람 화면 (기본)
//   #/app/<id>/spec            명세 · 빈칸 지도
//   #/app/<id>/ledger          에이전트 장부 (보드)
//   #/app/<id>/drawer          결정 서랍
//   #/shared  #/shared/drawer  공통 보드, 결정 서랍
// 뒤에 ?node=<id> 를 붙이면 장부에서 그 과업을 열어 둔다. 예전 주소(#/app/<id>?node=..)는 장부로 연다.
const APP_VIEWS = new Set(['human', 'spec', 'ledger', 'drawer']);

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pathPart, query = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const node = new URLSearchParams(query).get('node');
  if (parts[0] === 'shared') return { view: 'project', pid: 'shared', mode: parts[1] === 'drawer' ? 'drawer' : 'ledger', node };
  if (parts[0] === 'app' && parts[1]) {
    const mode = APP_VIEWS.has(parts[2]) ? parts[2] : node ? 'ledger' : 'human';
    return { view: 'project', pid: parts[1], mode, node };
  }
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

  if (route.view === 'project') return <Workspace key={route.pid} pid={route.pid} mode={route.mode} node={route.node} />;
  return <Home />;
}
