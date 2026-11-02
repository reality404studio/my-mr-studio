import { useEffect, useRef, useState } from 'react';

// studio/ 아래 파일이 바뀌면(사람이든 에이전트든) 서버가 알려준다.
// onChange(paths) 는 studio/ 기준 상대 경로 목록을 받는다. 연결 직후에는 paths = null.
export function useStudioEvents(onChange) {
  const [live, setLive] = useState('connecting');
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    let es;
    let retry;
    const connect = () => {
      es = new EventSource('/api/events');
      es.onopen = () => setLive('live');
      es.onerror = () => { setLive('down'); es.close(); retry = setTimeout(connect, 2000); };
      es.onmessage = (msg) => {
        const ev = JSON.parse(msg.data);
        if (ev.type === 'hello') handler.current(null);
        else if (ev.type === 'change') handler.current(ev.paths);
      };
    };
    connect();
    return () => { clearTimeout(retry); es?.close(); };
  }, []);

  return live;
}
