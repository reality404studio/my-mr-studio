export const TYPES = {
  reference: { label: '레퍼런스', hint: '무드보드, 사진, 참고 자료' },
  concept: { label: '콘셉트', hint: '기준안, 깰 지점, 방향' },
  prompt: { label: '프롬프트', hint: '이미지·영상 생성 프롬프트' },
  video: { label: '영상', hint: '생성한 참조 영상' },
  spec: { label: '명세', hint: '영상을 구현 명세로 번역' },
  build: { label: '구현', hint: 'Unity 작업' },
  review: { label: '검수', hint: '실기 녹화와 원본 비교' },
  note: { label: '메모', hint: '결정, 질문, 자유 메모' },
};

export const STATUSES = {
  todo: '대기',
  doing: '진행 중',
  review: '확인 필요',
  done: '완료',
  blocked: '막힘',
};

export const OWNER_SUGGESTIONS = ['나', 'Claude Code', 'Claude', 'Codex', 'Gemini'];

export function actorLabel(actor) {
  if (!actor || actor === 'human') return '나';
  return actor.replace(/^agent:/, '');
}

export function isAgent(actor) {
  return actor && actor !== 'human';
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return '방금';
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
  return `${Math.round(s / 86400)}일 전`;
}

const ACTIONS = {
  'node.create': '단계 추가',
  'node.update': '수정',
  'node.archive': '단계 보관',
  'notes.write': '메모 저장',
  'notes.append': '메모 덧붙임',
  'edge.create': '연결',
  'edge.delete': '연결 삭제',
  'asset.add': '파일 추가',
  'asset.memo': '파일 메모',
  'asset.archive': '파일 보관',
  'studio.init': '스튜디오 생성',
};

export function actionLabel(action) {
  return ACTIONS[action] || action;
}
