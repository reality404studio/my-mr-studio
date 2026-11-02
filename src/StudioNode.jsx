import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { TYPES, STATUSES, actorLabel, isAgent, timeAgo } from './constants.js';

function StudioNode({ data, selected }) {
  const type = TYPES[data.type] || TYPES.note;
  return (
    <div className={`node node--${data.type} is-${data.status}${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node__top">
        <span className="node__type">{type.label}</span>
        <span className="node__status">
          <span className="dot" aria-hidden="true" />
          {STATUSES[data.status] || data.status}
        </span>
      </div>
      <h3 className="node__title">{data.title}</h3>
      {data.thumbs?.length > 0 && (
        <div className={`node__thumbs n${Math.min(data.thumbs.length, 4)}`}>
          {data.thumbs.map((src) => <img key={src} src={src} alt="" loading="lazy" draggable={false} />)}
        </div>
      )}
      {data.notesPreview && <p className="node__preview">{data.notesPreview}</p>}
      <div className="node__foot">
        <span className="node__owner">{data.owner || '담당 없음'}</span>
        <span className={isAgent(data.updatedBy) ? 'node__by is-agent' : 'node__by'}>
          {data.assetCount > 0 && `파일 ${data.assetCount} · `}
          {actorLabel(data.updatedBy)} {timeAgo(data.updatedAt)}
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default memo(StudioNode);
