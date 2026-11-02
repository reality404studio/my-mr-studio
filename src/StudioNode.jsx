import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { TYPES, STATUSES, actorLabel, isAgent, timeAgo } from './constants.js';

function StudioNode({ data, selected }) {
  const type = TYPES[data.type] || TYPES.note;
  const isRef = data.type === 'shared';
  return (
    <div className={`node node--${data.type} is-${data.status}${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node__top">
        <span className="node__type">{type.label}</span>
        <span className="node__status">
          <span className="dot" aria-hidden="true" />
          {isRef && !data.refNode ? '연결 대상 없음' : STATUSES[data.status] || data.status}
        </span>
      </div>
      <h3 className="node__title">{data.title || (isRef ? '공통 단계 고르기' : '')}</h3>
      {data.thumbs?.length > 0 && (
        <div className={`node__thumbs n${Math.min(data.thumbs.length, 4)}`}>
          {data.thumbs.map((src) => <img key={src} src={src} alt="" loading="lazy" draggable={false} />)}
        </div>
      )}
      {isRef
        ? <p className="node__preview">{data.refNode ? '공통 캔버스에서 관리하는 단계예요. 상태는 공통을 따라가요.' : '오른쪽 패널에서 가져올 공통 단계를 골라요.'}</p>
        : data.notesPreview && <p className="node__preview">{data.notesPreview}</p>}
      {data.usedBy?.length > 0 && (
        <p className="node__used">{data.usedBy.map((u) => u.name).join(', ')}에서 사용 중</p>
      )}
      <div className="node__foot">
        <span className="node__owner">{data.owner || '담당 없음'}</span>
        <span className={isAgent(isRef ? data.refNode?.updatedBy : data.updatedBy) ? 'node__by is-agent' : 'node__by'}>
          {data.assetCount > 0 && `파일 ${data.assetCount} · `}
          {isRef
            ? data.refNode && `${actorLabel(data.refNode.updatedBy)} ${timeAgo(data.refNode.updatedAt)}`
            : `${actorLabel(data.updatedBy)} ${timeAgo(data.updatedAt)}`}
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default memo(StudioNode);
