export const TYPES = {
  reference: { label: '레퍼런스', hint: '무드보드, 사진, 참고 자료' },
  concept: { label: '콘셉트', hint: '기준안, 깰 지점, 방향' },
  prompt: { label: '프롬프트', hint: '이미지·영상 생성 프롬프트' },
  video: { label: '영상', hint: '생성한 참조 영상' },
  storyboard: { label: '스토리보드', hint: '컷별 행동과 반응' },
  spec: { label: '명세', hint: '원본을 구현 명세로 번역' },
  build: { label: '구현', hint: 'Unity 작업, 프로토타입' },
  review: { label: '검수', hint: '실기 확인, 사용성 테스트' },
  note: { label: '메모', hint: '결정, 질문, 자유 메모' },
  shared: { label: '공통', hint: '공통 캔버스의 단계를 가져와 연결' },
};

export const STATUSES = {
  todo: '대기',
  doing: '진행 중',
  review: '확인 필요',
  done: '완료',
  blocked: '막힘',
};

export const KINDS = {
  decide: '결정',
  collect: '수집',
  analyze: '분석',
  write: '작성',
  make: '생성',
  build: '구현',
  verify: '검증',
};

export const ACTORS = { human: '사람', agent: '에이전트' };

// 앱 하나를 보는 네 가지 화면. 같은 파일을 읽고, 보여주는 방식만 다르다.
export const VIEWS = [
  { id: 'human', label: '사람 화면', hint: '고르고 답하기만' },
  { id: 'spec', label: '명세', hint: '진실의 원천 · 빈칸 지도' },
  { id: 'ledger', label: '에이전트 장부', hint: '단계 > 과업 > 하위 과업' },
  { id: 'drawer', label: '결정 서랍', hint: '제약 · 내 눈 · 보류 · 번역표' },
];
export const SHARED_VIEWS = [
  { id: 'ledger', label: '공통 보드', hint: '모든 앱이 함께 쓰는 과업' },
  { id: 'drawer', label: '결정 서랍', hint: '제약 · 내 눈 · 보류 · 번역표' },
];

export const FIELD_STATES = {
  settled: { label: '정해짐', hint: '값이 있고 열린 가정이 없음' },
  inferred: { label: '추정', hint: '에이전트가 메운 값. 확인 전' },
  empty: { label: '빈칸', hint: '아직 아무도 안 채움' },
  unknown: { label: '모름', hint: '누군가 답해야 함' },
};
export const ENTRY_TYPES = { assume: '가정', compromise: '타협', unknown: '모름' };
export const CONFIDENCE = { high: '확신 상', mid: '확신 중', low: '확신 하' };
export const ENTRY_STATUS = { open: '열림', confirmed: '맞음', rejected: '틀림', accepted: '괜찮음', reopened: '다시 하기', answered: '답함' };
export const ATTEMPT_RESULTS = { ok: '통과', fail: '실패', pending: '확인 대기' };
export const DRAWER_KINDS = {
  constraint: { label: '제약', hint: '기기·기술 조건. 거의 안 바뀜' },
  taste: { label: '내 눈', hint: '고르거나 버린 이유. 계속 쌓임' },
  hold: { label: '보류', hint: '지금은 안 함. 조건이 바뀌면 다시 꺼냄' },
  vocab: { label: '번역표', hint: '내 말이 실제로 무엇을 바꾸는지' },
};
export const VERDICT = {
  thin: { label: '디렉션이 아직 부족해요', hint: '사람이 답할 질문이나 확신 낮은 추정이 남아 있어요' },
  ok: { label: '진행할 만해요', hint: '급한 질문은 없지만, 확인할 추정이나 빈칸이 남아 있어요' },
  solid: { label: '충분해요', hint: '열린 가정도 빈칸도 없어요' },
};

export function viewHref(pid, view, node) {
  const base = pid === 'shared' ? '#/shared' : `#/app/${encodeURIComponent(pid)}`;
  const v = view && !(pid === 'shared' && view === 'ledger') && !(pid !== 'shared' && view === 'human') ? `/${view}` : '';
  return `${base}${v}${node ? `?node=${encodeURIComponent(node)}` : ''}`;
}

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
  'node.create': '과업 추가',
  'node.update': '수정',
  'node.archive': '보관',
  'notes.write': '메모 저장',
  'notes.append': '메모 덧붙임',
  'edge.create': '연결',
  'edge.delete': '연결 삭제',
  'asset.add': '파일 추가',
  'asset.memo': '파일 메모',
  'asset.archive': '파일 보관',
  'studio.init': '스튜디오 정리',
  'app.create': '앱 만듦',
  'sub.create': '하위 과업 추가',
  'node.move': '순서 변경',
  'stage.create': '단계 추가',
  'stage.update': '단계 수정',
  'stage.delete': '단계 삭제',
  'knowledge.assume': '가정 남김',
  'knowledge.compromise': '타협 남김',
  'knowledge.unknown': '질문 남김',
  'knowledge.answer': '답함',
  'knowledge.confirm': '가정 확인',
  'knowledge.reject': '가정 틀림',
  'knowledge.accept': '타협 수용',
  'knowledge.reopen': '타협 되돌림',
  attempt: '시도',
  reopen: '다시 열기',
  'drawer.add': '서랍에 넣음',
  'drawer.update': '서랍 수정',
};

export function actionLabel(action) {
  return ACTIONS[action] || action;
}
