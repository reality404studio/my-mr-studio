import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { TYPES, STATUSES, KINDS, ACTORS, actorLabel, timeAgo } from './constants.js';

// 카드 크기는 레이아웃 계산과 CSS 가 같은 숫자를 쓴다.
export const G = {
  laneW: 320,
  laneGap: 36,
  laneHead: 92,
  pad: 16,
  taskW: 288,
  taskGap: 14,
  head: 88,
  progress: 14,
  row: 28,
  rowsPad: 8,
  preview: 44,
  thumbs: 52,
  foot: 34,
  tags: 26,
};

export function taskHeight(n) {
  const subs = n.children?.length || 0;
  return G.head + (subs ? G.progress + subs * G.row + G.rowsPad : G.preview) + (n.thumbs?.length ? G.thumbs : 0) + (ledgerTags(n).length ? G.tags : 0) + G.foot + 2;
}

// 카드 아래 작은 표시: 열린 세 칸, 시도와 실패, 다시 열림, 헤맴
export function ledgerTags(n) {
  const l = n.ledger;
  if (!l) return [];
  const t = [];
  if (l.stuck) t.push({ k: 'stuck', label: '헤맴' });
  if (l.unknown) t.push({ k: 'unknown', label: `모름 ${l.unknown}` });
  if (l.assume) t.push({ k: 'assume', label: `가정 ${l.assume}${l.lowAssume ? ` (하 ${l.lowAssume})` : ''}` });
  if (l.compromise) t.push({ k: 'compromise', label: `타협 ${l.compromise}` });
  if (l.attempts) t.push({ k: 'attempt', label: `시도 ${l.attempts}${l.fails ? ` · 실패 ${l.fails}` : ''}` });
  if (l.reopened) t.push({ k: 'reopen', label: `되돌림 ${l.reopened}` });
  return t;
}

function LaneNodeImpl({ data }) {
  const { stage, index, total, count, done, onAdd, onEdit } = data;
  return (
    <div className="lane" style={{ width: G.laneW, height: data.height }}>
      <div className="lane__head">
        <div className="lane__row">
          <span className="lane__index">{index + 1}</span>
          <h2 className="lane__title">{stage.title}</h2>
          <span className="lane__count">{done}/{count}</span>
        </div>
        {stage.goal && <p className="lane__goal">{stage.goal}</p>}
        <div className="lane__tools nodrag">
          <button onClick={() => onAdd(stage.id)}>과업 추가</button>
          <button onClick={() => onEdit(stage.id, 'rename')} aria-label={`${stage.title} 단계 이름 바꾸기`}>이름</button>
          {index > 0 && <button onClick={() => onEdit(stage.id, 'left')} aria-label="왼쪽으로">←</button>}
          {index < total - 1 && <button onClick={() => onEdit(stage.id, 'right')} aria-label="오른쪽으로">→</button>}
          {count === 0 && total > 1 && <button onClick={() => onEdit(stage.id, 'delete')}>지우기</button>}
        </div>
      </div>
    </div>
  );
}
export const LaneNode = memo(LaneNodeImpl);

function AddLaneImpl({ data }) {
  return (
    <button className="lane-add nodrag" style={{ height: data.height }} onClick={data.onAddStage}>
      <span aria-hidden="true">+</span>
      단계 추가
    </button>
  );
}
export const AddLaneNode = memo(AddLaneImpl);

function TaskNodeImpl({ data }) {
  const n = data.node;
  const type = TYPES[n.type] || TYPES.note;
  const isRef = n.type === 'shared';
  const subs = data.subs || [];
  const waiting = n.waitingOn?.length || 0;
  return (
    <div
      className={`task node--${n.type} is-${n.status}${data.selected ? ' is-selected' : ''}${waiting && n.status !== 'done' ? ' is-waiting' : ''}`}
      style={{ width: G.taskW, height: taskHeight(n) }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="task__top">
        <span className="task__type">{type.label}</span>
        <span className="task__status"><span className="dot" aria-hidden="true" />{isRef && !n.refNode ? '대상 없음' : STATUSES[n.status]}</span>
      </div>
      <h3 className="task__title">{n.title || (isRef ? '공통 과업 고르기' : '')}</h3>

      {subs.length > 0 && (
        <>
          <div className="task__progress" aria-label={`하위 과업 ${n.progress.done}/${n.progress.total} 완료`}>
            <span style={{ width: `${(n.progress.done / n.progress.total) * 100}%` }} />
          </div>
          <ol className="subs">
            {subs.map((c) => (
              <li key={c.id}>
                <button
                  className={`sub is-${c.status}${c.isCurrent ? ' is-current' : ''}${data.selectedSub === c.id ? ' is-selected' : ''}`}
                  onClick={(e) => { e.stopPropagation(); data.onSelect(c.id); }}
                  title={c.how || c.title}
                >
                  <span className="dot" aria-hidden="true" />
                  <span className={`kind kind--${c.kind}`}>{KINDS[c.kind] || c.kind}</span>
                  <span className="sub__title">{c.title}</span>
                  <span className={`by by--${c.by}`}>{c.by === 'human' ? '사람' : 'AI'}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      {subs.length === 0 && (
        <p className="task__preview">
          {isRef ? (n.refNode ? `공통 보드에서 관리해요${n.refNode.progress?.total ? ` · ${n.refNode.progress.done}/${n.refNode.progress.total}` : ''}` : '오른쪽 패널에서 가져올 공통 과업을 골라요')
            : n.goal || n.notesPreview || '하위 과업이 없어요'}
        </p>
      )}
      {n.thumbs?.length > 0 && (
        <div className="task__thumbs">
          {n.thumbs.map((src) => <img key={src} src={src} alt="" loading="lazy" draggable={false} />)}
        </div>
      )}
      {ledgerTags(n).length > 0 && (
        <div className="task__tags">
          {ledgerTags(n).map((t) => <span key={t.k} className={`ltag ltag--${t.k}`}>{t.label}</span>)}
        </div>
      )}
      <div className="task__foot">
        <span className="task__owner">{n.owner || '담당 없음'}</span>
        <span className="task__meta">
          {waiting > 0 && n.status !== 'done' ? `앞 과업 ${waiting}개 기다림` : n.usedBy?.length ? `앱 ${n.usedBy.length}개가 사용` : n.assetCount ? `파일 ${n.assetCount}` : `${actorLabel(isRef ? n.refNode?.updatedBy : n.updatedBy)} ${timeAgo(isRef ? n.refNode?.updatedAt : n.updatedAt)}`}
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
export const TaskNode = memo(TaskNodeImpl);

export { ACTORS };
